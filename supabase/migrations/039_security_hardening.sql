-- ============================================================
-- Production security hardening (Supabase Security Advisor findings)
--
-- Addresses the WARN-level lints on the production project:
--   1. function_search_path_mutable — pin search_path on 4 functions.
--   2. anon/authenticated_security_definer_function_executable — revoke
--      EXECUTE from the client roles on functions that are only invoked
--      by triggers or server-side (service_role) code, and drop anon
--      from the authenticated-only RPCs. service_role keeps its DIRECT
--      grant (so server calls are unaffected) and trigger functions run
--      as their definer regardless of EXECUTE grants.
--   3. rls_enabled_no_policy (automation_pending_executions) — add an
--      explicit deny-all policy documenting that only service_role
--      (which bypasses RLS) touches this internal queue.
--   4. public_bucket_allows_listing — drop the broad public SELECT
--      policies that let anyone ENUMERATE objects in the public buckets.
--      Public-URL reads (the only access the app uses) are served by the
--      public-bucket endpoint without RLS, so rendering is unaffected;
--      this closes anonymous + cross-tenant object listing.
--
-- Deliberately NOT changed (documented, low-reward / high-risk):
--   - extension_in_public (vector, pg_net): moving installed extensions
--     to a dedicated schema post-hoc breaks the pgvector column types
--     and the pg_net trigger for a namespace-hygiene WARN. Left in place.
--   - peek_invitation (anon+authenticated by design — the pre-login
--     /join page) and is_account_member (RLS helper that must stay
--     executable by the querying role): their lints are expected.
-- ============================================================

-- ---- 1. Pin search_path on the flagged functions -----------
-- All four only call now()/array literals (pg_catalog, always in path),
-- so an empty search_path is safe and maximally hardened.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'update_updated_at_column',
        '_bcast_cols_for_status',
        'update_ai_configs_updated_at',
        'update_ai_knowledge_documents_updated_at'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = ''''', r.sig);
  END LOOP;
END $$;

-- ---- 2a. Deny client EXECUTE on trigger + server-only funcs -
-- Trigger functions fire as their definer (no EXECUTE needed by the
-- writer); server-only functions are called with service_role, which
-- retains its own direct grant. So revoking PUBLIC/anon/authenticated
-- removes the needless client surface without breaking anything.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        -- trigger functions
        'broadcast_recipient_aggregate_trigger',
        'handle_new_user',
        'notify_conversation_assigned',
        'notify_new_message',
        'notify_push_dispatch',
        -- server-side (service_role) callables
        'claim_ai_reply_slot',
        'record_webhook_failure',
        '_bcast_bump',
        'recompute_broadcast_counts',
        'merge_duplicate_contacts'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;

-- Re-affirm service_role EXECUTE on the two functions the server calls
-- at runtime with the service-role client, so they never depend on the
-- implicit PUBLIC grant we just revoked (defensive; matches migration
-- 031's pattern for claim_ai_reply_slot).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('claim_ai_reply_slot', 'record_webhook_failure')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- ---- 2b. Drop anon from authenticated-only client RPCs ------
-- These are called by signed-in users; keep authenticated (+ its direct
-- service_role grant), remove PUBLIC + anon.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'touch_presence',
        'redeem_invitation',
        'remove_account_member',
        'set_member_role',
        'transfer_account_ownership'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END $$;

-- ---- 3. Explicit deny-all on the internal queue table ------
-- automation_pending_executions is written/drained only by the
-- service-role cron (which bypasses RLS). An explicit false policy
-- documents that intent and satisfies rls_enabled_no_policy without
-- granting any client access.
DROP POLICY IF EXISTS automation_pending_executions_no_client_access
  ON automation_pending_executions;
CREATE POLICY automation_pending_executions_no_client_access
  ON automation_pending_executions
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- ---- 4. Stop anonymous listing of public buckets -----------
-- The app never calls the storage list/download API (only getPublicUrl
-- + uploads), and public buckets serve object URLs without RLS, so
-- dropping these broad SELECT policies keeps rendering working while
-- removing anonymous + cross-tenant object enumeration.
DROP POLICY IF EXISTS "Avatars are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Chat media is publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Flow media is publicly readable" ON storage.objects;
