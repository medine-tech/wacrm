import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Lazy, shared service-role Supabase client for server-side work that
// must bypass RLS (webhook ingestion, engines, cron sweeps). The
// service-role key is never exposed client-side — importing this module
// into client code would leak it, so it stays server-only.
let _adminClient: SupabaseClient | null = null

export function supabaseAdmin(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
  }
  return _adminClient
}
