/**
 * account-visibility.js — Per-profile UI visibility flags for the parent portal.
 *
 * Contract:
 *   Reads boolean flags on the authenticated user's `profiles` row and hides
 *   portal sections accordingly. Data-driven: to exempt another account, set the
 *   flag in the DB — no code change required.
 *
 *   Flags:
 *     is_dues_exempt : bool  -> hide AAU Season Dues nav, dues CTA banner, and billing view
 *     hide_calendar  : bool  -> hide Calendar nav + view
 *
 * Design notes:
 *   - Flags are fetched once and cached (single round-trip) via getAccountVisibilityFlags().
 *   - Globals window.__duesExempt / window.__hideCalendar are the source of truth other
 *     modules consult (updateUIForCohort, switchPortalView, renderBilling) so a later
 *     cohort/render pass cannot re-reveal a gated section (defense in depth).
 *   - Fails open (show default UI) on any auth/query error; billing additionally
 *     fails closed via renderBilling's own guard.
 */
(function () {
  'use strict';

  var _flagsPromise = null;

  function getSupabase() {
    if (!window.auth || typeof window.auth.isSupabaseAvailable !== 'function') return null;
    if (!window.auth.isSupabaseAvailable()) return null;
    return (typeof window.auth.getSupabaseClient === 'function') ? window.auth.getSupabaseClient() : null;
  }

  async function fetchFlags() {
    try {
      var supabase = getSupabase();
      if (!supabase) return null;
      var sessionResp = await supabase.auth.getSession();
      var session = sessionResp && sessionResp.data ? sessionResp.data.session : null;
      if (!session || !session.user) return null;
      var resp = await supabase
        .from('profiles')
        .select('is_dues_exempt, hide_calendar')
        .eq('id', session.user.id)
        .single();
      if (resp.error) {
        console.warn('[visibility] flag fetch failed:', resp.error.message);
        return null;
      }
      return resp.data || null;
    } catch (e) {
      console.warn('[visibility] flag fetch error:', e && e.message);
      return null;
    }
  }

  // Cached accessor — other modules await this.
  window.getAccountVisibilityFlags = function () {
    if (!_flagsPromise) _flagsPromise = fetchFlags();
    return _flagsPromise;
  };

  function hide(el) {
    if (el) el.style.setProperty('display', 'none', 'important');
  }

  function rerouteIfActive(viewName) {
    var view = document.getElementById('view-' + viewName);
    if (!view) return;
    var isActive = view.classList.contains('active') || view.style.display === 'block';
    if (isActive && typeof window.switchPortalView === 'function') {
      window.switchPortalView('documents', null);
    }
  }

  // Apply gating based on cached flags. Safe to call multiple times.
  window.applyAccountVisibility = async function () {
    var flags = await window.getAccountVisibilityFlags();
    if (!flags) return;

    if (flags.is_dues_exempt) {
      window.__duesExempt = true;
      hide(document.getElementById('nav-aau-billing'));
      hide(document.getElementById('aau-dues-cta'));
      rerouteIfActive('aau-billing');
    }
    if (flags.hide_calendar) {
      window.__hideCalendar = true;
      hide(document.getElementById('nav-calendar'));
      rerouteIfActive('calendar');
    }
  };
})();
