-- ============================================================
-- MIGRATION: athlete_parents junction (many-to-many parents)
-- + Link Markus (dad) and Melissa (mom) to Ashton
-- Run in Supabase SQL Editor as role: postgres (or service_role).
-- Idempotent.
-- ============================================================

BEGIN;

-- ── 1. Junction table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.athlete_parents (
    athlete_id        uuid NOT NULL REFERENCES public.athletes(id)        ON DELETE CASCADE,
    parent_account_id uuid NOT NULL REFERENCES public.parent_accounts(id) ON DELETE CASCADE,
    relationship      text NOT NULL DEFAULT 'guardian'
                         CHECK (relationship IN ('mother','father','guardian','other')),
    is_primary        boolean NOT NULL DEFAULT false,
    created_at        timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (athlete_id, parent_account_id)
);

CREATE INDEX IF NOT EXISTS idx_athlete_parents_parent
    ON public.athlete_parents(parent_account_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_athlete_parents_one_primary
    ON public.athlete_parents(athlete_id) WHERE is_primary;

-- ── 2. RLS ─────────────────────────────────────────────────
ALTER TABLE public.athlete_parents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS athlete_parents_coach_full  ON public.athlete_parents;
DROP POLICY IF EXISTS athlete_parents_parent_read ON public.athlete_parents;
DROP POLICY IF EXISTS athlete_parents_service     ON public.athlete_parents;

CREATE POLICY athlete_parents_coach_full ON public.athlete_parents
    FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.profiles
         WHERE id = auth.uid() AND role IN ('coach','director')
    ));

CREATE POLICY athlete_parents_parent_read ON public.athlete_parents
    FOR SELECT
    USING (
        parent_account_id IN (
            SELECT id FROM public.parent_accounts WHERE user_id = auth.uid()
        )
    );

CREATE POLICY athlete_parents_service ON public.athlete_parents
    FOR ALL
    USING (auth.role() = 'service_role');

-- ── 3. Backfill from athletes.parent_account_id ────────────
INSERT INTO public.athlete_parents (athlete_id, parent_account_id, relationship, is_primary)
SELECT id, parent_account_id, 'guardian', true
  FROM public.athletes
 WHERE parent_account_id IS NOT NULL
ON CONFLICT (athlete_id, parent_account_id) DO NOTHING;

-- ── 4. Link Markus + Melissa to Ashton ─────────────────────
DO $$
DECLARE
    v_ashton_id      uuid := 'a1000000-0000-0000-0000-000000000008';
    v_dad_email      text := 'bowmanfamilyfrenchies@gmail.com';
    v_mom_email      text := 'jamaican.mel@gmail.com';
    v_dad_user_id    uuid;
    v_mom_user_id    uuid;
    v_dad_account_id uuid;
    v_mom_account_id uuid;
BEGIN
    SELECT id INTO v_dad_user_id FROM auth.users WHERE LOWER(email) = LOWER(v_dad_email) LIMIT 1;
    SELECT id INTO v_mom_user_id FROM auth.users WHERE LOWER(email) = LOWER(v_mom_email) LIMIT 1;

    IF v_dad_user_id IS NOT NULL THEN
        INSERT INTO public.parent_accounts (user_id, email, first_name, last_name)
        VALUES (v_dad_user_id, v_dad_email, 'Markus', 'Bowman')
        ON CONFLICT (email) DO UPDATE SET
            first_name = COALESCE(public.parent_accounts.first_name, EXCLUDED.first_name),
            last_name  = COALESCE(public.parent_accounts.last_name,  EXCLUDED.last_name),
            updated_at = now()
        RETURNING id INTO v_dad_account_id;

        UPDATE public.athlete_parents
           SET is_primary = false
         WHERE athlete_id = v_ashton_id AND is_primary = true;

        INSERT INTO public.athlete_parents (athlete_id, parent_account_id, relationship, is_primary)
        VALUES (v_ashton_id, v_dad_account_id, 'father', true)
        ON CONFLICT (athlete_id, parent_account_id) DO UPDATE SET
            relationship = 'father',
            is_primary   = true;

        UPDATE public.athletes SET parent_account_id = v_dad_account_id WHERE id = v_ashton_id;

        UPDATE public.profiles
           SET full_name = 'Markus Bowman'
         WHERE email = v_dad_email
           AND (full_name IS NULL OR full_name = '' OR full_name NOT ILIKE '%markus%bowman%');

        RAISE NOTICE 'Linked Markus Bowman (father, primary) to Ashton.';
    ELSE
        RAISE NOTICE 'Markus (%) has no auth.users row — he must sign up before the link completes.', v_dad_email;
    END IF;

    IF v_mom_user_id IS NOT NULL THEN
        INSERT INTO public.parent_accounts (user_id, email, first_name, last_name)
        VALUES (v_mom_user_id, v_mom_email, 'Melissa', 'Bowman')
        ON CONFLICT (email) DO UPDATE SET
            first_name = COALESCE(public.parent_accounts.first_name, EXCLUDED.first_name),
            last_name  = COALESCE(public.parent_accounts.last_name,  EXCLUDED.last_name),
            updated_at = now()
        RETURNING id INTO v_mom_account_id;

        INSERT INTO public.athlete_parents (athlete_id, parent_account_id, relationship, is_primary)
        VALUES (v_ashton_id, v_mom_account_id, 'mother', false)
        ON CONFLICT (athlete_id, parent_account_id) DO UPDATE SET
            relationship = 'mother';

        UPDATE public.profiles
           SET full_name = 'Melissa Bowman'
         WHERE email = v_mom_email
           AND (full_name IS NULL OR full_name = '' OR full_name NOT ILIKE '%melissa%bowman%');

        RAISE NOTICE 'Linked Melissa Bowman (mother, secondary) to Ashton.';
    ELSE
        RAISE NOTICE 'Melissa (%) has no auth.users row yet. Send signup link; rerun this migration after she signs up to complete the link.', v_mom_email;
    END IF;
END $$;

COMMIT;

-- Verification
SELECT
    ath.first_name AS athlete,
    pa.first_name || ' ' || pa.last_name AS parent,
    pa.email,
    ap.relationship,
    ap.is_primary
FROM public.athlete_parents ap
JOIN public.athletes ath         ON ath.id = ap.athlete_id
JOIN public.parent_accounts pa   ON pa.id  = ap.parent_account_id
WHERE ap.athlete_id = 'a1000000-0000-0000-0000-000000000008'
ORDER BY ap.is_primary DESC, pa.last_name;
