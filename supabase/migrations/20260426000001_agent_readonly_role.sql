-- ============================================================
-- Agent Read-Only Role (hardened)
--
-- Purpose: Scoped read access for Claude's verification queries.
-- Principle: Allowlist, not blanket. PII excluded via safe views.
-- Connection: Direct connection only (port 5432), not pooler.
-- Password: Set by Scott at runtime, not stored in repo.
--
-- Run in Supabase SQL Editor as role: postgres.
-- Idempotent. Safe to re-run.
-- ============================================================

BEGIN;

-- ── 1. Create role (deny by default) ──────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'agent_readonly') THEN
    -- Password placeholder: Scott sets real password at runtime via:
    --   ALTER ROLE agent_readonly WITH PASSWORD '<generated>';
    CREATE ROLE agent_readonly WITH LOGIN PASSWORD 'CHANGE_ME_IMMEDIATELY'
      NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER
      CONNECTION LIMIT 3;
  END IF;
END $$;

-- Safety limits
ALTER ROLE agent_readonly SET statement_timeout = '10s';
ALTER ROLE agent_readonly SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE agent_readonly SET lock_timeout = '5s';

-- ── 2. Schema access ──────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO agent_readonly;

-- Block auth schema entirely (passwords, tokens, sessions)
REVOKE ALL ON SCHEMA auth FROM agent_readonly;

-- Block storage schema (file uploads, buckets)
REVOKE ALL ON SCHEMA storage FROM agent_readonly;

-- ── 3. Default deny for future tables ─────────────────────────
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM agent_readonly;

-- ── 4. PII-safe views ─────────────────────────────────────────
-- profiles contains: full_name, email, phone_number
-- Agent sees: id, role, approved status, created_at only
CREATE OR REPLACE VIEW public.profiles_safe AS
  SELECT id, role, approved, created_at, updated_at
  FROM public.profiles;

GRANT SELECT ON public.profiles_safe TO agent_readonly;
REVOKE SELECT ON public.profiles FROM agent_readonly;

-- parent_player_links: safe (profile_id + athlete_id, no PII)
-- but only grant via the view to control future column additions
CREATE OR REPLACE VIEW public.parent_player_links_safe AS
  SELECT id, profile_id, athlete_id, created_at
  FROM public.parent_player_links;

GRANT SELECT ON public.parent_player_links_safe TO agent_readonly;
REVOKE SELECT ON public.parent_player_links FROM agent_readonly;

-- ── 5. Athlete & team data (no PII, safe to read) ────────────
GRANT SELECT ON public.athletes TO agent_readonly;
GRANT SELECT ON public.teams TO agent_readonly;
GRANT SELECT ON public.team_rosters TO agent_readonly;

-- ── 6. Training data ─────────────────────────────────────────
GRANT SELECT ON public.training_sessions TO agent_readonly;
GRANT SELECT ON public.training_attendance TO agent_readonly;
GRANT SELECT ON public.training_packages TO agent_readonly;
GRANT SELECT ON public.training_hour_packages TO agent_readonly;
GRANT SELECT ON public.training_schedule_config TO agent_readonly;
GRANT SELECT ON public.practice_grades TO agent_readonly;

-- ── 7. Game & evaluation data ────────────────────────────────
GRANT SELECT ON public.games TO agent_readonly;
GRANT SELECT ON public.player_game_stats TO agent_readonly;
GRANT SELECT ON public.player_evaluations TO agent_readonly;

-- ── 8. Financial data (amounts, not account details) ─────────
GRANT SELECT ON public.payment_plans TO agent_readonly;
GRANT SELECT ON public.payments TO agent_readonly;
GRANT SELECT ON public.dues_payments TO agent_readonly;
GRANT SELECT ON public.fundraising_totals TO agent_readonly;

-- ── 9. Documents (metadata, not content blobs) ──────────────
GRANT SELECT ON public.documents TO agent_readonly;
GRANT SELECT ON public.document_versions TO agent_readonly;
GRANT SELECT ON public.user_agreements TO agent_readonly;
GRANT SELECT ON public.document_events TO agent_readonly;

-- ── 10. Store (products, orders — no customer PII in these) ──
GRANT SELECT ON public.products TO agent_readonly;
GRANT SELECT ON public.product_variants TO agent_readonly;
GRANT SELECT ON public.orders TO agent_readonly;
GRANT SELECT ON public.order_items TO agent_readonly;

-- ── 11. Tournaments ──────────────────────────────────────────
GRANT SELECT ON public.tournaments TO agent_readonly;
GRANT SELECT ON public.tournament_organizers TO agent_readonly;
GRANT SELECT ON public.tournament_scrape_log TO agent_readonly;

-- ── 12. Calendar ─────────────────────────────────────────────
GRANT SELECT ON public.calendar_events TO agent_readonly;

-- ── 13. Views (pre-existing computed views) ──────────────────
-- Grant SELECT on any existing views the agent might need
DO $$
DECLARE
  v RECORD;
BEGIN
  FOR v IN
    SELECT viewname FROM pg_views
     WHERE schemaname = 'public'
       AND viewname IN (
         'tournament_catalog',
         'document_compliance_summary',
         'parent_compliance_status',
         'storefront_products'
       )
  LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO agent_readonly', v.viewname);
  END LOOP;
END $$;

-- ── 14. Explicitly block sensitive tables ────────────────────
-- Even if accidentally granted above, these are revoked:
REVOKE SELECT ON public.profiles FROM agent_readonly;

-- MFA / auth-adjacent tables
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'user_mfa', 'mfa_backup_codes', 'email_verification_tokens',
    'rate_limiting', 'user_profiles', 'parent_accounts'
  ]) LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON public.%I FROM agent_readonly', t);
    EXCEPTION WHEN undefined_table THEN NULL; -- table may not exist
    END;
  END LOOP;
END $$;

COMMIT;

-- ── Post-deploy: Scott must run this separately ──────────────
-- ALTER ROLE agent_readonly WITH PASSWORD '<strong-random-password>';
--
-- Connection string format (direct, not pooled):
-- postgresql://agent_readonly:<password>@db.<project-ref>.supabase.co:5432/postgres
--
-- Store in local secret manager. Do NOT commit to repo.
-- Rotate monthly: ALTER ROLE agent_readonly WITH PASSWORD '<new>';
