/**
 * GODSPEED BASKETBALL. Lineup board, inside the Coach Portal (Players section).
 *
 * V2, 2026-10-08. V1 showed the average of five players' skill ratings and the
 * change when you added one. That was the wrong tool and Scott was right to
 * reject it: an average of five drops when you add a player below the current
 * mean, even when he is the best man left on the bench, and a mean hides the
 * one defender who gets beaten every possession. Neither tells a coach what to
 * do in a timeout. There are no averages on this screen.
 *
 * Instead the screen answers the questions the Team Black playbook already
 * poses, against the 47 sub-skills the coach has actually scored 1 to 5:
 *
 *   PACK LINE (primary)
 *     Who takes the Star. Where they will attack us. Are there two trappers on
 *     the floor, which both Star and "Green ball, go" require. Is there a rim
 *     safety behind the trap. Who is weakest on closeouts (rule 4) and on hit
 *     and get (rule 5). Who can break pressure. Who the other team must stay
 *     attached to.
 *
 *   1-3-1 (special occasions)
 *     The best fit of these five to Top, Wing, Middle, Wing, Tail, chosen by
 *     brute force over all 120 arrangements and scored on the sub-skills each
 *     slot actually uses. The weakest slot is named, because that is where the
 *     zone breaks.
 *
 *   COMPARE
 *     Floor A against Floor B on the same checklist, side by side. This
 *     replaces the change column. Two real fives, not a floating delta.
 *
 * Roles come from claude/PLAYBOOK-team-black-defense.md, plus Scott's
 * 2026-10-08 call adding Zayne Smith and Jazsias Ware as trappers. They are
 * matched by athlete id, below, and are the one thing on this screen that is a
 * decision rather than a measurement. A player in neither list is treated as
 * contain-and-safety until Scott says otherwise, which is the conservative
 * reading of his own rule: do not give more responsibility to the defensive
 * liabilities.
 *
 * Contract:
 *   window.CoachLineup.open()   renders into #lineup-view and shows it
 *   Reads: window.CoachHome.state.raw (roster, athletes) and
 *   window.CoachDevBoard.state.dev (position, skills, subs). Both are already
 *   loaded and RLS scoped to this coach's teams. No reads of its own.
 *   Writes: none.
 *   Coach only. Never shown to parents. No emojis. No em dashes. Sentence case.
 */
(function () {
  'use strict';
  var el = function (id) { return document.getElementById(id); };
  function esc(s) { return (s == null ? '' : String(s)).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function board() { return window.CoachDevBoard; }
  function raw() { var b = board(); var live = window.CoachHome && window.CoachHome.state && window.CoachHome.state.raw; return live || (b && b.state && b.state.cachedRoster) || null; }
  function devAll() { var b = board(); return (b && b.state && b.state.dev) || {}; }

  var FLOOR_MAX = 5;

  // The sub-skills this screen reads, by the key they carry in player_development.subs.
  var SUB = {
    ballPressure: 'defense.ballPressure', closeout: 'defense.closeout', slides: 'defense.slides',
    boxOut: 'defense.boxOut', stance: 'defense.stance',
    helpPos: 'defInstincts.helpPosition', helpRec: 'defInstincts.helpRecover',
    deflect: 'defInstincts.deflections', transD: 'defInstincts.transitionD', comms: 'defInstincts.communication',
    lateEffort: 'stamina.lateEffort', hPressure: 'handles.pressure',
    catchShoot: 'shooting.catchShoot', driveKick: 'vision.driveKick'
  };
  var SUB_LABEL = {
    ballPressure: 'on-ball pressure', closeout: 'closeouts', slides: 'slides', boxOut: 'box out',
    stance: 'stance', helpPos: 'help position', helpRec: 'help and recover', deflect: 'deflections',
    transD: 'transition D', comms: 'talk', lateEffort: 'late effort', hPressure: 'handling pressure',
    catchShoot: 'catch and shoot', driveKick: 'drive and kick'
  };

  // From the Team Black playbook. Only these may leave their man to trap.
  var TRAPPERS = {
    'a1000000-0000-0000-0000-000000000009': 'Gene Fashaw Jr.',
    'a1000000-0000-0000-0000-000000000002': 'Quest Scott',
    'a1000000-0000-0000-0000-000000000006': 'Anton B',
    'a1000000-0000-0000-0000-000000000007': 'Emory White',
    'cab217f3-864c-4883-b5be-c6cbff552a31': 'Zayne Smith',
    '88d59ac4-9976-41d4-965a-8965269e2ba4': 'Jazsias Ware'
  };
  // Guard Greens, never leave to trap, safeties behind every trap.
  var NEVER_TRAP = {
    '8d53a462-d21d-4c50-98aa-2a014698b3f7': 'Kai West',
    'a1000000-0000-0000-0000-000000000008': 'Ashton Bowman'
  };
  // Own the rim after a trap.
  var RIM = {
    '8d53a462-d21d-4c50-98aa-2a014698b3f7': 'Kai West',
    '4b0bad3b-1a36-4eae-a181-f8822dac2e6a': 'Zach'
  };
  // Scott's named 1-3-1, honoured verbatim when all five are on the floor.
  var NAMED_131 = {
    top: 'a1000000-0000-0000-0000-000000000006',
    wing1: 'a1000000-0000-0000-0000-000000000002',
    middle: '4b0bad3b-1a36-4eae-a181-f8822dac2e6a',
    wing2: 'a1000000-0000-0000-0000-000000000009',
    tail: 'a1000000-0000-0000-0000-000000000007'
  };
  // What each 1-3-1 slot actually has to do, and the sub-skills it runs on.
  var SLOTS = [
    { key: 'top', label: 'Top', need: ['ballPressure', 'deflect', 'stance'], why: 'Pressures the ball and traps the first wing pass' },
    { key: 'wing1', label: 'Wing', need: ['closeout', 'ballPressure', 'lateEffort'], why: 'Covers the wing, closes out short and choppy' },
    { key: 'middle', label: 'Middle', need: ['helpPos', 'boxOut', 'helpRec'], why: 'Owns the high post and the glass' },
    { key: 'wing2', label: 'Wing', need: ['closeout', 'ballPressure', 'lateEffort'], why: 'Covers the wing, closes out short and choppy' },
    { key: 'tail', label: 'Tail', need: ['lateEffort', 'slides', 'deflect'], why: 'Runs the baseline corner to corner' }
  ];

  var state = { teamId: null, floors: { A: [], B: [] }, active: 'A', tab: 'A', rankMode: 'total', rankMust: null, psort: 'stopper' };

  // ---------- model ----------
  function teams() { var rw = raw(); return rw ? rw.teams.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }) : []; }
  function playersOf(teamId) {
    var rw = raw(); if (!rw) return [];
    var byId = {}; rw.athletes.forEach(function (a) { byId[a.id] = a; });
    var out = [];
    rw.rosters.forEach(function (m) { if (m.left_at || m.team_id !== teamId) return; var a = byId[m.athlete_id]; if (a && a.enrollment_status !== 'inactive') out.push(a); });
    out.sort(function (a, b) { return ((a.first_name || '') + (a.last_name || '')).localeCompare((b.first_name || '') + (b.last_name || '')); });
    return out;
  }
  function athlete(id) { var rw = raw(); if (!rw) return null; return rw.athletes.filter(function (a) { return a.id === id; })[0] || null; }
  function name(a) { if (!a) return 'Player'; var l = (a.last_name || '').trim(); return (((a.first_name || '').trim()) + (l ? ' ' + l.charAt(0) + '.' : '')) || 'Player'; }
  function fullName(a) { if (!a) return 'Player'; return (((a.first_name || '') + ' ' + (a.last_name || '')).trim()) || 'Player'; }
  function nm(id) { return name(athlete(id)); }
  function dev(id) { return devAll()[id] || null; }
  function positionOf(id) { var d = dev(id); return (d && d.position) || null; }

  // A sub-score exists only where the coach actually scored it. Null means not
  // scored, and null is never treated as a low score anywhere on this screen.
  function sub(id, key) {
    var d = dev(id); if (!d || !d.subs) return null;
    var v = d.subs[SUB[key]];
    if (v == null || v === '') return null;
    v = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(v) ? null : v;
  }
  function rated(id) { var d = dev(id); if (!d || !d.subs) return false; return Object.keys(SUB).some(function (k) { return sub(id, k) != null; }); }
  function floor() { return state.floors[state.active] || []; }
  function floorOf(k) { return state.floors[k] || []; }

  // Best and worst on a given sub-skill among the players who have it scored.
  function bestOn(ids, key, tiebreak) {
    var c = ids.filter(function (i) { return sub(i, key) != null; });
    if (!c.length) return null;
    c.sort(function (a, b) {
      var d = sub(b, key) - sub(a, key); if (d) return d;
      if (tiebreak) { var t = (sub(b, tiebreak) || 0) - (sub(a, tiebreak) || 0); if (t) return t; }
      return nm(a).localeCompare(nm(b));
    });
    return { id: c[0], v: sub(c[0], key) };
  }
  function worstOn(ids, key) {
    var c = ids.filter(function (i) { return sub(i, key) != null; });
    if (!c.length) return null;
    c.sort(function (a, b) { return sub(a, key) - sub(b, key) || nm(a).localeCompare(nm(b)); });
    return { id: c[0], v: sub(c[0], key) };
  }
  function whoAtLeast(ids, key, min) { return ids.filter(function (i) { var v = sub(i, key); return v != null && v >= min; }); }
  function trappersOn(ids) { return ids.filter(function (i) { return !!TRAPPERS[i]; }); }
  function rimOn(ids) { return ids.filter(function (i) { return !!RIM[i]; }); }
  function neverTrapOn(ids) { return ids.filter(function (i) { return !!NEVER_TRAP[i]; }); }
  function unratedOn(ids) { return ids.filter(function (i) { return !rated(i); }); }

  // ---------- 1-3-1 assignment ----------
  // Score a player in a slot: the mean of the sub-skills that slot runs on,
  // over the ones he has scored. Null when he has none of them.
  function slotFit(id, slot) {
    var vals = slot.need.map(function (k) { return sub(id, k); }).filter(function (v) { return v != null; });
    if (!vals.length) return null;
    return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
  }
  function permute(arr) {
    if (arr.length <= 1) return [arr];
    var out = [];
    arr.forEach(function (x, i) {
      var rest = arr.slice(0, i).concat(arr.slice(i + 1));
      permute(rest).forEach(function (p) { out.push([x].concat(p)); });
    });
    return out;
  }
  // Brute force all 120 arrangements of five players over five slots and keep
  // the one with the best total fit. Ties go to the arrangement whose weakest
  // slot is strongest, because the zone breaks at its weakest slot.
  function best131(ids) {
    if (ids.length !== FLOOR_MAX) return null;
    var named = Object.keys(NAMED_131).every(function (k) { return ids.indexOf(NAMED_131[k]) >= 0; });
    if (named) {
      return {
        named: true,
        rows: SLOTS.map(function (s) { var id = NAMED_131[s.key]; return { slot: s, id: id, fit: slotFit(id, s) }; })
      };
    }
    var best = null;
    permute(ids).forEach(function (p) {
      var rows = SLOTS.map(function (s, i) { return { slot: s, id: p[i], fit: slotFit(p[i], s) }; });
      var scored = rows.filter(function (r) { return r.fit != null; });
      if (!scored.length) return;
      var total = scored.reduce(function (a, r) { return a + r.fit; }, 0);
      var min = Math.min.apply(null, scored.map(function (r) { return r.fit; }));
      if (!best || total > best.total + 1e-9 || (Math.abs(total - best.total) < 1e-9 && min > best.min)) best = { total: total, min: min, rows: rows };
    });
    return best ? { named: false, rows: best.rows } : null;
  }

  var CSS = '\
#lineup-view{font-family:Inter,-apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif;color:#1d1d1f;padding-bottom:56px}\
#lineup-view .lu-panel{background:#fff;border:1px solid #ececf0;border-radius:16px;padding:16px 18px;box-shadow:0 1px 2px rgba(15,23,42,.04),0 6px 16px rgba(15,23,42,.06)}\
#lineup-view .lu-lead{border-left:4px solid #1A3A8F;margin-bottom:14px}\
#lineup-view .lu-lead h4{margin:0 0 4px;font-size:17px;font-weight:800;letter-spacing:-.01em;text-transform:none}\
#lineup-view .lu-lead p{margin:0;font-size:13.5px;color:#6e6e73;line-height:1.5}\
#lineup-view .lu-sec{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#1A3A8F;margin:22px 0 8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}\
#lineup-view .lu-sec small{font-weight:600;color:#a1a1a6;letter-spacing:0;text-transform:none;font-size:12px}\
#lineup-view .lu-teams{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}\
#lineup-view .lu-teams button,#lineup-view .lu-bar button{min-height:38px;padding:0 14px;border-radius:999px;border:1px solid #d9d9de;background:#fff;font:inherit;font-size:13.5px;font-weight:600;color:#1d1d1f;cursor:pointer}\
#lineup-view .lu-teams button.on,#lineup-view .lu-bar button.on{background:#1A3A8F;border-color:#1A3A8F;color:#fff}\
#lineup-view .lu-bar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center}\
#lineup-view .lu-bar .sp{flex:1}\
#lineup-view .lu-grid{display:grid;grid-template-columns:minmax(250px,320px) 1fr;gap:14px;align-items:start}\
#lineup-view .lu-slots{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:12px}\
#lineup-view .lu-slot{border:1px dashed #d9d9de;border-radius:12px;min-height:62px;padding:8px 10px;display:flex;flex-direction:column;justify-content:center;gap:3px;background:#fafafa}\
#lineup-view .lu-slot.filled{border-style:solid;border-color:#1A3A8F;background:#fff;cursor:pointer}\
#lineup-view .lu-slot b{font-size:13px;font-weight:700;line-height:1.2}#lineup-view .lu-slot span{font-size:11px;color:#6e6e73}\
#lineup-view .lu-slot em{font-style:normal;font-size:11.5px;color:#a1a1a6}\
#lineup-view .lu-slot .tg{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#1A3A8F}\
#lineup-view .lu-slot .tg.nt{color:#c2410c}\
#lineup-view .lu-pool{display:flex;flex-direction:column;gap:6px;max-height:620px;overflow:auto}\
#lineup-view .lu-p{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:1px solid #ececf0;background:#fff;border-radius:12px;padding:9px 11px;font:inherit;cursor:pointer;min-height:48px}\
#lineup-view .lu-p:hover{border-color:#c7c7cc}#lineup-view .lu-p.on{border-color:#1A3A8F;background:#f4f6fd}\
#lineup-view .lu-p[disabled]{opacity:.45;cursor:default}\
#lineup-view .lu-p b{font-size:14px;font-weight:700;display:block;line-height:1.25}\
#lineup-view .lu-p small{font-size:11.5px;color:#6e6e73;display:block}\
#lineup-view .lu-p .nodata{color:#c2410c;font-weight:700}\
#lineup-view .lu-p .tag{margin-left:auto;font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#1A3A8F;flex:0 0 auto;text-align:right;line-height:1.5}\
#lineup-view .lu-p .tag i{font-style:normal;display:block;color:#c2410c}\
#lineup-view .lu-call{display:flex;gap:12px;align-items:flex-start;padding:13px 0;border-bottom:1px solid #ececf0}\
#lineup-view .lu-call:last-child{border-bottom:0}\
#lineup-view .lu-call .dot{width:10px;height:10px;border-radius:50%;flex:0 0 10px;margin-top:5px;background:#159a52}\
#lineup-view .lu-call.warn .dot{background:#d97706}#lineup-view .lu-call.bad .dot{background:#d92d20}\
#lineup-view .lu-call .cp{flex:1;min-width:0}\
#lineup-view .lu-call h5{margin:0 0 2px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#a1a1a6}\
#lineup-view .lu-call b{display:block;font-size:15.5px;font-weight:700;line-height:1.35;letter-spacing:-.01em}\
#lineup-view .lu-call.bad b{color:#d92d20}#lineup-view .lu-call.warn b{color:#c2410c}\
#lineup-view .lu-call small{display:block;font-size:12.5px;color:#6e6e73;margin-top:3px;line-height:1.45}\
#lineup-view .lu-z{display:grid;grid-template-columns:72px 1fr 54px;gap:12px;align-items:center;padding:11px 0;border-bottom:1px solid #ececf0}\
#lineup-view .lu-z:last-child{border-bottom:0}\
#lineup-view .lu-z .sl{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#1A3A8F}\
#lineup-view .lu-z b{display:block;font-size:14.5px;font-weight:700}#lineup-view .lu-z small{display:block;font-size:12px;color:#6e6e73;margin-top:2px;line-height:1.4}\
#lineup-view .lu-z .fit{text-align:right;font-size:17px;font-weight:800;letter-spacing:-.01em}\
#lineup-view .lu-z.weak{background:#fff0eb;margin:0 -18px;padding:11px 18px}\
#lineup-view .lu-z.weak .fit{color:#c2410c}\
#lineup-view .lu-z .fit.nod{font-size:12px;font-weight:700;color:#a1a1a6}\
#lineup-view .lu-cmp{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start}\
#lineup-view .lu-cmp h4{margin:0 0 10px;font-size:15px;font-weight:800;text-transform:none}\
#lineup-view .lu-note{font-size:12.5px;color:#6e6e73;margin-top:10px;line-height:1.5}\
#lineup-view .lu-empty{color:#6e6e73;font-size:14px;padding:6px 0;line-height:1.5}\
#lineup-view .lu-foot{margin-top:18px;font-size:12.5px;color:#6e6e73;line-height:1.5}\
\
#lineup-view .lu-tbl{padding:0;overflow-x:auto}\
#lineup-view .lu-tbl table{border-collapse:collapse;width:100%;font-size:13px}\
#lineup-view .lu-tbl th{text-align:left;font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#a1a1a6;padding:12px 10px;border-bottom:1px solid #ececf0;white-space:nowrap;vertical-align:bottom}\
#lineup-view .lu-tbl th i{font-style:normal;display:block;font-size:9.5px;color:#c7c7cc;font-weight:600}\
#lineup-view .lu-tbl th.sortable{cursor:pointer}#lineup-view .lu-tbl th.sortable:hover{color:#1A3A8F}\
#lineup-view .lu-tbl th.on,#lineup-view .lu-tbl td.on{background:#f4f6fd;color:#1A3A8F}\
#lineup-view .lu-tbl td{padding:10px;border-bottom:1px solid #f2f2f5;white-space:nowrap}\
#lineup-view .lu-tbl tr:last-child td{border-bottom:0}\
#lineup-view .lu-tbl td.r,#lineup-view .lu-tbl th.r{text-align:right}\
#lineup-view .lu-tbl td b{font-weight:700}#lineup-view .lu-tbl td small{color:#a1a1a6;font-size:11.5px}\
#lineup-view .lu-tbl td.tot{font-size:16px;font-weight:800;letter-spacing:-.01em}\
#lineup-view .lu-tbl td.bad{color:#c2410c;font-weight:600}\
#lineup-view .lu-tbl td.rl{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#1A3A8F}\
#lineup-view .lu-tbl td.rl i{font-style:normal;color:#c2410c}\
#lineup-view .lu-tbl tr.dim td{opacity:.5}#lineup-view .lu-tbl .nod{color:#c7c7cc}\
#lineup-view .lu-tbl .mini{min-height:30px;padding:0 11px;border-radius:999px;border:1px solid #d9d9de;background:#fff;font:inherit;font-size:12px;font-weight:600;cursor:pointer}\
#lineup-view .lu-tbl .mini:hover{border-color:#1A3A8F;color:#1A3A8F}\
@media (max-width:900px){#lineup-view .lu-grid,#lineup-view .lu-cmp{grid-template-columns:1fr}#lineup-view .lu-slots{grid-template-columns:repeat(3,1fr)}}';
  function injectCss() { if (el('lineup-css')) return; var s = document.createElement('style'); s.id = 'lineup-css'; s.textContent = CSS; document.head.appendChild(s); }

  // ---------- the pack line read ----------
  function callRow(tone, head, line, note) {
    return '<div class="lu-call ' + tone + '"><span class="dot"></span><div class="cp"><h5>' + esc(head) + '</h5><b>' + line + '</b>' + (note ? '<small>' + note + '</small>' : '') + '</div></div>';
  }
  function packLine(ids) {
    if (!ids.length) return '<div class="lu-panel lu-empty">Pick a player to start a five.</div>';
    var h = '<div class="lu-panel">';
    var un = unratedOn(ids);

    var star = bestOn(ids, 'ballPressure', 'slides');
    h += star
      ? callRow('', 'Take the Star', esc(nm(star.id)) + ' on their best player',
          'Best on-ball pressure on the floor at ' + star.v + ' of 5. Turn him to the sideline, never middle.')
      : callRow('bad', 'Take the Star', 'Nobody on this five has been scored on on-ball pressure',
          'Rate them on the development board and this line fills in.');

    var weak = worstOn(ids, 'ballPressure');
    if (weak && (!star || weak.id !== star.id)) {
      var wc = worstOn(ids, 'closeout');
      h += callRow(weak.v <= 1 ? 'bad' : 'warn', 'Where they will attack us', 'They will go at ' + esc(nm(weak.id)),
        'Lowest on-ball pressure on the floor at ' + weak.v + ' of 5. Put him on a Green so his man is the one we sag off.'
        + (wc && wc.id === weak.id ? ' He is also the weakest closeout here at ' + wc.v + ' of 5.' : ''));
    }

    var tr = trappersOn(ids), nt = neverTrapOn(ids);
    h += callRow(tr.length >= 2 ? '' : 'bad', 'Trappers on the floor',
      tr.length ? tr.map(function (i) { return esc(nm(i)); }).join(', ') : 'None',
      tr.length >= 2
        ? 'Star and Green ball, go are both live. Each needs his defender plus the nearest trapper.'
        : 'Star and Green ball, go both need two. With ' + tr.length + ' you cannot trap out of this five, stay in the pack.');
    if (nt.length) h += callRow('', 'Contain and safety', nt.map(function (i) { return esc(nm(i)); }).join(', '),
      'Guards a Green, never leaves to trap, stays home as the safety.');

    var rim = rimOn(ids);
    h += callRow(rim.length ? '' : 'bad', 'Rim behind the trap',
      rim.length ? rim.map(function (i) { return esc(nm(i)); }).join(' and ') : 'Nobody',
      rim.length ? 'If the ball gets out, sprint back to the pack and he owns the rim.'
                 : 'Neither Kai nor Zach is on the floor. A trap that gets broken is a layup. Do not call Star with this five.');

    var co = worstOn(ids, 'closeout');
    if (co) h += callRow(co.v <= 1 ? 'warn' : '', 'Closeouts, rule 4', 'Weakest is ' + esc(nm(co.id)) + ' at ' + co.v + ' of 5',
      'Short and choppy with a high hand. Their shooter should not be his man.');

    var bo = worstOn(ids, 'boxOut');
    var boAll = ids.filter(function (i) { return sub(i, 'boxOut') != null; });
    var boTop = boAll.length ? Math.max.apply(null, boAll.map(function (i) { return sub(i, 'boxOut'); })) : null;
    if (bo) h += callRow(boTop != null && boTop <= 2 ? 'warn' : '', 'Hit and get, rule 5',
      boTop != null && boTop <= 2 ? 'Nobody on this five is above a ' + boTop + ' in box out' : 'Weakest is ' + esc(nm(bo.id)) + ' at ' + bo.v + ' of 5',
      'This is a roster problem, not a lineup problem. Every five you build will read the same until box out is coached up.');

    var rel = whoAtLeast(ids, 'hPressure', 3);
    h += callRow(rel.length ? '' : 'bad', 'Breaking their pressure',
      rel.length ? rel.map(function (i) { return esc(nm(i)); }).join(', ') : 'Nobody',
      rel.length ? 'Get it to him against a press.' : 'Nobody on this five is a 3 or better handling pressure. Against a press this five turns it over.');

    var sh = whoAtLeast(ids, 'catchShoot', 3);
    h += callRow(sh.length ? '' : 'warn', 'Who they have to guard',
      sh.length ? sh.map(function (i) { return esc(nm(i)); }).join(', ') : 'Nobody',
      sh.length ? 'A 3 or better in catch and shoot. Space the floor around the drive.'
                : 'No shooter on the floor. They will pack it in and we have to get to the rim.');

    if (un.length) h += callRow('warn', 'Not rated', un.map(function (i) { return esc(nm(i)); }).join(', '),
      'No sub-skills scored, so he is counted in the five but left out of every read above.');
    return h + '</div>';
  }

  // ---------- the 1-3-1 read ----------
  function oneThreeOne(ids) {
    if (ids.length !== FLOOR_MAX) return '<div class="lu-panel lu-empty">Fill all five to see the 1-3-1.</div>';
    var a = best131(ids);
    if (!a) return '<div class="lu-panel lu-empty">Nobody on this five has been scored on the sub-skills the zone runs on.</div>';
    var scored = a.rows.filter(function (r) { return r.fit != null; });
    var min = scored.length ? Math.min.apply(null, scored.map(function (r) { return r.fit; })) : null;
    var h = '<div class="lu-panel">';
    a.rows.forEach(function (r) {
      var weakest = r.fit != null && min != null && Math.abs(r.fit - min) < 1e-9 && scored.length > 1;
      var parts = r.slot.need.map(function (k) { var v = sub(r.id, k); return SUB_LABEL[k] + ' ' + (v == null ? 'not rated' : v); }).join(', ');
      parts = parts.charAt(0).toUpperCase() + parts.slice(1);
      h += '<div class="lu-z' + (weakest ? ' weak' : '') + '"><span class="sl">' + esc(r.slot.label) + '</span>';
      h += '<div><b>' + esc(nm(r.id)) + '</b><small>' + esc(r.slot.why) + '. ' + esc(parts) + '.</small></div>';
      h += r.fit == null ? '<span class="fit nod">no data</span>' : '<span class="fit">' + r.fit.toFixed(1) + '</span>';
      h += '</div>';
    });
    h += '</div>';
    h += '<div class="lu-note">' + (a.named
      ? 'This is your named 1-3-1 from the playbook: Anton top, Quest wing, Zach middle, Jr wing, Emory tail.'
      : 'Best of the 120 ways to arrange these five, scored on the sub-skills each slot runs on. The highlighted slot is where the zone breaks, so that is the pass they will find.')
      + ' Trap the first wing pass, and go back to the pack line once they score on it twice.</div>';
    return h;
  }


  // ---------- ranking ----------
  // Two indices per player, each the mean of that player's OWN related sub-skills.
  // This is not an average across players, which is what V1 got wrong. It is the
  // roll-up of one boy's four stopper scores into one number so he can be ranked.
  var STOP_KEYS = ['ballPressure', 'slides', 'stance', 'closeout'];
  var HELP_KEYS = ['helpPos', 'helpRec', 'deflect', 'transD'];
  function idx(id, keys) {
    var v = keys.map(function (k) { return sub(id, k); }).filter(function (x) { return x != null; });
    return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : null;
  }
  function stopper(id) { return idx(id, STOP_KEYS); }
  function helper(id) { return idx(id, HELP_KEYS); }
  function sc01(v) { return (v - 1) / 4; }
  function topMean(arr, n) {
    var s = arr.slice().sort(function (a, b) { return b - a; }).slice(0, n);
    return s.reduce(function (a, b) { return a + b; }, 0) / s.length;
  }

  // A five scored out of 100. Seven named jobs, each weighted by what it costs
  // when it is missing. The weak link carries the most, 25, because he is the
  // man they will attack every possession and he is exactly what an average hid.
  var WEIGHTS = [
    { k: 'poa', w: 20, label: 'Point of attack', why: 'Best stopper on the floor. He takes their Star.' },
    { k: 'weak', w: 25, label: 'Weak link', why: 'Worst stopper on the floor. The higher this is, the fewer places they can go.' },
    { k: 'trap', w: 15, label: 'Trap ready', why: 'Two trappers or the Star and Green ball calls are off.' },
    { k: 'rim', w: 10, label: 'Rim', why: 'A safety behind the trap. Without it a broken trap is a layup.' },
    { k: 'help', w: 10, label: 'Help', why: 'Best two help defenders on the floor.' },
    { k: 'press', w: 10, label: 'Press break', why: 'Best two at handling pressure.' },
    { k: 'spc', w: 10, label: 'Spacing', why: 'Best two in catch and shoot. Keeps them out of the paint.' }
  ];
  function scoreFive(ids) {
    var st = ids.map(stopper);
    if (st.some(function (v) { return v == null; })) return null;
    var hp = ids.map(function (i) { var v = helper(i); return v == null ? 1 : v; });
    var pr = ids.map(function (i) { var v = sub(i, 'hPressure'); return v == null ? 1 : v; });
    var sh = ids.map(function (i) { var v = sub(i, 'catchShoot'); return v == null ? 1 : v; });
    var tr = trappersOn(ids).length;
    var best = Math.max.apply(null, st), worst = Math.min.apply(null, st);
    var o = {
      poa: sc01(best) * 20, weak: sc01(worst) * 25,
      trap: tr >= 2 ? 15 : tr === 1 ? 5 : 0,
      rim: rimOn(ids).length ? 10 : 0,
      help: sc01(topMean(hp, 2)) * 10,
      press: sc01(topMean(pr, 2)) * 10,
      spc: sc01(topMean(sh, 2)) * 10,
      best: best, worst: worst, ntrap: tr,
      stopId: ids[st.indexOf(best)], weakId: ids[st.indexOf(worst)]
    };
    o.total = o.poa + o.weak + o.trap + o.rim + o.help + o.press + o.spc;
    return o;
  }
  function combos5(pool) {
    var out = [];
    (function rec(start, acc) {
      if (acc.length === FLOOR_MAX) { out.push(acc.slice()); return; }
      for (var i = start; i < pool.length; i++) { acc.push(pool[i]); rec(i + 1, acc); acc.pop(); }
    })(0, []);
    return out;
  }
  var _rankCache = { key: null, rows: [], pool: [] };
  function rankedFives() {
    var pool = playersOf(state.teamId).map(function (a) { return a.id; }).filter(function (i) { return stopper(i) != null; });
    var key = state.teamId + '|' + pool.join(',');
    if (_rankCache.key === key) return _rankCache;
    var rows = [];
    if (pool.length >= FLOOR_MAX && pool.length <= 22) {
      rows = combos5(pool).map(function (c) { var s = scoreFive(c); return s ? { ids: c, s: s } : null; })
        .filter(function (x) { return x; });
    }
    _rankCache = { key: key, rows: rows, pool: pool };
    return _rankCache;
  }
  var RANK_MODES = [
    { k: 'total', label: 'Best overall' },
    { k: 'weak', label: 'Hardest to attack' },
    { k: 'poa', label: 'Best point of attack' },
    { k: 'press', label: 'Best against a press' },
    { k: 'spc', label: 'Most spacing' },
    { k: 'help', label: 'Best help and rotation' }
  ];
  var PCOLS = [
    { k: 'stopper', label: 'Stopper', hint: 'on ball, slides, stance, closeouts' },
    { k: 'helper', label: 'Helper', hint: 'help position, recover, deflections, transition' },
    { k: 'hPressure', label: 'Press', hint: 'handling pressure' },
    { k: 'catchShoot', label: 'Shoot', hint: 'catch and shoot' },
    { k: 'boxOut', label: 'Box', hint: 'box out' },
    { k: 'lateEffort', label: 'Motor', hint: 'late effort' },
    { k: 'comms', label: 'Talk', hint: 'communication' }
  ];
  function pval(id, k) { return k === 'stopper' ? stopper(id) : k === 'helper' ? helper(id) : sub(id, k); }

  function rankHtml() {
    var r = rankedFives();
    var h = '';
    // --- players ---
    h += '<div class="lu-sec">Players, ranked<small>every number is a score you entered, 1 to 5. Tap a column to sort.</small></div>';
    var list = playersOf(state.teamId);
    var rows = list.map(function (a) { return a.id; });
    var sortK = state.psort || 'stopper';
    var ratedIds = rows.filter(function (i) { return pval(i, sortK) != null; });
    var noneIds = rows.filter(function (i) { return pval(i, sortK) == null; });
    ratedIds.sort(function (a, b) { return pval(b, sortK) - pval(a, sortK) || (stopper(b) || 0) - (stopper(a) || 0) || nm(a).localeCompare(nm(b)); });
    h += '<div class="lu-panel lu-tbl"><table><thead><tr><th class="r">#</th><th>Player</th>';
    PCOLS.forEach(function (c) { h += '<th class="r sortable' + (sortK === c.k ? ' on' : '') + '" data-psort="' + c.k + '" title="' + esc(c.hint) + '">' + esc(c.label) + '</th>'; });
    h += '<th>Role</th></tr></thead><tbody>';
    ratedIds.concat(noneIds).forEach(function (id, n) {
      var none = pval(id, sortK) == null;
      h += '<tr' + (none ? ' class="dim"' : '') + '><td class="r">' + (none ? '-' : n + 1) + '</td><td><b>' + esc(fullName(athlete(id))) + '</b></td>';
      PCOLS.forEach(function (c) {
        var v = pval(id, c.k);
        h += '<td class="r' + (c.k === sortK ? ' on' : '') + '">' + (v == null ? '<span class="nod">-</span>' : (v % 1 ? v.toFixed(2) : v)) + '</td>';
      });
      h += '<td class="rl">' + (TRAPPERS[id] ? 'Trapper' : NEVER_TRAP[id] ? '<i>Never traps</i>' : '') + (RIM[id] ? (TRAPPERS[id] || NEVER_TRAP[id] ? ', ' : '') + 'Rim' : '') + '</td></tr>';
    });
    h += '</tbody></table></div>';
    if (noneIds.length) h += '<div class="lu-note">' + noneIds.map(function (i) { return esc(fullName(athlete(i))); }).join(', ') + ' not scored on this, so not ranked and not in any five below.</div>';

    // --- fives ---
    if (!r.rows.length) {
      h += '<div class="lu-sec">Fives, ranked</div><div class="lu-panel lu-empty">Needs at least five rated players on the team' + (r.pool.length > 22 ? ', and this roster is too large to rank every five' : '') + '.</div>';
      return h;
    }
    var mode = state.rankMode || 'total';
    var must = state.rankMust || null;
    var all = r.rows.filter(function (x) { return !must || x.ids.indexOf(must) >= 0; });
    all = all.slice().sort(function (a, b) { return b.s[mode] - a.s[mode] || b.s.total - a.s.total; });
    h += '<div class="lu-sec">Fives, ranked<small>all ' + r.rows.length + ' possible fives from the ' + r.pool.length + ' rated players, scored out of 100</small></div>';
    h += '<div class="lu-bar">' + RANK_MODES.map(function (m) { return '<button type="button" data-rmode="' + m.k + '" class="' + (mode === m.k ? 'on' : '') + '">' + esc(m.label) + '</button>'; }).join('') + '</div>';
    h += '<div class="lu-bar"><span style="font-size:12.5px;color:#6e6e73;font-weight:600">Must include</span>';
    h += '<button type="button" data-rmust="" class="' + (must ? '' : 'on') + '">Anyone</button>';
    r.pool.forEach(function (i) { h += '<button type="button" data-rmust="' + esc(i) + '" class="' + (must === i ? 'on' : '') + '">' + esc(nm(i)) + '</button>'; });
    h += '</div>';
    h += '<div class="lu-panel lu-tbl"><table><thead><tr><th class="r">#</th><th>Five</th><th class="r">Total</th>';
    WEIGHTS.forEach(function (w) { h += '<th class="r' + (mode === w.k ? ' on' : '') + '" title="' + esc(w.why) + '">' + esc(w.label) + '<i>/' + w.w + '</i></th>'; });
    h += '<th>Stopper</th><th>They attack</th><th></th></tr></thead><tbody>';
    all.slice(0, 25).forEach(function (x, n) {
      h += '<tr><td class="r">' + (n + 1) + '</td><td><b>' + x.ids.map(function (i) { return esc(nm(i)); }).join(', ') + '</b></td>';
      h += '<td class="r tot">' + x.s.total.toFixed(1) + '</td>';
      WEIGHTS.forEach(function (w) { h += '<td class="r' + (mode === w.k ? ' on' : '') + '">' + x.s[w.k].toFixed(1) + '</td>'; });
      h += '<td>' + esc(nm(x.s.stopId)) + ' <small>' + x.s.best.toFixed(2) + '</small></td>';
      h += '<td class="bad">' + esc(nm(x.s.weakId)) + ' <small>' + x.s.worst.toFixed(2) + '</small></td>';
      h += '<td><button type="button" class="mini" data-load="' + esc(x.ids.join(',')) + '">Open</button></td></tr>';
    });
    h += '</tbody></table></div>';
    h += '<div class="lu-note"><b>How a five is scored.</b> ' + WEIGHTS.map(function (w) { return esc(w.label) + ' ' + w.w + ': ' + esc(w.why); }).join(' ') + ' Nothing here is an average across the five. Each job is measured on the man who does it, and the weak link carries the most weight because he is the one they will attack.</div>';
    return h;
  }

  // ---------- render ----------
  function seg() {
    var labels = ['Players', 'Team needs', 'Roster', 'Defense', 'Lineup'];
    return '<div class="gs-seg lu-seg">' + labels.map(function (l, i) { return '<button type="button" data-seg="' + i + '" class="' + (i === 4 ? 'active' : '') + '">' + esc(l) + '</button>'; }).join('') + '</div>';
  }
  var SEG_GO = [
    function () { if (window.CoachDevBoard) window.CoachDevBoard.openTab('players'); },
    function () { if (window.CoachDevBoard) window.CoachDevBoard.openTab('team'); },
    function () { if (window.CoachNav && window.CoachNav.openRoster) window.CoachNav.openRoster(); },
    function () { if (window.CoachDefense) window.CoachDefense.open(); },
    null
  ];

  function slotHtml(ids) {
    var h = '<div class="lu-slots">';
    for (var i = 0; i < FLOOR_MAX; i++) {
      var id = ids[i];
      if (!id) { h += '<div class="lu-slot"><em>Empty</em></div>'; continue; }
      var tag = TRAPPERS[id] ? '<span class="tg">Trapper</span>' : NEVER_TRAP[id] ? '<span class="tg nt">Never traps</span>' : '';
      h += '<div class="lu-slot filled" data-drop="' + esc(id) + '" role="button" tabindex="0" title="Take him off the floor">';
      h += '<b>' + esc(nm(id)) + '</b><span>' + esc(positionOf(id) || 'No position set') + '</span>' + tag + '</div>';
    }
    return h + '</div>';
  }

  function poolHtml() {
    var list = playersOf(state.teamId);
    if (!list.length) return '<div class="lu-panel lu-empty">No players on this team yet.</div>';
    var ids = floor(); var full = ids.length >= FLOOR_MAX;
    var h = '<div class="lu-panel"><div class="lu-pool">';
    list.forEach(function (a) {
      var on = ids.indexOf(a.id) >= 0;
      var bp = sub(a.id, 'ballPressure');
      var bits = []; var p = positionOf(a.id); if (p) bits.push(p);
      if (a.jersey_number != null) bits.push('#' + a.jersey_number);
      h += '<button type="button" class="lu-p' + (on ? ' on' : '') + '" data-pick="' + esc(a.id) + '"' + (!on && full ? ' disabled' : '') + '>';
      h += '<span><b>' + esc(fullName(a)) + '</b><small>' + (bits.length ? esc(bits.join(', ')) : 'No position set');
      h += bp == null ? ', <span class="nodata">not rated</span>' : ', on ball ' + bp + ' of 5';
      h += '</small></span>';
      h += '<span class="tag">' + (TRAPPERS[a.id] ? 'Trapper' : NEVER_TRAP[a.id] ? '<i>Never traps</i>' : '') + (RIM[a.id] ? '<i style="color:#1A3A8F">Rim</i>' : '') + '</span>';
      h += '</button>';
    });
    h += '</div></div>';
    if (full) h += '<div class="lu-foot">Five on the floor. Tap a player in a slot above to take him off.</div>';
    return h;
  }

  function compareHtml() {
    var A = floorOf('A'), B = floorOf('B');
    if (!A.length && !B.length) return '<div class="lu-panel lu-empty">Build Floor A and Floor B, then come back here to put them side by side.</div>';
    var col = function (k, ids) {
      var h = '<div><h4>Floor ' + k + (ids.length ? ' <span style="font-weight:600;color:#6e6e73;font-size:13px">' + ids.map(function (i) { return esc(nm(i)); }).join(', ') + '</span>' : '') + '</h4>';
      h += ids.length ? packLine(ids) : '<div class="lu-panel lu-empty">Empty.</div>';
      if (ids.length === FLOOR_MAX) { h += '<div class="lu-sec">1-3-1</div>' + oneThreeOne(ids); }
      return h + '</div>';
    };
    return '<div class="lu-cmp">' + col('A', A) + col('B', B) + '</div>';
  }

  function html() {
    var h = seg();
    h += '<div class="lu-panel lu-lead"><h4>Lineup board</h4>';
    h += '<p>Build a five and read it against your own system. Every line comes from the sub-skills you have scored, 1 to 5. Nothing here is an average, and a player you have not rated is counted in the five but left out of the reads.</p></div>';

    var rw = raw();
    if (!rw) return h + '<div class="lu-panel lu-empty">Roster is still loading. Open Home once, then come back.</div>';
    var ts = teams().filter(function (t) { return playersOf(t.id).length; });
    if (!ts.length) return h + '<div class="lu-panel lu-empty">No teams with players on them.</div>';
    if (!state.teamId || !ts.some(function (t) { return t.id === state.teamId; })) {
      var b = board(); var mine = b && b.state && b.state.myTeams ? ts.filter(function (t) { return b.state.myTeams.indexOf(t.id) >= 0; }) : [];
      state.teamId = (mine[0] || ts[0]).id; state.floors = { A: [], B: [] };
    }
    if (ts.length > 1) h += '<div class="lu-teams">' + ts.map(function (t) { return '<button type="button" data-team="' + esc(t.id) + '" class="' + (t.id === state.teamId ? 'on' : '') + '">' + esc(t.name) + '</button>'; }).join('') + '</div>';

    h += '<div class="lu-bar">';
    ['A', 'B'].forEach(function (k) {
      h += '<button type="button" data-tab="' + k + '" class="' + (state.tab === k ? 'on' : '') + '">Floor ' + k + (floorOf(k).length ? ' (' + floorOf(k).length + ')' : '') + '</button>';
    });
    h += '<button type="button" data-tab="C" class="' + (state.tab === 'C' ? 'on' : '') + '">Compare A and B</button>';
    h += '<button type="button" data-tab="R" class="' + (state.tab === 'R' ? 'on' : '') + '">Rankings</button>';
    h += '<span class="sp"></span><button type="button" data-act="clear">Clear this five</button></div>';

    if (state.tab === 'R') return h + rankHtml() + '<div class="lu-foot">Read only. Never shown to parents. Trappers, safeties and the named 1-3-1 come from your Team Black playbook.</div>';
    if (state.tab === 'C') return h + compareHtml() + '<div class="lu-foot">Read only. Never shown to parents. Trappers, safeties and the named 1-3-1 come from your Team Black playbook.</div>';

    state.active = state.tab;
    var ids = floor();
    h += slotHtml(ids);
    h += '<div class="lu-grid"><div>' + poolHtml() + '</div><div>';
    h += '<div class="lu-sec">Pack line<small>the primary</small></div>' + packLine(ids);
    h += '<div class="lu-sec">1-3-1<small>special occasions: need a run, trailing late, end of a quarter</small></div>' + oneThreeOne(ids);
    h += '</div></div>';
    h += '<div class="lu-foot">Read only. Never shown to parents. Trappers, safeties and the named 1-3-1 come from your Team Black playbook, so changing a role there is what changes it here.</div>';
    return h;
  }

  function paint() {
    var v = el('lineup-view'); if (!v) return;
    v.innerHTML = html();
    v.querySelectorAll('[data-seg]').forEach(function (b) { var go = SEG_GO[+b.getAttribute('data-seg')]; if (go) b.onclick = go; });
    v.querySelectorAll('[data-team]').forEach(function (b) { b.onclick = function () { state.teamId = b.getAttribute('data-team'); state.floors = { A: [], B: [] }; paint(); }; });
    v.querySelectorAll('[data-tab]').forEach(function (b) { b.onclick = function () { state.tab = b.getAttribute('data-tab'); paint(); }; });
    v.querySelectorAll('[data-pick]').forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-pick'); var arr = floor(); var i = arr.indexOf(id);
        if (i >= 0) arr.splice(i, 1); else { if (arr.length >= FLOOR_MAX) return; arr.push(id); }
        paint();
      };
    });
    v.querySelectorAll('[data-drop]').forEach(function (b) {
      var go = function () { var id = b.getAttribute('data-drop'); state.floors[state.active] = floor().filter(function (x) { return x !== id; }); paint(); };
      b.onclick = go; b.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
    });
    v.querySelectorAll('[data-act]').forEach(function (b) { b.onclick = function () { state.floors[state.active] = []; paint(); }; });
    v.querySelectorAll('[data-psort]').forEach(function (b) { b.onclick = function () { state.psort = b.getAttribute('data-psort'); paint(); }; });
    v.querySelectorAll('[data-rmode]').forEach(function (b) { b.onclick = function () { state.rankMode = b.getAttribute('data-rmode'); paint(); }; });
    v.querySelectorAll('[data-rmust]').forEach(function (b) { b.onclick = function () { state.rankMust = b.getAttribute('data-rmust') || null; paint(); }; });
    v.querySelectorAll('[data-load]').forEach(function (b) { b.onclick = function () { state.floors.A = b.getAttribute('data-load').split(','); state.tab = 'A'; state.active = 'A'; paint(); }; });
  }

  function ensureView() {
    var v = el('lineup-view'); if (v) return v;
    var main = document.querySelector('.dashboard-main'); if (!main) return null;
    v = document.createElement('div'); v.id = 'lineup-view'; v.style.display = 'none';
    var after = main.querySelector('.dashboard-toolbar') || main.querySelector('.dashboard-header');
    if (after && after.nextSibling) main.insertBefore(v, after.nextSibling); else main.appendChild(v);
    return v;
  }
  function open(teamId) {
    injectCss(); var v = ensureView(); if (!v) return;
    v.parentNode.querySelectorAll('div[id$="-view"]').forEach(function (x) { if (x !== v) x.style.display = 'none'; });
    var tabs = el('view-tabs'); if (tabs) tabs.style.display = 'none';
    var t = el('view-title'); if (t) t.textContent = 'Lineup';
    var s = document.querySelector('#coach-dashboard .dashboard-header .text-sub'); if (s) s.textContent = 'Build a five and read it against the pack line and the 1-3-1.';
    if (window.CoachNav && window.CoachNav.setActive) window.CoachNav.setActive(el('nav-players'));
    if (teamId) { state.teamId = teamId; state.floors = { A: [], B: [] }; }
    v.style.display = 'block'; paint();
    var b = board();
    if (b && b.ensureConfig) { b.ensureConfig().then(paint).catch(function () { paint(); }); }
    if (window.CoachPortalShell && window.CoachPortalShell.closeDrawer) { try { window.CoachPortalShell.closeDrawer(); } catch (e) { /* optional */ } }
  }

  document.addEventListener('DOMContentLoaded', function () { injectCss(); });
  window.CoachLineup = { open: open, state: state, _best131: best131, _sub: sub };
})();
