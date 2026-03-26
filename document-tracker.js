// ============================================================
// GODSPEED BASKETBALL — Document Lifecycle Tracker
// Client-side module for the Parent Portal.
//
// Tracks: views, downloads, signatures.
// Sends events to Supabase via RPC (server-side functions).
// The portal is the source of truth — NOT email opens.
//
// Usage:
//   import { DocumentTracker } from './document-tracker.js';
//   const tracker = new DocumentTracker(supabaseClient);
//   await tracker.init();
//
// Contract:
//   - Requires authenticated Supabase session
//   - Requires tables: user_agreements, document_events
//   - Requires RPC: record_document_view, record_document_download, record_document_signature
// ============================================================

export class DocumentTracker {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
    this.userId = null;
    this.agreements = [];
    this.pendingEvents = []; // offline queue
  }

  // ── Initialize: load user's agreements ─────────────────
  async init() {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) {
      console.warn('[doc-tracker] No authenticated user');
      return false;
    }
    this.userId = user.id;

    // Check URL params for deep-link from email
    const params = new URLSearchParams(window.location.search);
    const deepLinkDoc = params.get('doc');
    const deepLinkAid = params.get('aid');

    // Load all agreements for this parent
    const { data, error } = await this.supabase
      .from('user_agreements')
      .select(`
        id, document_id, athlete_id, status,
        notification_count, view_count, download_count,
        signed_at, version_id,
        documents(id, title, slug, category, season, requires_signature, signature_type, is_mandatory),
        athletes(id, display_name)
      `)
      .eq('parent_user_id', this.userId)
      .order('assigned_at', { ascending: false });

    if (error) {
      console.error('[doc-tracker] Failed to load agreements:', error);
      return false;
    }

    this.agreements = data || [];
    console.log(`[doc-tracker] Loaded ${this.agreements.length} agreements`);

    // Auto-track if arriving from email deep link
    if (deepLinkAid) {
      const agreement = this.agreements.find(a => a.id === deepLinkAid);
      if (agreement) {
        await this.trackLinkClick(agreement.id);
      }
    }

    return true;
  }

  // ── Get agreements by status ──────────────────────────
  getPending() {
    return this.agreements.filter(a => a.status !== 'signed');
  }

  getSigned() {
    return this.agreements.filter(a => a.status === 'signed');
  }

  getByDocument(documentSlug) {
    return this.agreements.filter(a => a.documents?.slug === documentSlug);
  }

  getMandatoryUnsigned() {
    return this.agreements.filter(
      a => a.documents?.is_mandatory && a.status !== 'signed'
    );
  }

  // ── Track: Email link clicked (portal loaded from email) ─
  async trackLinkClick(agreementId) {
    try {
      await this.supabase.from('document_events').insert({
        agreement_id: agreementId,
        event_type: 'link_clicked',
        actor_type: 'parent',
        actor_id: this.userId,
        ip_address: null, // captured server-side if needed
        user_agent: navigator.userAgent,
        event_metadata: {
          referrer: document.referrer || 'direct',
          url_params: Object.fromEntries(new URLSearchParams(window.location.search)),
        },
      });
      console.log('[doc-tracker] Link click tracked:', agreementId);
    } catch (err) {
      console.error('[doc-tracker] Failed to track link click:', err);
    }
  }

  // ── Track: Document viewed (content loaded in viewport) ──
  async trackView(agreementId) {
    try {
      const { error } = await this.supabase.rpc('record_document_view', {
        p_agreement_id: agreementId,
        p_user_agent: navigator.userAgent,
      });

      if (error) throw error;

      // Update local state
      const agreement = this.agreements.find(a => a.id === agreementId);
      if (agreement && ['pending', 'notified'].includes(agreement.status)) {
        agreement.status = 'viewed';
      }
      if (agreement) agreement.view_count++;

      console.log('[doc-tracker] View tracked:', agreementId);
      return true;
    } catch (err) {
      console.error('[doc-tracker] Failed to track view:', err);
      this.pendingEvents.push({ type: 'view', agreementId, timestamp: Date.now() });
      return false;
    }
  }

  // ── Track: Document downloaded ────────────────────────
  async trackDownload(agreementId) {
    try {
      const { error } = await this.supabase.rpc('record_document_download', {
        p_agreement_id: agreementId,
        p_user_agent: navigator.userAgent,
      });

      if (error) throw error;

      const agreement = this.agreements.find(a => a.id === agreementId);
      if (agreement && ['pending', 'notified', 'viewed'].includes(agreement.status)) {
        agreement.status = 'downloaded';
      }
      if (agreement) agreement.download_count++;

      console.log('[doc-tracker] Download tracked:', agreementId);
      return true;
    } catch (err) {
      console.error('[doc-tracker] Failed to track download:', err);
      this.pendingEvents.push({ type: 'download', agreementId, timestamp: Date.now() });
      return false;
    }
  }

  // ── Track: Legally binding signature ──────────────────
  // Returns { success, signed_at, version_id } or { error }
  async trackSignature(agreementId, signatureValue) {
    if (!signatureValue || signatureValue.trim().length === 0) {
      return { error: 'Signature value is required' };
    }

    try {
      const { data, error } = await this.supabase.rpc('record_document_signature', {
        p_agreement_id: agreementId,
        p_signature_value: signatureValue.trim(),
        p_user_agent: navigator.userAgent,
      });

      if (error) throw error;

      if (data?.error) {
        return { error: data.error };
      }

      // Update local state
      const agreement = this.agreements.find(a => a.id === agreementId);
      if (agreement) {
        agreement.status = 'signed';
        agreement.signed_at = data.signed_at;
        agreement.version_id = data.version_id;
      }

      console.log('[doc-tracker] Signature recorded:', agreementId);

      // Fire confirmation email via edge function
      this._sendConfirmation(agreementId).catch(() => {});

      return { success: true, signed_at: data.signed_at, version_id: data.version_id };
    } catch (err) {
      console.error('[doc-tracker] Failed to record signature:', err);
      return { error: 'Signature failed — please try again' };
    }
  }

  // ── Send signature confirmation email ─────────────────
  async _sendConfirmation(agreementId) {
    try {
      await this.supabase.functions.invoke('send-document-notification', {
        body: {
          agreement_ids: [agreementId],
          type: 'confirmation',
        },
      });
    } catch (err) {
      console.warn('[doc-tracker] Confirmation email failed (non-blocking):', err);
    }
  }

  // ── Retry pending events (call on reconnect) ──────────
  async retryPending() {
    const events = [...this.pendingEvents];
    this.pendingEvents = [];

    for (const event of events) {
      if (event.type === 'view') await this.trackView(event.agreementId);
      else if (event.type === 'download') await this.trackDownload(event.agreementId);
    }
  }

  // ── Render helpers for parent portal UI ───────────────

  // Returns HTML for the pending documents banner
  renderPendingBanner() {
    const mandatory = this.getMandatoryUnsigned();
    if (mandatory.length === 0) return '';

    const docNames = mandatory.map(a => a.documents?.title).filter(Boolean);
    const uniqueDocs = [...new Set(docNames)];

    return `
      <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:16px;margin-bottom:20px;">
        <strong style="color:#dc2626;">Action Required: ${uniqueDocs.length} document${uniqueDocs.length > 1 ? 's' : ''} need${uniqueDocs.length === 1 ? 's' : ''} your signature</strong>
        <ul style="margin:8px 0 0;padding-left:20px;font-size:14px;color:#374151;">
          ${uniqueDocs.map(d => `<li>${d}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  // Returns structured data for rendering document cards
  getDocumentCards() {
    return this.agreements.map(a => ({
      agreementId: a.id,
      title: a.documents?.title || 'Unknown Document',
      category: a.documents?.category || 'other',
      season: a.documents?.season || '',
      athleteName: a.athletes?.display_name || '',
      status: a.status,
      isMandatory: a.documents?.is_mandatory || false,
      requiresSignature: a.documents?.requires_signature || false,
      signatureType: a.documents?.signature_type || 'checkbox',
      signedAt: a.signed_at,
      viewCount: a.view_count,
      downloadCount: a.download_count,
    }));
  }
}

// ── Intersection Observer for auto-tracking views ───────
// Attach to document content containers in the parent portal.
export function createViewObserver(tracker) {
  return new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const agreementId = entry.target.dataset.agreementId;
          if (agreementId) {
            tracker.trackView(agreementId);
            // Only track first view via observer
            observer.unobserve(entry.target);
          }
        }
      });
    },
    { threshold: 0.5 } // 50% of document visible = viewed
  );
}
