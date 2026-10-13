/* ============================================================================
 * Godspeed Basketball -- parent portal statements list
 * ----------------------------------------------------------------------------
 * Lists the statement PDFs a guardian is allowed to see and hands back a
 * short-lived signed URL when they ask for one.
 *
 * Security note: this file does no access checking of its own and must not.
 * The athlete_statements RLS policy decides which rows come back, and the
 * storage policy on the documents bucket decides whether a signed URL can be
 * minted. A guardian who is not linked to an athlete simply gets an empty list.
 *
 * Usage:  await GS_ParentStatements.mount('training-statements-list');
 * ==========================================================================*/
window.GS_ParentStatements = (function () {
  'use strict';

  var SIGNED_URL_TTL = 120; // seconds; long enough to click, short enough to not be a shareable link

  function getClient() {
    try {
      if (window.auth && typeof window.auth.getSupabaseClient === 'function') return window.auth.getSupabaseClient();
      if (window.supabaseClient) return window.supabaseClient;
      if (window._supabase) return window._supabase;
      return null;
    } catch (_) { return null; }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function prettyDate(d) {
    if (!d) return '';
    var x = new Date(String(d) + 'T12:00:00');
    if (isNaN(x)) return String(d);
    return x.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function prettySize(bytes) {
    if (!bytes) return '';
    return bytes < 1024 * 1024
      ? Math.max(1, Math.round(bytes / 1024)) + ' KB'
      : (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  /** Rows the signed-in guardian may see. RLS filters; no athlete filter needed. */
  async function list(athleteIds) {
    var client = getClient();
    if (!client) return [];
    var q = client.from('athlete_statements')
      .select('id, athlete_id, kind, title, storage_path, statement_date, period_label, hours_remaining, byte_size')
      .is('revoked_at', null)
      .order('statement_date', { ascending: false });
    if (athleteIds && athleteIds.length) q = q.in('athlete_id', athleteIds);
    var r = await q;
    if (r.error) { console.error('[Statements] list failed:', r.error.message); return []; }
    return r.data || [];
  }

  /** Short-lived signed URL. Fails closed if the viewer is not a guardian. */
  async function signedUrl(storagePath) {
    var client = getClient();
    if (!client) throw new Error('Not signed in.');
    var r = await client.storage.from('documents').createSignedUrl(storagePath, SIGNED_URL_TTL);
    if (r.error || !r.data || !r.data.signedUrl) {
      throw new Error('That statement is not available to this account.');
    }
    return r.data.signedUrl;
  }

  function rowHtml(s) {
    var sub = [prettyDate(s.statement_date),
               (s.hours_remaining != null ? parseFloat(s.hours_remaining).toFixed(1) + ' hrs remaining' : ''),
               prettySize(s.byte_size)].filter(Boolean).join(' • ');
    return '' +
      '<div class="doc-item" style="display:flex; align-items:center; gap:12px; padding:12px; border-bottom:1px solid #f0f0f0;">' +
        '<div style="background:#1A3A8F; color:#fff; width:32px; height:32px; display:flex; align-items:center; justify-content:center; border-radius:6px; font-size:11px; font-weight:700;">PDF</div>' +
        '<div style="flex:1; min-width:0;">' +
          '<div style="font-size:13px; font-weight:600;">' + esc(s.title) + '</div>' +
          '<div style="font-size:11px; color:#6b7280;">' + esc(sub) + '</div>' +
        '</div>' +
        '<button type="button" class="btn-primary gs-stmt-btn" data-path="' + esc(s.storage_path) + '" ' +
          'style="padding:6px 12px; font-size:10px; min-width:88px; min-height:44px; display:inline-flex; align-items:center; justify-content:center; border:none; cursor:pointer; line-height:1.2;">Download</button>' +
      '</div>';
  }

  function bind(container) {
    container.querySelectorAll('.gs-stmt-btn').forEach(function (btn) {
      btn.onclick = async function () {
        var original = btn.textContent;
        btn.disabled = true; btn.textContent = 'Opening...';
        try {
          var url = await signedUrl(btn.getAttribute('data-path'));
          window.open(url, '_blank', 'noopener');
        } catch (e) {
          alert(e.message || 'Could not open that statement.');
        } finally {
          btn.disabled = false; btn.textContent = original;
        }
      };
    });
  }

  /** Renders into a container id. Hides itself cleanly when there is nothing to show. */
  async function mount(containerId, athleteIds) {
    var container = document.getElementById(containerId);
    if (!container) return [];
    container.innerHTML = '<div style="font-size:12px;color:#6b7280;padding:8px 0;">Loading statements...</div>';
    var rows = await list(athleteIds);
    if (!rows.length) {
      container.innerHTML = '<div style="font-size:12px;color:#6b7280;padding:8px 0;">' +
        'No training statements yet. They appear here after a session is billed.</div>';
      return [];
    }
    container.innerHTML = rows.map(rowHtml).join('');
    bind(container);
    return rows;
  }

  // Self-mount: wait for auth to hand us a client, then fill the container.
  // Gives up quietly rather than leaving a spinner on screen forever.
  function autoMount() {
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      var container = document.getElementById('training-statements-list');
      if (!container) { if (tries > 40) clearInterval(timer); return; }
      if (getClient()) {
        clearInterval(timer);
        mount('training-statements-list').catch(function (e) {
          console.error('[Statements] mount failed:', e && e.message);
        });
      } else if (tries > 40) {
        clearInterval(timer);
        container.innerHTML = '<div style="font-size:12px;color:#6b7280;padding:8px 0;">Sign in to see your statements.</div>';
      }
    }, 250);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoMount);
  else autoMount();

  return { list: list, signedUrl: signedUrl, mount: mount };
})();
