// Re-export the canonical shared service-role client. Kept as a
// module so the automation engine's existing `./admin-client` imports
// stay valid while the implementation lives in one place.
export { supabaseAdmin } from '@/lib/supabase/admin'
