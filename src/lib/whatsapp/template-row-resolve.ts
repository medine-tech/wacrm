import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Thrown when a name-only fallback lookup matches more than one
 * language — the caller must pass template_language explicitly.
 */
export class TemplateResolutionError extends Error {}

export interface ResolveTemplateRowArgs {
  db: SupabaseClient
  accountId: string
  templateName: string
  templateLanguage?: string | null
  provider: 'meta' | 'twilio'
}

/**
 * Resolve the local message_templates row for a template send.
 *
 * Meta: exact (name, language) with the historical 'en_US' default —
 * a miss is benign because Meta resolves name+language server-side.
 *
 * Twilio: the send is keyed on twilio_content_sid, so the row is
 * mandatory — but Twilio Content templates sync with Twilio language
 * codes ('en'), while callers often default to Meta's 'en_US'. When
 * the exact lookup misses on Twilio, fall back to a name-only lookup
 * if it is unambiguous, and surface an explicit error when several
 * languages exist.
 */
export async function resolveTemplateRowForSend(
  args: ResolveTemplateRowArgs
): Promise<{ row: Record<string, unknown> | null; language: string }> {
  const { db, accountId, templateName, provider } = args
  const language = args.templateLanguage || 'en_US'

  const { data } = await db
    .from('message_templates')
    .select('*')
    .eq('account_id', accountId)
    .eq('name', templateName)
    .eq('language', language)
    .maybeSingle()
  if (data || provider !== 'twilio') {
    return { row: data ?? null, language }
  }

  const { data: candidates } = await db
    .from('message_templates')
    .select('*')
    .eq('account_id', accountId)
    .eq('name', templateName)
    .limit(2)
  if (!candidates || candidates.length === 0) {
    return { row: null, language }
  }
  if (candidates.length > 1) {
    throw new TemplateResolutionError(
      `Multiple languages exist for template "${templateName}" — pass template_language`
    )
  }
  const row = candidates[0] as Record<string, unknown>
  const rowLanguage = typeof row.language === 'string' ? row.language : language
  return { row, language: rowLanguage }
}
