/**
 * GODSPEED BASKETBALL — Document Tracker Integration
 * Drop-in script that wires Supabase document lifecycle tracking
 * into the existing parent-portal.js signing flow.
 *
 * HOW IT WORKS:
 *   1. Monkey-patches window.openDocModal to track document views
 *   2. Signing itself lives in parent-portal.js (record_document_signature)
 *   3. Hooks download buttons to track PDF downloads
 *   4. Reads URL params (?doc=&aid=) for email click-through tracking
 *   5. All events are sent to Supabase via RPC functions
 *
 * INSTALLATION:
 *   Add ONE line to parent-portal.html, AFTER auth-supabase.js and BEFORE parent-portal.js:
 *
 *   <script src="document-tracker-integration.js" defer></script>
 *
 * REQUIRES:
 *   - Supabase client initialized (window.auth?.getSupabaseClient())
 *   - Tables: user_agreements, document_events (from godspeed_document_management_schema.sql)
 *   - RPCs: record_document_view, record_document_download, record_document_signature
 *
 * DOES NOT MODIFY: parent-portal.js, documents-view.js, or any existing file.
 */

(function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────
  // Portal doc type -> documents.slug in Supabase. These are identical today
  // (documents.slug is 'athletic', 'medical', ...). The old '*-2026' values
  // never matched a real slug, so email deep links never auto-opened and
  // view/sign tracking never found an agreement. Keep the map so a future
  // slug rename is a one-line change here.
  const DOC_SLUG_MAP = {
    'athletic':       'athletic',
    'medical':        'medical',
    'practice':       'practice',
    'conduct':        'conduct',
    'media':          'media',
    'parent-guide':   'parent-guide',
  };

  let _supabase = null;
  let _userId = null;
  let _agreements = {};      // keyed by doc slug
  let _initialized = false;

  // ── Initialization ──────────────────────────────────────
  async function initTracker() {
    if (_initialized) return;

    // Wait for Supabase client
    _supabase = window.auth?.getSupabaseClient?.() || window.supabaseClient;
    if (!_supabase) {
      console.warn('[doc-tracker] No Supabase client found. Retrying in 2s...');
      setTimeout(initTracker, 2000);
      return;
    }

    // Get current user
    try {
      const { data: { user } } = await _supabase.auth.getUser();
      if (!user) {
        console.log('[doc-tracker] No authenticated user yet. Will init after login.');
        // Listen for auth state change
        _supabase.auth.onAuthStateChange((event, session) => {
          if (event === 'SIGNED_IN' && session?.user && !_initialized) {
            _userId = session.user.id;
            // Same sequence as a warm session: load, then honor the email deep
            // link (?doc=&aid=) so a one-tap sign-in opens the document, then
            // patch the portal functions for view/sign tracking.
            loadAgreements().then(() => {
              handleEmailDeepLink();
              patchPortalFunctions();
              _initialized = true;
              console.log('[doc-tracker] Initialized after sign-in. Tracking active.');
            });
          }
        });
        return;
      }
      _userId = user.id;
    } catch (err) {
      console.warn('[doc-tracker] Auth check failed:', err.message);
      return;
    }

    await loadAgreements();
    handleEmailDeepLink();
    patchPortalFunctions();
    _initialized = true;
    console.log('[doc-tracker] Initialized. Tracking active.');
  }

  // ── Load this parent's agreements from Supabase ─────────
  async function loadAgreements() {
    if (!_supabase || !_userId) return;

    try {
      const { data, error } = await _supabase
        .from('user_agreements')
        .select('id, document_id, athlete_id, status, documents(slug)')
        .eq('parent_user_id', _userId);

      if (error) throw error;

      // Index by document slug for fast lookup
      (data || []).forEach(a => {
        const slug = a.documents?.slug;
        if (slug) _agreements[slug] = a;
      });

      console.log(`[doc-tracker] Loaded ${Object.keys(_agreements).length} agreements.`);
    } catch (err) {
      console.warn('[doc-tracker] Failed to load agreements:', err.message);
    }
  }

  // ── Email deep link tracking ────────────────────────────
  function handleEmailDeepLink() {
    const params = new URLSearchParams(window.location.search);
    const docSlug = params.get('doc');
    const agreementId = params.get('aid');

    if (agreementId) {
      // Parent clicked the CTA in our email
      logEvent(agreementId, 'link_clicked', {
        referrer: document.referrer || 'direct',
        doc_slug: docSlug,
      });
      console.log('[doc-tracker] Email click-through tracked:', agreementId);
    }

    // Auto-open the document if deep-linked
    if (docSlug) {
      const docType = Object.entries(DOC_SLUG_MAP).find(([, slug]) => slug === docSlug)?.[0];
      if (docType && typeof window.openDocModal === 'function') {
        // Small delay to let the portal render first
        setTimeout(() => {
          // Switch to documents view first
          const docsTab = document.querySelector('[onclick*="documents"]');
          if (docsTab) docsTab.click();
          setTimeout(() => window.openDocModal(docType), 300);
        }, 500);
      }
    }
  }

  // ── Monkey-patch existing portal functions ──────────────
  function patchPortalFunctions() {
    // 1. Patch openDocModal → track document view
    const _originalOpenDocModal = window.openDocModal;
    if (typeof _originalOpenDocModal === 'function') {
      window.openDocModal = function (type) {
        // Call original first
        _originalOpenDocModal.call(this, type);

        // Track the view event
        const slug = DOC_SLUG_MAP[type];
        const agreement = slug ? _agreements[slug] : null;
        if (agreement && agreement.id) {
          trackView(agreement.id);
        }
      };
      console.log('[doc-tracker] Patched openDocModal for view tracking.');
    } else {
      // If parent-portal.js hasn't loaded yet, wait and retry
      const interval = setInterval(() => {
        if (typeof window.openDocModal === 'function') {
          clearInterval(interval);
          patchPortalFunctions();
        }
      }, 500);
      return; // Don't continue patching until openDocModal exists
    }

    // 2. Signatures are NOT patched here. parent-portal.js owns the signing
    //    path: it calls record_document_signature with the drawn signature and
    //    only then calls markDocumentSigned (which also runs on page load for
    //    already-signed docs). Patching it would fire a duplicate RPC with a
    //    text stand-in for the signature on every load.

    // 3. Hook download buttons (PDF downloads in documents section)
    hookDownloadButtons();
  }

  // ── Hook download buttons ───────────────────────────────
  function hookDownloadButtons() {
    // Observer to catch dynamically added download links
    const observer = new MutationObserver(() => {
      const downloadLinks = document.querySelectorAll(
        'a[download], a[href$=".pdf"], button[onclick*="download"], button[onclick*="Download"]'
      );
      downloadLinks.forEach(el => {
        if (el.dataset.trackerHooked) return;
        el.dataset.trackerHooked = 'true';

        el.addEventListener('click', () => {
          // Determine which document this download belongs to
          const card = el.closest('.doc-card-v3');
          if (!card) return;

          const cardId = card.id || '';
          const docType = cardId.replace('card-', '');
          const slug = DOC_SLUG_MAP[docType];
          const agreement = slug ? _agreements[slug] : null;

          if (agreement && agreement.id) {
            trackDownload(agreement.id);
          }
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Also hook existing download links immediately
    document.querySelectorAll('a[download], a[href$=".pdf"]').forEach(el => {
      if (el.dataset.trackerHooked) return;
      el.dataset.trackerHooked = 'true';
      el.addEventListener('click', () => {
        const card = el.closest('.doc-card-v3');
        if (!card) return;
        const docType = card.id?.replace('card-', '');
        const slug = DOC_SLUG_MAP[docType];
        const agreement = slug ? _agreements[slug] : null;
        if (agreement?.id) trackDownload(agreement.id);
      });
    });
  }

  // ── Supabase RPC calls ──────────────────────────────────

  async function trackView(agreementId) {
    if (!_supabase) return;
    try {
      await _supabase.rpc('record_document_view', {
        p_agreement_id: agreementId,
        p_user_agent: navigator.userAgent,
      });
      console.log('[doc-tracker] View tracked:', agreementId);
    } catch (err) {
      console.warn('[doc-tracker] View tracking failed:', err.message);
    }
  }

  async function trackDownload(agreementId) {
    if (!_supabase) return;
    try {
      await _supabase.rpc('record_document_download', {
        p_agreement_id: agreementId,
        p_user_agent: navigator.userAgent,
      });
      console.log('[doc-tracker] Download tracked:', agreementId);
    } catch (err) {
      console.warn('[doc-tracker] Download tracking failed:', err.message);
    }
  }

  async function logEvent(agreementId, eventType, metadata) {
    if (!_supabase) return;
    try {
      await _supabase.from('document_events').insert({
        agreement_id: agreementId,
        event_type: eventType,
        actor_id: _userId,
        actor_type: 'parent',
        user_agent: navigator.userAgent,
        event_metadata: metadata || {},
      });
    } catch (err) {
      console.warn('[doc-tracker] Event log failed:', err.message);
    }
  }

  // ── Pending documents banner ────────────────────────────
  function renderPendingBanner() {
    const pending = Object.values(_agreements).filter(a => a.status !== 'signed');
    if (pending.length === 0) return;

    const banner = document.createElement('div');
    banner.id = 'doc-compliance-banner';
    banner.style.cssText = 'background:#fef2f2;border:1px solid #fca5a5;border-radius:10px;padding:14px 18px;margin-bottom:16px;font-family:Inter,sans-serif;';
    banner.innerHTML = `
      <div style="font-weight:700;color:#dc2626;font-size:14px;margin-bottom:4px;">
        Action Required: ${pending.length} document${pending.length > 1 ? 's' : ''} need${pending.length === 1 ? 's' : ''} your signature
      </div>
      <div style="font-size:13px;color:#374151;">
        Please review and sign all required documents to keep your athlete eligible for team activities.
      </div>
    `;

    // Insert at top of documents view
    const docsView = document.getElementById('view-documents');
    if (docsView) {
      const header = docsView.querySelector('.section-header');
      if (header) {
        header.parentNode.insertBefore(banner, header.nextSibling);
      }
    }
  }

  // ── Boot ────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // Delay slightly to let auth-supabase.js and parent-portal.js initialize
      setTimeout(initTracker, 800);
    });
  } else {
    setTimeout(initTracker, 800);
  }

  // Expose for admin impersonation mode
  window.__docTracker = {
    getAgreements: () => _agreements,
    reload: loadAgreements,
    renderBanner: renderPendingBanner,
  };

})();
