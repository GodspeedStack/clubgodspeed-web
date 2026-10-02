/**
 * Godspeed jersey number picker.
 *
 * Numbers 0 to 99. Availability is scoped to the athlete's GRADE BAND, so the
 * two teams carrying 5th graders share one pool and a call-up never collides.
 *
 * The server is the only authority. get_jersey_availability paints the grid and
 * claim_jersey_number decides who actually gets it, so two parents tapping the
 * same tile at the same moment cannot both win. The loser is told immediately.
 *
 * Freshness comes from polling a numbers-only RPC while the card is on screen,
 * deliberately NOT from a realtime subscription on `athletes`: that table holds
 * allergies, medical notes and dates of birth, and none of that belongs on a
 * broadcast channel just to grey out a tile.
 */
window.JerseyPicker = (function () {
  'use strict';

  var POLL_MS = 6000;
  var sb = null, athleteId = null, rootEl = null, timer = null;
  var state = { rows: [], mine: null, busy: false, error: null, expanded: false };

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'style') el.style.cssText = attrs[k];
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), attrs[k]);
      else el.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  async function load() {
    try {
      var res = await sb.rpc('get_jersey_availability', { p_athlete_id: athleteId });
      if (res.error) throw res.error;
      state.rows = res.data || [];
      var mineRow = state.rows.filter(function (r) { return r.is_mine; })[0];
      state.mine = mineRow ? mineRow.number : null;
      state.error = null;
    } catch (e) {
      state.error = 'Could not load numbers. Check your connection.';
      if (window.console) console.error('JerseyPicker load:', e);
    }
    render();
  }

  async function claim(n) {
    if (state.busy) return;
    state.busy = true; render();
    try {
      var res = await sb.rpc('claim_jersey_number', { p_athlete_id: athleteId, p_number: n });
      if (res.error) throw res.error;
      if (res.data === 'taken') {
        state.error = 'Number ' + n + ' was just taken by another player. Pick a different one.';
      } else if (res.data === 'invalid_number') {
        state.error = 'That number is not allowed.';
      } else {
        state.error = null;
        state.expanded = false;   // claimed: fall back to the confirmed summary
      }
    } catch (e) {
      state.error = 'Could not save that number. Try again.';
      if (window.console) console.error('JerseyPicker claim:', e);
    }
    state.busy = false;
    await load();
  }

  function tile(row) {
    var mine = row.is_mine, taken = row.taken;
    var base = 'appearance:none;border-radius:10px;font-family:inherit;font-size:15px;' +
               'font-weight:700;padding:0;height:46px;display:flex;align-items:center;' +
               'justify-content:center;transition:transform .12s ease,box-shadow .12s ease,' +
               'background-color .12s ease;';
    var look = mine
      ? 'background:#2563eb;color:#fff;border:1px solid #2563eb;cursor:default;' +
        'box-shadow:0 2px 8px rgba(37,99,235,.28);'
      : taken
        ? 'background:#f3f4f6;color:#c4c7cc;border:1px solid #eceef1;cursor:not-allowed;' +
          'text-decoration:line-through;'
        : 'background:#fff;color:#111;border:1px solid #e5e7eb;cursor:pointer;';

    var attrs = {
      type: 'button',
      style: base + look,
      'aria-pressed': mine ? 'true' : 'false',
      'aria-label': mine
        ? 'Number ' + row.number + ', your current number'
        : taken ? 'Number ' + row.number + ', taken' : 'Choose number ' + row.number
    };
    if (taken && !mine) attrs.disabled = 'disabled';
    if (state.busy) attrs.disabled = 'disabled';
    if (!taken && !mine && !state.busy) {
      attrs.onclick = function () { claim(row.number); };
      attrs.onmouseenter = function (e) {
        e.target.style.transform = 'translateY(-1px)';
        e.target.style.boxShadow = '0 4px 12px rgba(15,23,42,.10)';
      };
      attrs.onmouseleave = function (e) {
        e.target.style.transform = '';
        e.target.style.boxShadow = '';
      };
    }
    return h('button', attrs, [String(row.number)]);
  }

  function render() {
    if (!rootEl) return;
    rootEl.innerHTML = '';

    var done = state.mine !== null;

    var pill = done
      ? h('span', { style: 'font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;'
          + 'background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;padding:4px 10px;border-radius:999px;' },
          ['Set'])
      : h('span', { style: 'font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;'
          + 'background:#FF5722;color:#fff;padding:4px 10px;border-radius:999px;' },
          ['Action needed']);

    rootEl.appendChild(h('div', {
      style: 'display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:6px;'
    }, [
      h('h3', { style: 'margin:0;font-size:1.05rem;font-weight:800;letter-spacing:-.01em;color:#111;' },
        ['Jersey number']),
      pill
    ]));

    // Finished and not being changed: one quiet line, not a wall of 100 tiles.
    // A task that still looks like a task after it is done trains parents to
    // ignore the card, and the next real action gets ignored with it.
    if (done && !state.expanded) {
      rootEl.appendChild(h('div', {
        style: 'display:flex;align-items:center;gap:14px;margin-top:10px;'
      }, [
        h('div', { style: 'flex:0 0 auto;width:52px;height:52px;border-radius:12px;background:#2563eb;'
            + 'color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;' },
          [String(state.mine)]),
        h('div', { style: 'flex:1 1 auto;min-width:0;' }, [
          h('div', { style: 'font-size:14px;color:#111;font-weight:600;' },
            ['Your player wears number ' + state.mine + '.']),
          h('div', { style: 'font-size:13px;color:#6b7280;margin-top:2px;' },
            ['You can change it until uniforms are ordered.'])
        ]),
        h('button', {
          type: 'button',
          style: 'flex:0 0 auto;appearance:none;background:none;border:none;padding:6px 2px;'
            + 'font-family:inherit;font-size:13.5px;font-weight:700;color:#2563eb;cursor:pointer;',
          onclick: function () { state.expanded = true; render(); }
        }, ['Change'])
      ]));
      return;
    }

    rootEl.appendChild(h('p', {
      style: 'margin:0 0 16px;font-size:13.5px;line-height:1.5;color:#6b7280;'
    }, [done
        ? 'Pick a different number. Greyed out numbers are already worn by someone on your team or the team you share a grade with.'
        : 'Choose a number for your player before uniforms are ordered. Greyed out numbers are already worn by someone on your team or the team you share a grade with.']));

    if (state.error) {
      rootEl.appendChild(h('div', {
        role: 'alert',
        style: 'margin-bottom:14px;padding:10px 14px;border-radius:10px;background:#FEF2F2;' +
               'border:1px solid #FECACA;color:#991B1B;font-size:13.5px;line-height:1.5;'
      }, [state.error]));
    }

    if (!state.rows.length) {
      rootEl.appendChild(h('div', {
        style: 'padding:28px 0;text-align:center;color:#9ca3af;font-size:13.5px;'
      }, ['Loading numbers...']));
      return;
    }

    var grid = h('div', {
      style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(52px,1fr));gap:8px;' +
             (state.busy ? 'opacity:.55;pointer-events:none;' : '')
    }, state.rows.map(tile));
    rootEl.appendChild(grid);
  }

  function startPolling() {
    stopPolling();
    timer = setInterval(function () {
      if (document.visibilityState === 'visible') load();
    }, POLL_MS);
  }
  function stopPolling() { if (timer) { clearInterval(timer); timer = null; } }

  return {
    mount: function (containerId, opts) {
      rootEl = document.getElementById(containerId);
      if (!rootEl) return;
      sb = opts.client;
      athleteId = opts.athleteId;
      if (!sb || !athleteId) {
        rootEl.innerHTML = '';
        rootEl.appendChild(h('div', {
          style: 'padding:24px 0;color:#9ca3af;font-size:13.5px;'
        }, ['Your athlete is not linked to this account yet. Coach Scott can fix that.']));
        return;
      }
      render();
      load();
      startPolling();
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') load();
      });
    },
    unmount: stopPolling,
    refresh: load
  };
})();
