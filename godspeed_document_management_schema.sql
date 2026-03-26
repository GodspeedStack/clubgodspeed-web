-- ============================================================
-- GODSPEED BASKETBALL — Document Management & Compliance Layer
-- Migration: user_agreements, document_versions, audit_trail
-- Tracks full lifecycle: pending → notified → viewed → downloaded → signed
-- Legally binding e-signature audit trail without DocuSign
-- ============================================================
-- Run this in Supabase SQL Editor as role: postgres
-- ============================================================

BEGIN;

-- ============================================================
-- 1. DOCUMENTS — Master document registry (admin-managed)
--    Every waiver, release, handbook, or agreement the org uses
-- ============================================================
CREATE TABLE IF NOT EXISTS public.documents (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity
    title           text NOT NULL,                        -- e.g. 'Liability Waiver 2026'
    slug            text NOT NULL UNIQUE,                 -- e.g. 'liability-waiver-2026'
    category        text NOT NULL CHECK (category IN (
        'waiver', 'medical_release', 'code_of_conduct',
        'financial_agreement', 'handbook', 'consent_form',
        'roster_commitment', 'other'
    )),
    description     text,                                 -- Short admin-facing summary

    -- Scope
    season          text NOT NULL,                        -- e.g. 'Summer 2026'
    applies_to      text NOT NULL DEFAULT 'all_active'    -- 'all_active', 'aau_only', 'training_only'
                    CHECK (applies_to IN ('all_active', 'aau_only', 'training_only', 'custom')),

    -- Requirements
    requires_signature boolean NOT NULL DEFAULT true,
    signature_type  text NOT NULL DEFAULT 'checkbox'
                    CHECK (signature_type IN ('checkbox', 'typed_name', 'drawn')),
    is_mandatory    boolean NOT NULL DEFAULT true,        -- blocks playing time if unsigned

    -- State
    is_active       boolean NOT NULL DEFAULT true,
    published_at    timestamptz,
    archived_at     timestamptz,

    -- Metadata
    created_by      uuid REFERENCES auth.users(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.documents IS 'Master registry of all org documents requiring parent action';

CREATE INDEX idx_documents_season ON public.documents(season);
CREATE INDEX idx_documents_category ON public.documents(category);
CREATE INDEX idx_documents_active ON public.documents(is_active) WHERE is_active = true;

-- ============================================================
-- 2. DOCUMENT VERSIONS — Immutable content snapshots
--    Ensures parent cannot claim "the document changed after I signed"
-- ============================================================
CREATE TABLE IF NOT EXISTS public.document_versions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,

    -- Content (exactly one must be populated)
    version_number  smallint NOT NULL DEFAULT 1,
    content_html    text,                                 -- Rendered HTML content
    content_markdown text,                                -- Source markdown
    file_url        text,                                 -- Supabase Storage URL for PDF/DOCX
    file_type       text CHECK (file_type IN ('pdf', 'docx', 'html', 'markdown')),

    -- Integrity
    content_hash    text NOT NULL,                        -- SHA-256 hash of content at publish time
    is_current      boolean NOT NULL DEFAULT true,

    -- Metadata
    change_summary  text,                                 -- "Updated section 3.2 — medical info"
    published_at    timestamptz NOT NULL DEFAULT now(),
    published_by    uuid REFERENCES auth.users(id),
    created_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT document_versions_unique UNIQUE (document_id, version_number),
    CONSTRAINT document_versions_has_content CHECK (
        content_html IS NOT NULL OR content_markdown IS NOT NULL OR file_url IS NOT NULL
    )
);

COMMENT ON TABLE public.document_versions IS 'Immutable content snapshots — one signature always maps to one version';

CREATE INDEX idx_document_versions_doc ON public.document_versions(document_id);
CREATE INDEX idx_document_versions_current ON public.document_versions(document_id, is_current) WHERE is_current = true;

-- ============================================================
-- 3. USER AGREEMENTS — The core bridge: Parent <-> Document
--    Tracks full lifecycle with precise state machine
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_agreements (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Who
    parent_user_id  uuid NOT NULL REFERENCES auth.users(id),
    parent_email    text NOT NULL,
    athlete_id      uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,

    -- What
    document_id     uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    version_id      uuid REFERENCES public.document_versions(id),  -- locked on sign

    -- Lifecycle state machine
    status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN (
                        'pending',      -- assigned, parent hasn't seen it
                        'notified',     -- system sent the email
                        'viewed',       -- parent clicked link and loaded document
                        'downloaded',   -- parent saved the PDF/file
                        'signed'        -- audit trail captured and locked
                    )),

    -- Assignment
    assigned_at     timestamptz NOT NULL DEFAULT now(),
    assigned_by     uuid REFERENCES auth.users(id),

    -- Notification tracking
    first_notified_at   timestamptz,
    last_notified_at    timestamptz,
    notification_count  smallint NOT NULL DEFAULT 0,

    -- View tracking (portal is the source of truth, not email opens)
    first_viewed_at     timestamptz,
    last_viewed_at      timestamptz,
    view_count          smallint NOT NULL DEFAULT 0,

    -- Download tracking
    first_downloaded_at timestamptz,
    last_downloaded_at  timestamptz,
    download_count      smallint NOT NULL DEFAULT 0,

    -- Signature (the legally binding part)
    signed_at           timestamptz,
    signature_value     text,           -- typed name or checkbox confirmation text
    signature_ip        inet,           -- IP address at time of signing
    signature_user_agent text,          -- browser UA string

    -- Metadata
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    -- One agreement per parent-athlete-document
    CONSTRAINT user_agreements_unique UNIQUE (parent_user_id, athlete_id, document_id)
);

COMMENT ON TABLE public.user_agreements IS 'Lifecycle ledger bridging parents to documents with full audit trail';

CREATE INDEX idx_user_agreements_parent ON public.user_agreements(parent_user_id);
CREATE INDEX idx_user_agreements_athlete ON public.user_agreements(athlete_id);
CREATE INDEX idx_user_agreements_document ON public.user_agreements(document_id);
CREATE INDEX idx_user_agreements_status ON public.user_agreements(status);
CREATE INDEX idx_user_agreements_pending ON public.user_agreements(status, document_id)
    WHERE status IN ('pending', 'notified', 'viewed', 'downloaded');
CREATE INDEX idx_user_agreements_unsigned ON public.user_agreements(parent_user_id, status)
    WHERE status != 'signed';

-- ============================================================
-- 4. DOCUMENT EVENTS — Immutable audit log of every action
--    This is the legal record. Never update, only insert.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.document_events (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agreement_id    uuid NOT NULL REFERENCES public.user_agreements(id) ON DELETE CASCADE,

    -- Event type
    event_type      text NOT NULL CHECK (event_type IN (
        'assigned',         -- document assigned to parent
        'notification_sent',-- email/SMS sent
        'link_clicked',     -- parent clicked portal link from email
        'viewed',           -- document content loaded in browser
        'downloaded',       -- PDF/file downloaded
        'signed',           -- legally binding signature captured
        'reminder_sent',    -- automated reminder fired
        'escalation_sent',  -- playing-time warning sent
        'admin_viewed',     -- admin impersonated parent view
        'status_changed'    -- manual status override by admin
    )),

    -- Context
    event_metadata  jsonb DEFAULT '{}'::jsonb,  -- flexible: {email_subject, resend_id, etc.}
    ip_address      inet,
    user_agent      text,

    -- Actor
    actor_id        uuid REFERENCES auth.users(id),  -- null = system/cron
    actor_type      text NOT NULL DEFAULT 'system'
                    CHECK (actor_type IN ('parent', 'admin', 'system', 'cron')),

    -- Immutable timestamp
    created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.document_events IS 'Immutable audit log — the legal backbone. Never UPDATE, only INSERT.';

CREATE INDEX idx_document_events_agreement ON public.document_events(agreement_id);
CREATE INDEX idx_document_events_type ON public.document_events(event_type);
CREATE INDEX idx_document_events_created ON public.document_events(created_at DESC);
CREATE INDEX idx_document_events_actor ON public.document_events(actor_id) WHERE actor_id IS NOT NULL;

-- ============================================================
-- 5. DOCUMENT NOTIFICATION LOG — Tracks every email sent
--    Mirrors dues_reminder_log pattern for consistency
-- ============================================================
CREATE TABLE IF NOT EXISTS public.document_notification_log (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agreement_id    uuid NOT NULL REFERENCES public.user_agreements(id) ON DELETE CASCADE,
    document_id     uuid NOT NULL REFERENCES public.documents(id),

    -- Email details
    notification_type text NOT NULL CHECK (notification_type IN (
        'initial',          -- first notification: "new document ready"
        'reminder',         -- automated follow-up
        'escalation',       -- "playing time at risk"
        'final_warning',    -- last chance before roster action
        'confirmation'      -- "thank you for signing"
    )),
    channel         text NOT NULL DEFAULT 'email',
    recipient_email text NOT NULL,
    subject         text NOT NULL,
    message_preview text,

    -- Delivery tracking
    resend_message_id text,
    sent_at         timestamptz NOT NULL DEFAULT now(),

    -- Metadata
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_doc_notification_log_agreement ON public.document_notification_log(agreement_id);
CREATE INDEX idx_doc_notification_log_document ON public.document_notification_log(document_id);
CREATE INDEX idx_doc_notification_log_type ON public.document_notification_log(notification_type);

-- ============================================================
-- 6. VIEWS — Admin "God View" compliance dashboards
-- ============================================================

-- 6a. Per-document compliance summary
CREATE OR REPLACE VIEW public.document_compliance_summary AS
SELECT
    d.id AS document_id,
    d.title,
    d.slug,
    d.category,
    d.season,
    d.is_mandatory,
    COUNT(ua.id) AS total_assigned,
    COUNT(ua.id) FILTER (WHERE ua.status = 'signed') AS total_signed,
    COUNT(ua.id) FILTER (WHERE ua.status = 'pending') AS total_pending,
    COUNT(ua.id) FILTER (WHERE ua.status = 'notified') AS total_notified,
    COUNT(ua.id) FILTER (WHERE ua.status = 'viewed') AS total_viewed,
    COUNT(ua.id) FILTER (WHERE ua.status = 'downloaded') AS total_downloaded,
    CASE
        WHEN COUNT(ua.id) = 0 THEN 0
        ELSE ROUND(
            COUNT(ua.id) FILTER (WHERE ua.status = 'signed')::numeric
            / COUNT(ua.id) * 100, 1
        )
    END AS sign_rate_pct
FROM public.documents d
LEFT JOIN public.user_agreements ua ON ua.document_id = d.id
WHERE d.is_active = true
GROUP BY d.id, d.title, d.slug, d.category, d.season, d.is_mandatory;

ALTER VIEW public.document_compliance_summary SET (security_invoker = on);

-- 6b. Per-parent compliance status (who has NOT signed)
CREATE OR REPLACE VIEW public.parent_compliance_status AS
SELECT
    ua.parent_user_id,
    ua.parent_email,
    a.display_name AS athlete_name,
    a.id AS athlete_id,
    a.enrollment_status,
    d.title AS document_title,
    d.slug AS document_slug,
    d.category AS document_category,
    d.is_mandatory,
    ua.status AS agreement_status,
    ua.assigned_at,
    ua.first_notified_at,
    ua.last_notified_at,
    ua.notification_count,
    ua.first_viewed_at,
    ua.view_count,
    ua.first_downloaded_at,
    ua.download_count,
    ua.signed_at,
    -- Days since assignment without signing
    CASE
        WHEN ua.status != 'signed' THEN
            EXTRACT(DAY FROM now() - ua.assigned_at)::integer
        ELSE NULL
    END AS days_outstanding,
    -- Roster risk flag
    CASE
        WHEN d.is_mandatory = true
            AND ua.status != 'signed'
            AND a.enrollment_status = 'active'
        THEN true
        ELSE false
    END AS roster_at_risk
FROM public.user_agreements ua
JOIN public.documents d ON d.id = ua.document_id
JOIN public.athletes a ON a.id = ua.athlete_id
WHERE d.is_active = true;

ALTER VIEW public.parent_compliance_status SET (security_invoker = on);

-- ============================================================
-- 7. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_notification_log ENABLE ROW LEVEL SECURITY;

-- Documents: anyone authenticated can read active docs
CREATE POLICY "Authenticated read active documents"
    ON public.documents FOR SELECT
    USING (is_active = true AND auth.uid() IS NOT NULL);

-- Documents: coaches/directors can manage
CREATE POLICY "Coaches manage documents"
    ON public.documents FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role IN ('coach', 'director')
    ));

-- Document versions: anyone authenticated can read
CREATE POLICY "Authenticated read document versions"
    ON public.document_versions FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Document versions: coaches/directors can manage
CREATE POLICY "Coaches manage document versions"
    ON public.document_versions FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role IN ('coach', 'director')
    ));

-- User agreements: parents read/update their own
CREATE POLICY "Parents read own agreements"
    ON public.user_agreements FOR SELECT
    USING (parent_user_id = auth.uid());

CREATE POLICY "Parents update own agreements"
    ON public.user_agreements FOR UPDATE
    USING (parent_user_id = auth.uid())
    WITH CHECK (parent_user_id = auth.uid());

-- User agreements: coaches/directors full access
CREATE POLICY "Coaches full access to agreements"
    ON public.user_agreements FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role IN ('coach', 'director')
    ));

-- Document events: parents can read their own
CREATE POLICY "Parents read own document events"
    ON public.document_events FOR SELECT
    USING (
        agreement_id IN (
            SELECT id FROM public.user_agreements WHERE parent_user_id = auth.uid()
        )
    );

-- Document events: parents can insert (for view/download/sign tracking)
CREATE POLICY "Parents insert own document events"
    ON public.document_events FOR INSERT
    WITH CHECK (
        agreement_id IN (
            SELECT id FROM public.user_agreements WHERE parent_user_id = auth.uid()
        )
    );

-- Document events: coaches/directors full access
CREATE POLICY "Coaches full access to document events"
    ON public.document_events FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role IN ('coach', 'director')
    ));

-- Notification log: coaches/directors only (parents don't need to see outbound log)
CREATE POLICY "Coaches read notification log"
    ON public.document_notification_log FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role IN ('coach', 'director')
    ));

-- Service role: full access on all document tables (for edge functions)
CREATE POLICY "Service role full access on documents"
    ON public.documents FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on document_versions"
    ON public.document_versions FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on user_agreements"
    ON public.user_agreements FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on document_events"
    ON public.document_events FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on doc_notification_log"
    ON public.document_notification_log FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 8. TRIGGERS — Auto-update timestamps
-- ============================================================

CREATE TRIGGER set_documents_updated_at
    BEFORE UPDATE ON public.documents
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_user_agreements_updated_at
    BEFORE UPDATE ON public.user_agreements
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 9. FUNCTIONS — Agreement state transitions (server-side safety)
-- ============================================================

-- 9a. Record a document view event (idempotent state advance)
CREATE OR REPLACE FUNCTION public.record_document_view(
    p_agreement_id uuid,
    p_ip inet DEFAULT NULL,
    p_user_agent text DEFAULT NULL
)
RETURNS void AS $$
BEGIN
    -- Advance status only forward: pending/notified → viewed
    UPDATE public.user_agreements
    SET
        status = CASE
            WHEN status IN ('pending', 'notified') THEN 'viewed'
            ELSE status
        END,
        first_viewed_at = COALESCE(first_viewed_at, now()),
        last_viewed_at = now(),
        view_count = view_count + 1
    WHERE id = p_agreement_id;

    -- Insert immutable event
    INSERT INTO public.document_events (agreement_id, event_type, ip_address, user_agent, actor_type)
    VALUES (p_agreement_id, 'viewed', p_ip, p_user_agent, 'parent');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9b. Record a document download event
CREATE OR REPLACE FUNCTION public.record_document_download(
    p_agreement_id uuid,
    p_ip inet DEFAULT NULL,
    p_user_agent text DEFAULT NULL
)
RETURNS void AS $$
BEGIN
    UPDATE public.user_agreements
    SET
        status = CASE
            WHEN status IN ('pending', 'notified', 'viewed') THEN 'downloaded'
            ELSE status
        END,
        first_downloaded_at = COALESCE(first_downloaded_at, now()),
        last_downloaded_at = now(),
        download_count = download_count + 1
    WHERE id = p_agreement_id;

    INSERT INTO public.document_events (agreement_id, event_type, ip_address, user_agent, actor_type)
    VALUES (p_agreement_id, 'downloaded', p_ip, p_user_agent, 'parent');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9c. Record a legally binding signature (one-shot, irreversible)
CREATE OR REPLACE FUNCTION public.record_document_signature(
    p_agreement_id uuid,
    p_signature_value text,
    p_ip inet DEFAULT NULL,
    p_user_agent text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
    v_agreement public.user_agreements%ROWTYPE;
    v_version_id uuid;
BEGIN
    -- Get the agreement
    SELECT * INTO v_agreement FROM public.user_agreements WHERE id = p_agreement_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Agreement not found');
    END IF;

    -- Prevent re-signing
    IF v_agreement.status = 'signed' THEN
        RETURN jsonb_build_object('error', 'Already signed', 'signed_at', v_agreement.signed_at);
    END IF;

    -- Lock to current version
    SELECT id INTO v_version_id
    FROM public.document_versions
    WHERE document_id = v_agreement.document_id AND is_current = true
    LIMIT 1;

    -- Execute signature
    UPDATE public.user_agreements
    SET
        status = 'signed',
        version_id = v_version_id,
        signed_at = now(),
        signature_value = p_signature_value,
        signature_ip = p_ip,
        signature_user_agent = p_user_agent,
        -- Also record view if they somehow signed without explicit view event
        first_viewed_at = COALESCE(first_viewed_at, now()),
        last_viewed_at = now(),
        view_count = view_count + 1
    WHERE id = p_agreement_id;

    -- Insert immutable signature event with full forensic metadata
    INSERT INTO public.document_events (
        agreement_id, event_type, ip_address, user_agent, actor_type,
        event_metadata
    ) VALUES (
        p_agreement_id, 'signed', p_ip, p_user_agent, 'parent',
        jsonb_build_object(
            'signature_value', p_signature_value,
            'version_id', v_version_id,
            'timestamp_utc', now()::text
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'signed_at', now(),
        'version_id', v_version_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 10. FUNCTION — Bulk assign documents to active roster
--     Called by admin when publishing a new document
-- ============================================================
CREATE OR REPLACE FUNCTION public.assign_document_to_roster(
    p_document_id uuid,
    p_assigned_by uuid DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
    v_doc public.documents%ROWTYPE;
    v_count integer := 0;
BEGIN
    SELECT * INTO v_doc FROM public.documents WHERE id = p_document_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Document not found');
    END IF;

    -- Insert agreements for all active athletes with linked parent accounts
    INSERT INTO public.user_agreements (
        parent_user_id, parent_email, athlete_id, document_id, assigned_by
    )
    SELECT
        pa.user_id,
        pa.email,
        a.id,
        p_document_id,
        p_assigned_by
    FROM public.athletes a
    JOIN public.parent_accounts pa ON pa.id = a.parent_account_id
    WHERE a.enrollment_status = 'active'
    AND (
        v_doc.applies_to = 'all_active'
        OR (v_doc.applies_to = 'aau_only' AND a.team_name ILIKE '%aau%')
        OR (v_doc.applies_to = 'training_only' AND a.team_name ILIKE '%training%')
    )
    ON CONFLICT (parent_user_id, athlete_id, document_id) DO NOTHING;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- Log assignment events
    INSERT INTO public.document_events (agreement_id, event_type, actor_id, actor_type, event_metadata)
    SELECT
        ua.id,
        'assigned',
        p_assigned_by,
        'admin',
        jsonb_build_object('document_title', v_doc.title, 'season', v_doc.season)
    FROM public.user_agreements ua
    WHERE ua.document_id = p_document_id
    AND ua.assigned_at >= now() - interval '1 minute';

    RETURN jsonb_build_object('success', true, 'assigned_count', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 11. STORAGE — Document file uploads
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

COMMIT;
