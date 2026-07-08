import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Server-side persist for INBOUND media (Twilio webhook ingest).
 *
 * The existing upload-media.ts helper is browser-oriented — it builds
 * an anon client, resolves the account from the signed-in session, and
 * relies on the bucket's account-scoped RLS write policies. Webhook
 * routes have no session, so this helper uses the service-role client
 * instead, while keeping the same `account-<account_id>/…` first path
 * segment convention from migrations 020/023 so all objects stay
 * account-partitioned.
 *
 * Bucket note: 'chat-media' is public (Meta/Twilio must be able to
 * fetch outbound links) with a 16 MB cap and a MIME allowlist
 * (migration 023). An inbound MIME outside the allowlist makes the
 * upload fail — callers treat any failure as media_url = null and
 * still insert the message row.
 */

export const CHAT_MEDIA_BUCKET = 'chat-media'

// Lazy, module-level service-role client — same convention as the
// webhook routes' supabaseAdmin(), avoids a build-time crash when env
// vars are missing.
let _adminClient: SupabaseClient | null = null
function storageAdmin(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _adminClient
}

// Provider media comes with a MIME type but no filename — derive the
// extension from the MIME so the public URL stays recognizable to
// browsers and to the inbox's media bubbles.
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/vcard': 'vcf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'pptx',
}

export function inboundMediaExtension(contentType: string): string {
  const mime = contentType.split(';')[0].trim().toLowerCase()
  const mapped = EXTENSION_BY_MIME[mime]
  if (mapped) return mapped
  const subtype = mime.split('/')[1] ?? ''
  return /^[a-z0-9]{1,5}$/.test(subtype) ? subtype : 'bin'
}

export interface BuildInboundMediaPathArgs {
  accountId: string
  contentType: string
  /** Index of the media on the inbound message (Twilio: MediaUrl{N}). */
  mediaIndex?: number
  now?: number
}

/** `account-<account_id>/<timestamp>-inbound-<n>.<ext>` — pure + exported
 *  so it can be unit-tested without a Supabase client. */
export function buildInboundMediaPath(args: BuildInboundMediaPathArgs): string {
  const { accountId, contentType, mediaIndex = 0, now = Date.now() } = args
  return `account-${accountId}/${now}-inbound-${mediaIndex}.${inboundMediaExtension(contentType)}`
}

export interface SaveInboundMediaArgs {
  accountId: string
  buffer: Buffer
  contentType: string
  mediaIndex?: number
}

export interface SaveInboundMediaResult {
  /** Public URL stored in messages.media_url. */
  publicUrl: string
  /** Storage object path (account-scoped). */
  path: string
}

/**
 * Upload downloaded inbound media bytes to the public chat-media bucket
 * and return the public URL. Throws on upload failure — callers catch
 * and fall back to media_url = null (mirroring the Meta path's
 * verifyAndBuildUrl null-on-failure) so the message row still lands.
 */
export async function saveInboundMedia(
  args: SaveInboundMediaArgs
): Promise<SaveInboundMediaResult> {
  const { accountId, buffer, contentType, mediaIndex = 0 } = args
  const supabase = storageAdmin()

  const path = buildInboundMediaPath({ accountId, contentType, mediaIndex })
  const { error } = await supabase.storage
    .from(CHAT_MEDIA_BUCKET)
    .upload(path, buffer, {
      cacheControl: '3600',
      upsert: false,
      contentType,
    })
  if (error) {
    throw new Error(`Inbound media upload failed: ${error.message}`)
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(CHAT_MEDIA_BUCKET).getPublicUrl(path)

  return { publicUrl, path }
}
