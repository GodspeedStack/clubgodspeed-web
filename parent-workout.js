/**
 * GODSPEED BASKETBALL. The kid's workout, inside the Parent Portal.
 *
 * A player opens "Start today's workout" on the Training dashboard and does the
 * strength program or the conditioning card by himself, one screen at a time:
 * big words, one job per screen, a Set done button, built-in countdowns for the
 * timed moves and the rest between sets, a stopwatch for the three conditioning
 * tests, and a Done screen that logs the session for his coaches.
 *
 * Data: home_program() for the program (no PII in it), log_home_workout(...) to
 * save a session (family only, self-reported), home_workouts_for(id) for history.
 * Home times show on the coach's board with a Home tag; only coach-timed tests
 * set a Strength score. No emojis. No em dashes.
 */
(function () {
  'use strict';
  var el = function (id) { return document.getElementById(id); };
  function esc(s) { return (s == null ? '' : String(s)).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function client() { try { return window.auth && typeof window.auth.getSupabaseClient === 'function' ? window.auth.getSupabaseClient() : (window.supabaseClient || null); } catch (e) { return null; } }
  var program = null, history = null, athleteId = null, childName = '', loading = false;
  var REST_SECONDS = 30;

  var CSS = '\
#pw-root{margin:0 0 24px;font-family:Inter,-apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif;color:#1d1d1f}\
#pw-root .pw-card{background:#fff;border:1px solid #ececf0;border-radius:16px;box-shadow:0 1px 2px rgba(15,23,42,.04),0 6px 16px rgba(15,23,42,.06);overflow:hidden}\
#pw-root .pw-hd{padding:18px 20px 14px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;background:linear-gradient(180deg,#fff6ec,#fff);border-bottom:1px solid #ececf0}\
#pw-root .pw-hd h3{margin:6px 0 4px;font-size:20px;font-weight:800;letter-spacing:-.02em;text-transform:none}#pw-root .pw-hd p{margin:0;font-size:13.5px;color:#6e6e73;line-height:1.45}\
#pw-root .pw-tag{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#d9660a;background:#fff6ec;border-radius:999px;padding:4px 10px}\
#pw-root .pw-bd{padding:14px 20px 20px}\
#pw-root .pw-start{display:flex;gap:10px;flex-wrap:wrap}\
#pw-root .pw-big{flex:1 1 200px;min-height:64px;border-radius:14px;border:0;font:inherit;font-size:17px;font-weight:800;cursor:pointer;color:#fff;background:#0071e3;padding:0 18px}\
#pw-root .pw-big.alt{background:#1d1d1f}#pw-root .pw-big small{display:block;font-size:12px;font-weight:600;opacity:.85;margin-top:2px}\
#pw-root .pw-week{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0 4px}#pw-root .pw-week span{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#6e6e73;width:100%}\
#pw-root .pw-week button{width:40px;height:40px;border-radius:10px;border:1px solid #d9d9de;background:#fff;font:inherit;font-weight:700;cursor:pointer;color:#1d1d1f}#pw-root .pw-week button.on{background:#1d1d1f;color:#fff;border-color:#1d1d1f}\
#pw-root .pw-hist{margin-top:12px;font-size:13.5px;color:#48484a}#pw-root .pw-hist b{font-weight:700}#pw-root .pw-hist .row{display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-top:1px solid #ececf0}#pw-root .pw-hist .row:first-child{border-top:0}\
#pw-root .pw-hist .home{font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#6e6e73;background:#f5f5f7;border-radius:999px;padding:2px 7px;margin-left:6px}\
#pw-stage{position:fixed;inset:0;z-index:9999;background:#fff;display:flex;flex-direction:column;font-family:Inter,-apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif;color:#1d1d1f}\
#pw-stage .top{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid #ececf0}\
#pw-stage .top .x{margin-left:auto;width:44px;height:44px;border-radius:12px;border:1px solid #d9d9de;background:#fff;font-size:22px;line-height:1;cursor:pointer;color:#1d1d1f}\
#pw-stage .top .step{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#6e6e73}\
#pw-stage .bar{height:6px;background:#f5f5f7}#pw-stage .bar i{display:block;height:100%;background:#0071e3;transition:width .3s}\
#pw-stage .mid{flex:1;overflow:auto;padding:20px 20px 30px;display:flex;flex-direction:column;gap:14px;max-width:560px;width:100%;margin:0 auto;box-sizing:border-box}\
#pw-stage h2{margin:0;font-size:30px;font-weight:800;letter-spacing:-.02em;line-height:1.1;text-transform:none;color:#1d1d1f}\
#pw-stage .reps.sm{font-size:30px}#pw-stage .reps{font-size:52px;font-weight:800;letter-spacing:-.03em;color:#0071e3;line-height:1}#pw-stage .reps small{display:block;font-size:14px;font-weight:700;color:#6e6e73;letter-spacing:.05em;text-transform:uppercase;margin-top:6px}\
#pw-stage .cue{font-size:19px;line-height:1.4;color:#1d1d1f}\
#pw-stage .vid{border-radius:14px;overflow:hidden;background:#f5f5f7;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;color:#6e6e73;font-size:14px;font-weight:600;text-align:center;padding:14px}#pw-stage .vid video{width:100%;height:100%;object-fit:cover}\
#pw-stage .list{display:flex;flex-direction:column;gap:8px}#pw-stage .list button{display:flex;align-items:center;gap:12px;min-height:60px;padding:10px 14px;border-radius:14px;border:2px solid #d9d9de;background:#fff;font:inherit;font-size:17px;font-weight:600;text-align:left;cursor:pointer;color:#1d1d1f}\
#pw-stage .list button i{width:28px;height:28px;border-radius:8px;border:2px solid #d9d9de;flex:0 0 28px;display:inline-flex;align-items:center;justify-content:center;font-style:normal;font-weight:800}#pw-stage .list button.on{border-color:#159a52;background:#e9f7ef}#pw-stage .list button.on i{background:#159a52;border-color:#159a52;color:#fff}\
#pw-stage .clock{font-size:72px;font-weight:800;letter-spacing:-.04em;text-align:center;line-height:1;font-variant-numeric:tabular-nums}#pw-stage .clock.rest{color:#d9660a}\
#pw-stage .sets{display:flex;gap:8px;justify-content:center}#pw-stage .sets i{width:16px;height:16px;border-radius:50%;background:#e9e9eb}#pw-stage .sets i.on{background:#159a52}\
#pw-stage .bot{padding:14px 20px calc(14px + env(safe-area-inset-bottom));border-top:1px solid #ececf0;display:flex;gap:10px;max-width:560px;width:100%;margin:0 auto;box-sizing:border-box}\
#pw-stage .btn{flex:1;min-height:64px;border-radius:16px;border:0;font:inherit;font-size:19px;font-weight:800;cursor:pointer;color:#fff;background:#0071e3}#pw-stage .btn.grey{background:#f5f5f7;color:#1d1d1f;flex:0 0 auto;padding:0 18px}#pw-stage .btn.green{background:#159a52}#pw-stage .btn.red{background:#d92d20}#pw-stage .btn:disabled{opacity:.5}\
#pw-stage .num{font:inherit;font-size:34px;font-weight:800;text-align:center;width:100%;padding:12px;border:2px solid #d9d9de;border-radius:14px;min-height:0}\
#pw-stage .note{font-size:14px;color:#6e6e73;line-height:1.45}\
#pw-stage .done{text-align:center;padding-top:30px}#pw-stage .done h2{font-size:38px}#pw-stage .done p{font-size:17px;color:#48484a}';
  function injectCss() { if (el('parent-workout-css')) return; var s = document.createElement('style'); s.id = 'parent-workout-css'; s.textContent = CSS; document.head.appendChild(s); }

  // ---------- small helpers ----------
  function secondsIn(reps) { var m = String(reps || '').match(/(\d+)\s*(second|sec|s\b)/i); return m ? +m[1] : 0; }
  function beep(kind) {
    try {
      var A = window.AudioContext || window.webkitAudioContext; if (!A) return; var ctx = beep.ctx = beep.ctx || new A();
      var o = ctx.createOscillator(), g = ctx.createGain(); o.connect(g); g.connect(ctx.destination);
      o.frequency.value = kind === 'go' ? 880 : kind === 'end' ? 660 : 520; g.gain.value = 0.08; o.start(); o.stop(ctx.currentTime + (kind === 'end' ? 0.5 : 0.15));
    } catch (e) { /* silent phone */ }
  }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function fmtClock(s) { s = Math.max(0, Math.round(s)); var m = Math.floor(s / 60); return (m ? m + ':' : '') + String(s % 60).padStart(m ? 2 : 1, '0') + (m ? '' : 's'); }
  function fmtStop(ms) { return (ms / 1000).toFixed(1) + 's'; }
  function weekKey() { return 'gs_home_week_' + (athleteId || 'x'); }
  function savedWeek() { try { return +(localStorage.getItem(weekKey()) || 0) || 0; } catch (e) { return 0; } }
  function setWeek(w) { try { localStorage.setItem(weekKey(), String(w)); } catch (e) { /* optional */ } }
  function currentWeek() {
    var w = savedWeek(); if (w) return w;
    // From history: after three strength sessions in a week, move to the next.
    var byWeek = {}; (history || []).forEach(function (h) { if (h.kind === 'strength') byWeek[h.week] = (byWeek[h.week] || 0) + 1; });
    var best = 1; Object.keys(byWeek).forEach(function (k) { if (+k >= best) best = byWeek[k] >= 3 ? Math.min(8, +k + 1) : +k; });
    return best;
  }
  function sessionsThisWeek() { var since = new Date(); since.setDate(since.getDate() - 7); var s = since.toISOString().slice(0, 10); return (history || []).filter(function (h) { return h.date >= s; }); }
  function lastTimes() { var out = {}; (history || []).forEach(function (h) { Object.keys(h.times || {}).forEach(function (k) { if (!out[k]) out[k] = { v: h.times[k], date: h.date }; }); }); return out; }

  // ---------- the card on the Training dashboard ----------
  function ensureRoot() {
    var view = el('view-training'); if (!view) return null;
    var root = el('pw-root'); if (root) return root;
    root = document.createElement('div'); root.id = 'pw-root';
    var after = el('pt-root') || el('training-hours-card');
    if (after && after.parentNode === view) view.insertBefore(root, after.nextSibling); else view.insertBefore(root, view.firstChild);
    return root;
  }
  function cardHtml() {
    var first = (childName || 'your player').split(' ')[0];
    var wk = currentWeek(); var w = (program.weeks || []).filter(function (x) { return x.week === wk; })[0] || program.weeks[0];
    var done = sessionsThisWeek(); var lt = lastTimes(); var cd = program.conditioning || {};
    var h = '<div class="pw-card"><div class="pw-hd"><div><span class="pw-tag">Do it yourself</span><h3>' + esc(first) + '\'s workout</h3><p>Week ' + wk + ': ' + esc(w.theme || '') + '. ' + w.sessions + ' strength sessions and the conditioning card, about ' + w.minutes + ' minutes each. The phone counts the sets, the seconds, and the rest.</p></div></div><div class="pw-bd">';
    h += '<div class="pw-start"><button type="button" class="pw-big" id="pw-go-strength">Start strength<small>Week ' + wk + ', ' + (w.blocks || []).length + ' moves, about ' + w.minutes + ' min</small></button><button type="button" class="pw-big alt" id="pw-go-cond">Start conditioning<small>' + ((cd.tests || []).length || 3) + ' timed tests and foot speed</small></button></div>';
    h += '<div class="pw-week"><span>Week</span>' + (program.weeks || []).map(function (x) { return '<button type="button" data-week="' + x.week + '"' + (x.week === wk ? ' class="on"' : '') + '>' + x.week + '</button>'; }).join('') + '</div>';
    h += '<div class="pw-hist">';
    h += '<div class="row"><span>This week</span><b>' + done.filter(function (x) { return x.kind === 'strength'; }).length + ' of ' + w.sessions + ' strength, ' + done.filter(function (x) { return x.kind === 'conditioning'; }).length + ' conditioning</b></div>';
    (cd.tests || []).forEach(function (t) { var v = lt[t.key]; h += '<div class="row"><span>' + esc(t.label) + ' <small style="color:#a1a1a6">' + esc(t.standard || '') + '</small></span><b>' + (v ? v.v + 's<span class="home">Home</span>' : 'No time yet') + '</b></div>'; });
    h += '</div></div></div>';
    return h;
  }
  function paintCard() {
    var root = ensureRoot(); if (!root || !program) return;
    root.innerHTML = cardHtml();
    root.querySelector('#pw-go-strength').onclick = function () { startStrength(currentWeek()); };
    root.querySelector('#pw-go-cond').onclick = function () { startConditioning(currentWeek()); };
    root.querySelectorAll('[data-week]').forEach(function (b) { b.onclick = function () { setWeek(+b.getAttribute('data-week')); paintCard(); }; });
  }
  async function load(force) {
    if (loading) return; loading = true;
    try {
      injectCss(); var root = ensureRoot(); if (!root) return;
      var c = client(); if (!c) return;
      var id = null;
      if (window.ParentTraining && window.ParentTraining.family) { var fam = window.ParentTraining.family(); if (fam && fam.length) { try { var cur = localStorage.getItem('gba_current_athlete'); id = fam.some(function (a) { return a.athlete_id === cur; }) ? cur : fam[0].athlete_id; } catch (e) { id = fam[0].athlete_id; } } }
      if (!id) { try { id = localStorage.getItem('gba_current_athlete'); } catch (e) { id = null; } }
      if (!id) { var r0 = await c.rpc('my_athletes'); if (!r0.error && r0.data && r0.data.length) id = r0.data[0].athlete_id; }
      if (!id) { root.innerHTML = ''; return; }
      athleteId = id; try { childName = localStorage.getItem('gba_child_name') || ''; } catch (e) { childName = ''; }
      if (!program || force) { var r = await c.rpc('home_program'); if (r.error) throw r.error; program = r.data; }
      if (!program || !program.weeks) { root.innerHTML = ''; return; }
      var r2 = await c.rpc('home_workouts_for', { p_athlete_id: id, p_limit: 40 }); history = (!r2.error && Array.isArray(r2.data)) ? r2.data : [];
      paintCard();
    } catch (e) { console.warn('[parent-workout]', e.message); }
    loading = false;
  }

  // ---------- the stage: one screen at a time ----------
  var stage = null, timers = [];
  function clearTimers() { timers.forEach(clearInterval); timers = []; }
  function closeStage() { clearTimers(); if (stage) stage.remove(); stage = null; document.body.style.overflow = ''; }
  function openStage(title) {
    closeStage(); document.body.style.overflow = 'hidden';
    stage = document.createElement('div'); stage.id = 'pw-stage';
    stage.innerHTML = '<div class="top"><span class="step" id="pw-step">' + esc(title) + '</span><button type="button" class="x" aria-label="Stop">&times;</button></div><div class="bar"><i id="pw-bar" style="width:0"></i></div><div class="mid" id="pw-mid"></div><div class="bot" id="pw-bot"></div>';
    stage.querySelector('.x').onclick = function () { if (confirm('Stop this workout? Nothing is saved until Done.')) closeStage(); };
    document.body.appendChild(stage); return stage;
  }
  function screen(stepText, pct, midHtml, botHtml) {
    clearTimers(); el('pw-step').textContent = stepText; el('pw-bar').style.width = Math.round(pct * 100) + '%';
    el('pw-mid').innerHTML = midHtml; el('pw-bot').innerHTML = botHtml; el('pw-mid').scrollTop = 0;
  }
  function videoHtml(name, cue) {
    var url = (program.videos || {})[name];
    if (url) return '<div class="vid"><video src="' + esc(url) + '" playsinline muted loop autoplay></video></div>';
    return '<div class="vid">Coach clip coming.<br>' + esc(cue || '') + '</div>';
  }
  function checklist(items, doneLabel, onDone) {
    var on = {};
    var html = '<div class="list">' + items.map(function (t, i) { return '<button type="button" data-i="' + i + '"><i></i><span>' + esc(t) + '</span></button>'; }).join('') + '</div>';
    return { html: html, bind: function () {
      el('pw-mid').querySelectorAll('.list button').forEach(function (b) { b.onclick = function () { var i = b.getAttribute('data-i'); on[i] = !on[i]; b.classList.toggle('on', on[i]); b.querySelector('i').textContent = on[i] ? '✓' : ''; var all = Object.keys(on).filter(function (k) { return on[k]; }).length === items.length; var nb = el('pw-next'); if (nb) nb.textContent = all ? doneLabel : doneLabel + ' (' + Object.keys(on).filter(function (k) { return on[k]; }).length + ' of ' + items.length + ')'; }; });
      el('pw-next').onclick = function () { onDone(items.filter(function (t, i) { return on[i]; })); };
    } };
  }
  function countdown(seconds, onEnd, cls) {
    var left = seconds; var node = el('pw-clock'); if (!node) return;
    node.textContent = fmtClock(left); beep('go');
    var t = setInterval(function () { left--; if (left <= 3 && left > 0) beep('tick'); if (node) node.textContent = fmtClock(left); if (left <= 0) { clearInterval(t); beep('end'); onEnd(); } }, 1000);
    timers.push(t);
  }

  // Strength: warm-up, each move with sets and rest, finisher, done.
  function startStrength(wk) {
    var w = (program.weeks || []).filter(function (x) { return x.week === wk; })[0]; if (!w) return;
    var blocks = w.blocks || []; var doneBlocks = []; var startedAt = Date.now();
    openStage('Week ' + wk);
    var total = blocks.length + 2;
    var warm = checklist(program.warmup || [], 'I am warm', function () { block(0); });
    screen('Warm-up', 0, '<h2>Warm up first</h2><p class="note">Tap each one when it is done. Slow and perfect.</p>' + warm.html, '<button type="button" class="btn" id="pw-next">I am warm</button>'); warm.bind();
    function block(i) {
      if (i >= blocks.length) return finisher();
      var b = blocks[i]; var sets = +b.sets || 1; var secs = secondsIn(b.reps); var setDone = 0;
      function paintSet(resting) {
        var dots = '<div class="sets">' + Array.apply(null, Array(sets)).map(function (_, k) { return '<i' + (k < setDone ? ' class="on"' : '') + '></i>'; }).join('') + '</div>';
        var body = '<h2>' + esc(b.name) + '</h2><div class="reps">' + esc(b.sets) + ' × ' + esc(b.reps) + '<small>Set ' + Math.min(sets, setDone + 1) + ' of ' + sets + '</small></div>' + dots + videoHtml(b.name, b.cue) + '<div class="cue">' + esc(b.cue || '') + '</div>';
        if (resting) body = '<h2>Rest</h2><div class="clock rest" id="pw-clock">' + fmtClock(REST_SECONDS) + '</div>' + dots + '<p class="note">Breathe. Next: ' + esc(b.name) + ', set ' + (setDone + 1) + ' of ' + sets + '.</p>';
        else if (secs) body += '<div class="clock" id="pw-clock">' + fmtClock(secs) + '</div>';
        var bot = resting ? '<button type="button" class="btn grey" id="pw-skip">Skip rest</button><button type="button" class="btn" id="pw-next" disabled>Resting...</button>'
          : (secs ? '<button type="button" class="btn grey" id="pw-back">Back</button><button type="button" class="btn" id="pw-start">Start ' + secs + ' seconds</button>' : '<button type="button" class="btn grey" id="pw-back">Back</button><button type="button" class="btn green" id="pw-next">Set ' + (setDone + 1) + ' done</button>');
        screen('Move ' + (i + 1) + ' of ' + blocks.length, (i + 1) / total, body, bot);
        var bk = el('pw-back'); if (bk) bk.onclick = function () { if (setDone > 0) { setDone--; paintSet(false); } else if (i > 0) block(i - 1); else startStrength(wk); };
        if (resting) { el('pw-skip').onclick = function () { clearTimers(); paintSet(false); }; countdown(REST_SECONDS, function () { paintSet(false); }); return; }
        if (secs) { el('pw-start').onclick = function () { el('pw-start').disabled = true; el('pw-start').textContent = 'Hold...'; countdown(secs, function () { finishSet(); }); }; }
        else el('pw-next').onclick = finishSet;
      }
      function finishSet() { setDone++; if (setDone >= sets) { doneBlocks.push(b.name); block(i + 1); } else paintSet(true); }
      paintSet(false);
    }
    function finisher() {
      screen('Finisher', (blocks.length + 1) / total, '<h2>Finisher</h2><div class="cue">' + esc(program.finisher || 'Two minutes of stationary pounds, off hand up.') + '</div><div class="clock" id="pw-clock">2:00</div><p class="note">Off hand up in the guard position, never behind the back.</p>', '<button type="button" class="btn grey" id="pw-skip">Skip</button><button type="button" class="btn" id="pw-start">Start 2 minutes</button>');
      el('pw-skip').onclick = function () { clearTimers(); done(); };
      el('pw-start').onclick = function () { el('pw-start').disabled = true; el('pw-start').textContent = 'Pound...'; countdown(120, done); };
    }
    function done() { finish('strength', wk, doneBlocks, {}, Math.max(1, Math.round((Date.now() - startedAt) / 60000))); }
  }

  // Conditioning: stopwatch for each test, foot speed checklist, finisher, done.
  function startConditioning(wk) {
    var cd = program.conditioning || {}; var tests = cd.tests || []; var times = {}; var startedAt = Date.now();
    openStage('Conditioning'); var total = tests.length + 2;
    function test(i) {
      if (i >= tests.length) return footspeed();
      var t = tests[i]; var running = false, t0 = 0, ms = 0, tick = null;
      screen('Test ' + (i + 1) + ' of ' + tests.length, (i + 1) / total,
        '<h2>' + esc(t.label) + '</h2><div class="reps sm">' + esc(t.standard || '') + '<small>The standard</small></div><div class="cue">' + esc(t.how || '') + ' ' + esc(t.reps || '') + '</div><div class="clock" id="pw-clock">0.0s</div><p class="note">Tap Start when you go, Stop when you finish. Your best rep counts. Or type the time from a stopwatch.</p><input class="num" id="pw-time" type="number" step="0.1" inputmode="decimal" placeholder="seconds">',
        '<button type="button" class="btn grey" id="pw-skip">Skip</button><button type="button" class="btn green" id="pw-start">Start</button><button type="button" class="btn" id="pw-next" disabled>Save</button>');
      var clock = el('pw-clock'), inp = el('pw-time'), sb = el('pw-start'), nb = el('pw-next');
      sb.onclick = function () {
        if (!running) { running = true; t0 = Date.now(); sb.textContent = 'Stop'; sb.className = 'btn red'; beep('go'); tick = setInterval(function () { clock.textContent = fmtStop(Date.now() - t0); }, 100); timers.push(tick); }
        else { running = false; clearInterval(tick); ms = Date.now() - t0; clock.textContent = fmtStop(ms); beep('end'); var best = Math.round(ms / 100) / 10; if (!inp.value || +inp.value > best) inp.value = best; sb.textContent = 'Start again'; sb.className = 'btn green'; nb.disabled = false; }
      };
      inp.oninput = function () { nb.disabled = !(+inp.value > 0); };
      nb.onclick = function () { var v = +inp.value; if (v > 0 && v <= 600) times[t.key] = Math.round(v * 10) / 10; clearTimers(); test(i + 1); };
      el('pw-skip').onclick = function () { clearTimers(); test(i + 1); };
    }
    function footspeed() {
      var fs = checklist(cd.footspeed || [], 'Foot speed done', function () { finisher(); });
      screen('Foot speed', (tests.length + 1) / total, '<h2>Foot speed</h2><p class="note">Tap each one when it is done.</p>' + fs.html, '<button type="button" class="btn" id="pw-next">Foot speed done</button>'); fs.bind();
    }
    function finisher() {
      screen('Finisher', (tests.length + 1.5) / total, '<h2>Finisher</h2><div class="cue">' + esc(cd.finisher || program.finisher || 'Two minutes of stationary pounds, off hand up.') + '</div><div class="clock" id="pw-clock">2:00</div>', '<button type="button" class="btn grey" id="pw-skip">Skip</button><button type="button" class="btn" id="pw-start">Start 2 minutes</button>');
      el('pw-skip').onclick = function () { clearTimers(); done(); };
      el('pw-start').onclick = function () { el('pw-start').disabled = true; el('pw-start').textContent = 'Pound...'; countdown(120, done); };
    }
    function done() { finish('conditioning', wk, (cd.footspeed || []), times, Math.max(1, Math.round((Date.now() - startedAt) / 60000))); }
    test(0);
  }

  async function finish(kind, wk, blocks, times, minutes) {
    var first = (childName || 'Player').split(' ')[0]; var cd = program.conditioning || {};
    var tl = Object.keys(times).map(function (k) { var t = (cd.tests || []).filter(function (x) { return x.key === k; })[0]; return '<div class="row" style="display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid #ececf0"><span>' + esc(t ? t.label : k) + '</span><b>' + times[k] + 's <span style="font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#6e6e73;background:#f5f5f7;border-radius:999px;padding:2px 7px;margin-left:6px">Home</span></b></div>'; }).join('');
    screen('Done', 1, '<div class="done"><h2>Nice work, ' + esc(first) + '.</h2><p>' + (kind === 'strength' ? blocks.length + ' moves done in about ' + minutes + ' minutes.' : 'Conditioning card done.') + '</p>' + tl + '<p class="note" id="pw-save-note">Saving for your coaches...</p></div>', '<button type="button" class="btn" id="pw-close" disabled>Close</button>');
    el('pw-close').onclick = closeStage;
    var c = client(); var note = el('pw-save-note');
    try {
      var r = await c.rpc('log_home_workout', { p_athlete_id: athleteId, p_date: today(), p_week: wk, p_kind: kind, p_blocks: blocks, p_times: times, p_minutes: minutes });
      if (r.error) throw r.error;
      if (note) note.textContent = 'Saved. Your coaches can see it on the board.';
      history = null; load(true);
    } catch (e) { if (note) note.textContent = 'Could not save: ' + (e.message || 'error') + '. Tell your coach what you did.'; }
    el('pw-close').disabled = false;
  }

  function visible() { var v = el('view-training'); return v && v.style.display !== 'none' && !v.classList.contains('hidden'); }
  document.addEventListener('DOMContentLoaded', function () {
    injectCss();
    var tries = 0; var timer = setInterval(function () { if (el('pw-root') || ++tries > 60) { clearInterval(timer); return; } if (visible()) load(); }, 700);
    var v = el('view-training');
    if (v) new MutationObserver(function () { if (visible() && !el('pw-root')) load(); }).observe(v, { attributes: true, attributeFilter: ['style', 'class'] });
    window.ParentWorkout = { load: function () { return load(true); }, startStrength: startStrength, startConditioning: startConditioning, close: closeStage, get program() { return program; }, get history() { return history; } };
  });
})();
