import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/whatsapp/encryption'
import { normalizeStatus } from '@/lib/whatsapp/template-status-normalize'
import {
  mapTwilioContentToRow,
  type TwilioContentItem,
} from '@/lib/whatsapp/twilio-content-map'
import type { TemplateButton, TemplateSampleValues } from '@/types'

/**
 * Sync message templates from the provider → local message_templates
 * table.
 *
 * Meta: the local catalog stores Meta's status enum verbatim (APPROVED /
 * PENDING / REJECTED / PAUSED / DISABLED / IN_APPEAL / PENDING_DELETION)
 * so the edit / resubmit / delete flows can distinguish recoverable
 * states (PAUSED) from terminal ones (DISABLED) and so webhook events
 * land 1:1 without a translation table.
 *
 * Twilio: templates live in the Twilio Console as Content templates;
 * Sync imports them (ContentAndApprovals) with their WhatsApp approval
 * status. Twilio has no status webhook — this poll is the only source.
 *
 * Locally-created templates (no provider counterpart) are NOT deleted —
 * they remain visible so the user can notice drift and clean up.
 */

const META_API_VERSION = 'v21.0'
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`
const TWILIO_CONTENT_BASE = 'https://content.twilio.com/v1'
const PAGE_CAP = 20

interface MetaButton {
  type: string
  text: string
  url?: string
  phone_number?: string
  example?: string[] | string
}

interface MetaTemplateComponent {
  type: string
  text?: string
  format?: string
  buttons?: MetaButton[]
  example?: {
    header_text?: string[]
    header_handle?: string[]
    body_text?: string[][]
  }
}

interface MetaTemplate {
  id: string
  name: string
  language: string
  status: string
  category: string
  components?: MetaTemplateComponent[]
  quality_score?: { score?: string } | string
}

function normalizeCategory(
  meta: string,
): 'Marketing' | 'Utility' | 'Authentication' {
  const upper = meta.toUpperCase()
  if (upper === 'UTILITY') return 'Utility'
  if (upper === 'AUTHENTICATION') return 'Authentication'
  return 'Marketing'
}

function normalizeQualityScore(
  raw: MetaTemplate['quality_score'],
): 'GREEN' | 'YELLOW' | 'RED' | null {
  const score =
    typeof raw === 'string' ? raw : raw?.score ? String(raw.score) : null
  if (!score) return null
  const upper = score.toUpperCase()
  return upper === 'GREEN' || upper === 'YELLOW' || upper === 'RED'
    ? (upper as 'GREEN' | 'YELLOW' | 'RED')
    : null
}

function parseButtons(metaButtons: MetaButton[] | undefined): TemplateButton[] {
  if (!metaButtons?.length) return []
  const out: TemplateButton[] = []
  for (const b of metaButtons) {
    switch (b.type?.toUpperCase()) {
      case 'QUICK_REPLY':
        out.push({ type: 'QUICK_REPLY', text: b.text })
        break
      case 'URL':
        out.push({
          type: 'URL',
          text: b.text,
          url: b.url ?? '',
          example: Array.isArray(b.example) ? b.example[0] : b.example,
        })
        break
      case 'PHONE_NUMBER':
        out.push({
          type: 'PHONE_NUMBER',
          text: b.text,
          phone_number: b.phone_number ?? '',
        })
        break
      case 'COPY_CODE':
        out.push({
          type: 'COPY_CODE',
          text: b.text,
          example: Array.isArray(b.example) ? b.example[0] ?? '' : b.example ?? '',
        })
        break
      // OTP, FLOW, etc — out of scope for v1; drop silently.
    }
  }
  return out
}

function extractSampleValues(
  body: MetaTemplateComponent | undefined,
  header: MetaTemplateComponent | undefined,
): TemplateSampleValues | null {
  // Meta returns body_text as a 2D array — one row per example set.
  // We take the first row (most templates have exactly one).
  const bodySample = body?.example?.body_text?.[0]
  const headerSample = header?.example?.header_text
  if (!bodySample?.length && !headerSample?.length) return null
  const sv: TemplateSampleValues = {}
  if (bodySample?.length) sv.body = bodySample
  if (headerSample?.length) sv.header = headerSample
  return sv
}

interface TemplateSyncError {
  name: string
  language: string
  message: string
}

interface TemplateRowUpsert {
  name: string
  language: string
  [column: string]: unknown
}

/**
 * Shared select-then-update/insert loop keyed on (account_id, name,
 * language) — the same discipline for both providers. Per-row errors
 * are collected, never thrown, so one bad row doesn't abort the sync.
 */
async function upsertTemplateRows(
  supabase: SupabaseClient,
  accountId: string,
  rows: TemplateRowUpsert[],
): Promise<{ inserted: number; updated: number; errors: TemplateSyncError[] }> {
  let inserted = 0
  let updated = 0
  const errors: TemplateSyncError[] = []

  for (const row of rows) {
    const { data: existing, error: lookupErr } = await supabase
      .from('message_templates')
      .select('id')
      .eq('account_id', accountId)
      .eq('name', row.name)
      .eq('language', row.language)
      .maybeSingle()

    if (lookupErr) {
      errors.push({
        name: row.name,
        language: row.language,
        message: lookupErr.message,
      })
      continue
    }

    if (existing?.id) {
      const { error: updErr } = await supabase
        .from('message_templates')
        .update(row)
        .eq('id', existing.id)
      if (updErr) {
        errors.push({
          name: row.name,
          language: row.language,
          message: updErr.message,
        })
      } else {
        updated++
      }
    } else {
      const { error: insErr } = await supabase
        .from('message_templates')
        .insert(row)
      if (insErr) {
        errors.push({
          name: row.name,
          language: row.language,
          message: insErr.message,
        })
      } else {
        inserted++
      }
    }
  }

  return { inserted, updated, errors }
}

interface TwilioSyncArgs {
  supabase: SupabaseClient
  config: {
    access_token: string
    twilio_account_sid?: string | null
    twilio_api_key_sid?: string | null
  }
  accountId: string
  userId: string
}

async function syncTwilioContentTemplates(
  args: TwilioSyncArgs,
): Promise<NextResponse> {
  const { supabase, config, accountId, userId } = args

  if (!config.twilio_account_sid) {
    return NextResponse.json(
      {
        error:
          'Twilio Account SID missing. Re-save your WhatsApp configuration in Settings.',
      },
      { status: 400 },
    )
  }

  const authSecret = decrypt(config.access_token)
  const username = config.twilio_api_key_sid || config.twilio_account_sid
  const authHeader =
    'Basic ' + Buffer.from(`${username}:${authSecret}`).toString('base64')

  const contents: TwilioContentItem[] = []
  let nextUrl:
    | string
    | null = `${TWILIO_CONTENT_BASE}/ContentAndApprovals?PageSize=100`
  let pageCount = 0

  while (nextUrl && pageCount < PAGE_CAP) {
    pageCount++
    const twilioRes: Response = await fetch(nextUrl, {
      headers: { Authorization: authHeader },
    })

    if (!twilioRes.ok) {
      let twilioErr = `Twilio Content API error: ${twilioRes.status}`
      try {
        const body = await twilioRes.json()
        if (body?.message) twilioErr = body.message
      } catch {
        // response wasn't JSON — keep the fallback
      }
      return NextResponse.json({ error: twilioErr }, { status: 502 })
    }

    const twilioBody: {
      contents?: TwilioContentItem[]
      meta?: { next_page_url?: string | null }
    } = await twilioRes.json()
    if (twilioBody.contents) contents.push(...twilioBody.contents)
    nextUrl = twilioBody.meta?.next_page_url ?? null
  }

  // Twilio does not enforce friendly_name uniqueness (the SID is the
  // only unique key; approved-Content revisions reuse the name), but
  // local rows are keyed on (name, language) — collapsing duplicates
  // last-listed-wins could shadow an approved template with a draft.
  // Keep the approved item per (name, language) and surface the rest.
  const duplicateErrors: TemplateSyncError[] = []
  const byKey = new Map<string, TwilioContentItem>()
  for (const item of contents) {
    const language = item.language || 'en'
    const key = `${item.friendly_name}\u0000${language}`
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, item)
      continue
    }
    const keepNew =
      item.approval_requests?.status?.toLowerCase() === 'approved' &&
      existing.approval_requests?.status?.toLowerCase() !== 'approved'
    const kept = keepNew ? item : existing
    const skipped = keepNew ? existing : item
    byKey.set(key, kept)
    duplicateErrors.push({
      name: item.friendly_name,
      language,
      message: `Duplicate Twilio Content templates share this name+language; kept ${kept.sid} (${kept.approval_requests?.status ?? 'unknown'}), skipped ${skipped.sid} (${skipped.approval_requests?.status ?? 'unknown'})`,
    })
  }

  const rows = [...byKey.values()].map((item) => ({
    account_id: accountId,
    user_id: userId,
    ...mapTwilioContentToRow(item),
    updated_at: new Date().toISOString(),
  }))

  const { inserted, updated, errors } = await upsertTemplateRows(
    supabase,
    accountId,
    rows,
  )
  errors.push(...duplicateErrors)

  return NextResponse.json({
    success: errors.length === 0,
    total: contents.length,
    inserted,
    updated,
    errors,
    truncated: pageCount >= PAGE_CAP && nextUrl !== null,
  })
}

export async function POST() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Resolve the caller's account_id — both whatsapp_config and
    // the message_templates we sync into are account-scoped.
    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle()
    const accountId = profile?.account_id as string | undefined
    if (!accountId) {
      return NextResponse.json(
        { error: 'Your profile is not linked to an account.' },
        { status: 403 },
      )
    }

    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', accountId)
      .single()

    if (configError || !config) {
      return NextResponse.json(
        {
          error:
            'WhatsApp not configured. Connect your WhatsApp Business account in Settings first.',
        },
        { status: 400 },
      )
    }

    if (config.provider === 'twilio') {
      return syncTwilioContentTemplates({
        supabase,
        config,
        accountId,
        userId: user.id,
      })
    }

    if (!config.waba_id) {
      return NextResponse.json(
        {
          error:
            'WABA (WhatsApp Business Account) ID missing. Re-connect your account in Settings.',
        },
        { status: 400 },
      )
    }

    const accessToken = decrypt(config.access_token)

    const metaTemplates: MetaTemplate[] = []
    let nextUrl:
      | string
      | null = `${META_API_BASE}/${config.waba_id}/message_templates?limit=100&fields=id,name,language,status,category,components,quality_score`
    let pageCount = 0

    while (nextUrl && pageCount < PAGE_CAP) {
      pageCount++
      const metaRes: Response = await fetch(nextUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      if (!metaRes.ok) {
        let metaErr = `Meta API error: ${metaRes.status}`
        try {
          const body = await metaRes.json()
          if (body?.error?.message) metaErr = body.error.message
        } catch {
          // response wasn't JSON — keep the fallback
        }
        return NextResponse.json({ error: metaErr }, { status: 502 })
      }

      const metaBody: {
        data?: MetaTemplate[]
        paging?: { next?: string }
      } = await metaRes.json()
      if (metaBody.data) metaTemplates.push(...metaBody.data)
      nextUrl = metaBody.paging?.next ?? null
    }

    const rows = metaTemplates.map((t) => {
      const body = (t.components ?? []).find((c) => c.type === 'BODY')
      const header = (t.components ?? []).find((c) => c.type === 'HEADER')
      const footer = (t.components ?? []).find((c) => c.type === 'FOOTER')
      const buttons = (t.components ?? []).find((c) => c.type === 'BUTTONS')

      const parsedButtons = parseButtons(buttons?.buttons)
      const sampleValues = extractSampleValues(body, header)

      const headerFormat = header?.format?.toUpperCase()
      const headerType =
        headerFormat === 'TEXT' ||
        headerFormat === 'IMAGE' ||
        headerFormat === 'VIDEO' ||
        headerFormat === 'DOCUMENT'
          ? headerFormat.toLowerCase()
          : null

      return {
        // Account tenancy + user audit, same split as the submit
        // route. account_id is NOT NULL on message_templates
        // post-017, so an INSERT without it errors.
        account_id: accountId,
        user_id: user.id,
        name: t.name,
        category: normalizeCategory(t.category),
        language: t.language,
        header_type: headerType,
        header_content: header?.text ?? null,
        header_handle: header?.example?.header_handle?.[0] ?? null,
        body_text: body?.text ?? '',
        footer_text: footer?.text ?? null,
        buttons: parsedButtons.length ? parsedButtons : null,
        sample_values: sampleValues,
        status: normalizeStatus(t.status),
        meta_template_id: t.id,
        quality_score: normalizeQualityScore(t.quality_score),
        updated_at: new Date().toISOString(),
      }
    })

    const { inserted, updated, errors } = await upsertTemplateRows(
      supabase,
      accountId,
      rows,
    )

    return NextResponse.json({
      success: errors.length === 0,
      total: metaTemplates.length,
      inserted,
      updated,
      errors,
      truncated: pageCount >= PAGE_CAP && nextUrl !== null,
    })
  } catch (error) {
    console.error('Error syncing WhatsApp templates:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to sync templates',
      },
      { status: 500 },
    )
  }
}
