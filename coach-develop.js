/**
 * GODSPEED BASKETBALL. Player development, inside the Coach Portal.
 *
 * One page, everything visible. Organized the way a coach lives it: before the
 * season, every practice, how we guard the ball, game day, the whole kid, buy-in.
 * No accordions, no hidden copy: a coach on a phone at 5:50 pm should be able to
 * scan it in under a minute.
 *
 * Contract:
 *   window.CoachDevelop.open()  renders into #develop-view and shows it
 *   Sidebar item "Player development" under My Learning (#academy-nav).
 *   Staff only (behind the Coach Portal login). No network. No emojis. No em dashes.
 *   Content is Godspeed's own words for coaches of 10 to 15 year olds; no source line.
 */
(function () {
  'use strict';
  var el = function (id) { return document.getElementById(id); };
  function esc(s) { return (s == null ? '' : String(s)).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var LEAD = {
    title: 'Player first. Tactics second. Results last.',
    text: 'Anyone can pull a hundred drills off the internet. The job is the program: a vision for each kid, a plan for every day, and the care to see the whole player. Get the player better and the tactics become possible. Get the tactics right and the wins take care of themselves.'
  };

  // [section title, intro, [ [lead, line], ... ], style]
  var SECTIONS = [
    ['Before the season', 'Decide who you are before the first whistle.', [
      ['One sentence per kid', 'Where does he need to go this season, and what does this team need from him? Every workout traces back to that sentence.'],
      ['Three pillars, day one', 'Spacing, attacking, guarding the ball. Within a week every player can say what this team is about.'],
      ['Season, week, day', 'The season vision breaks into a weekly focus, the week into a written plan for each day. There is no improvising on the floor.']
    ]],
    ['Every practice', 'The simple work is the real coaching.', [
      ['One thing', 'Pick the one skill for the week and put real reps on it. Add a second only when the first holds up live. Three or four over a season is plenty.'],
      ['What, why, how', 'Most coaches give the what and the why and skip the how. The how is the footwork, the hand, the angle, the moment. Show it.'],
      ['He knows what he worked on', 'Name the focus at the start, cue it during, ask him to say it back at the end. A good sweat with no idea what got better is on the coach.'],
      ['No gimmicks', 'No two-ball dribbling, no tennis balls. Nobody dribbles two balls in a game. Let the game and the film tell you what a kid needs.']
    ]],
    ['How we guard the ball', 'Everything on defense starts with the man on the ball.', [
      ['Activate on the catch', 'Arm\'s length, active hands, break his rhythm. Make him protect the ball instead of running his offense.'],
      ['Chin on the ball', 'Chin on the same line as the ball, always. It buys half a step so the drive goes into your chest, never past your hip.'],
      ['Beat him to the spot', 'On a middle drive, get there first and hold it. On a shot fake, stay down, then two hands to the ball.'],
      ['Hand high, strike on contact', 'If he already has a step, ride the hip with the high arm and go for the ball at contact. Force the ugly layup. Never reach low.'],
      ['Attack the spin', 'On a crossover, slide across with the ball. On a spin, sit even and jump it for the steal. Beat? Sprint, recover, get back in front.'],
      ['The feeling we want', 'The other team feels like they are playing against six. If their bench thinks it looks ugly, we are doing it right.']
    ], 'numbered'],
    ['Game day is a development day', 'Skipping development on game day throws away a practice.', [
      ['Night before', 'Sleep and food are part of the plan. Ask about both.'],
      ['First five minutes', 'Greet every kid by name before a ball goes up. Form shooting for touch and balance; a make that touches the rim does not count.'],
      ['Cue words', 'One or two words per player tied to his fix: "right hip", "snap down". He hears it from the bench and knows exactly what you mean.'],
      ['Finishing block', 'Stampede downhill into a two-foot finish every time. Then add the read: punch two feet, spray to the corner, follow your pass.'],
      ['The screener arrives alone', 'Push his man off, both feet to the hips of the ball defender, arrive with timing. Same rep the day before in practice.'],
      ['Tonight\'s coverage', 'Rehearse what they will do to our ball screens: drop, hedge, or trap. Give the kids their number one look for tonight.'],
      ['Movement minute', 'Mirror the coach: slides, hands, stabs, chin on the ball, freeze. One minute, every game. It compounds.'],
      ['Organize the minutes', 'Fifteen minutes is only fifteen if every kid knows where he is. Stagger groups and rotate.']
    ], 'timeline'],
    ['The whole kid', 'We get three hours a day. The other twenty-one show up on the floor.', [
      ['Do not typecast by size', 'The tallest kid is not automatically the center. Watch the skill set and put him where his ceiling is highest.'],
      ['Know the other twenty-one hours', 'Sleep, food, who is around him, what home looks like right now. That is development, not separate from it.'],
      ['Sometimes just listen', 'Not every conversation is a correction. Standing next to a kid and hearing him out is coaching too.']
    ]],
    ['Buy-in', 'Kids will think the simple stuff is beneath them at first.', [
      ['Your best player sets the standard', 'When the best player is the hardest worker and picks up full court, everyone falls in line. Coach him accordingly.'],
      ['Sell the boring work', 'Prove through their own games that the fundamentals are what changed them. The deeper a game goes, the more it comes down to the simple things.'],
      ['Team over highlight', 'Our kids live in a highlight culture. Re-teach team every day: sacrifice, process, the extra pass. Say "we".']
    ]]
  ];

  var CSS = '\
#develop-view .dv-lead{background:#0A0A0A;color:#fff;border-radius:16px;padding:22px 24px;margin:0 0 20px;display:flex;gap:18px;align-items:flex-start}\
#develop-view .dv-lead .n{font-size:34px;font-weight:800;color:#FF5722;line-height:1;flex:0 0 auto}\
#develop-view .dv-lead h4{margin:0 0 6px;font-size:18px;font-weight:700;letter-spacing:-.01em;color:#fff;text-transform:none}\
#develop-view .dv-lead p{margin:0;font-size:14px;line-height:1.55;color:#C7C7CC;max-width:760px}\
#develop-view .dv-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}\
#develop-view .dv-card{background:#fff;border:1px solid rgba(60,60,67,.07);border-radius:16px;padding:20px 22px;box-shadow:0 1px 2px rgba(15,23,42,.04),0 8px 24px rgba(15,23,42,.05);min-width:0}\
#develop-view .dv-card.wide{grid-column:1/-1}\
#develop-view .dv-card h4{margin:0 0 2px;font-size:16px;font-weight:700;letter-spacing:-.01em;text-transform:none}\
#develop-view .dv-card .in{margin:0 0 14px;font-size:13px;color:#6E6E73}\
#develop-view .dv-list{list-style:none;margin:0;padding:0;display:grid;gap:10px}\
#develop-view .dv-item{display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:start;font-size:13.5px;line-height:1.5;color:#3A3A3C}\
#develop-view .dv-item b{display:block;color:#1D1D1F;font-weight:600;font-size:14px}\
#develop-view .dv-item .mk{width:6px;height:6px;border-radius:50%;background:#0071E3;margin-top:8px}\
#develop-view .numbered .dv-item .mk{width:22px;height:22px;border-radius:50%;background:#1D1D1F;color:#fff;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;margin-top:1px}\
#develop-view .timeline .dv-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 22px}\
#develop-view .timeline .dv-item{position:relative;padding-left:0}\
#develop-view .timeline .dv-item .mk{width:22px;height:22px;border-radius:50%;background:#FFF1EC;color:#FF5722;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;margin-top:1px}\
@media (max-width:960px){#develop-view .dv-grid{grid-template-columns:1fr}#develop-view .timeline .dv-list{grid-template-columns:1fr}#develop-view .dv-lead{flex-direction:column;gap:8px}}\
@media print{#develop-view .dv-card{break-inside:avoid}}';

  function injectCss() { if (el('coach-develop-css')) return; var s = document.createElement('style'); s.id = 'coach-develop-css'; s.textContent = CSS; document.head.appendChild(s); }

  function html() {
    var h = '<div class="dv-lead"><div class="n">1</div><div><h4>' + esc(LEAD.title) + '</h4><p>' + esc(LEAD.text) + '</p></div></div>';
    h += '<div class="dv-grid">';
    SECTIONS.forEach(function (sec) {
      var style = sec[3] || '';
      h += '<section class="dv-card ' + style + (style === 'timeline' ? ' wide' : '') + '"><h4>' + esc(sec[0]) + '</h4><p class="in">' + esc(sec[1]) + '</p><ol class="dv-list">';
      sec[2].forEach(function (it, i) {
        var mark = style === 'numbered' || style === 'timeline' ? String(i + 1) : '';
        h += '<li class="dv-item"><span class="mk" aria-hidden="true">' + mark + '</span><div><b>' + esc(it[0]) + '</b>' + esc(it[1]) + '</div></li>';
      });
      h += '</ol></section>';
    });
    h += '</div>';
    return h;
  }

  function ensureView() {
    var v = el('develop-view'); if (v) return v;
    var main = document.querySelector('.dashboard-main'); if (!main) return null;
    v = document.createElement('div'); v.id = 'develop-view'; v.style.display = 'none';
    v.innerHTML = html();
    var after = main.querySelector('.dashboard-toolbar') || main.querySelector('.dashboard-header');
    if (after && after.nextSibling) main.insertBefore(v, after.nextSibling); else main.appendChild(v);
    return v;
  }

  function open() {
    injectCss();
    var v = ensureView(); if (!v) return;
    v.parentNode.querySelectorAll('div[id$="-view"]').forEach(function (x) { if (x !== v) x.style.display = 'none'; });
    document.querySelectorAll('.team-nav-item.active, .segment-btn.active').forEach(function (n) { n.classList.remove('active'); });
    var item = el('develop-nav-item'); if (item) item.classList.add('active');
    var tabs = el('view-tabs'); if (tabs) tabs.style.display = 'none';
    var t = el('view-title'); if (t) t.textContent = 'Player development';
    var s = document.querySelector('#coach-dashboard .dashboard-header .text-sub'); if (s) s.textContent = 'Program-wide. How we get every player better.';
    v.style.display = 'block';
    if (window.CoachPortalShell) window.CoachPortalShell.closeDrawer();
  }

  function mountNav() {
    if (el('develop-nav-item')) return;
    var anchor = el('academy-nav'); if (!anchor) return;
    var a = document.createElement('div');
    a.className = 'team-nav-item'; a.id = 'develop-nav-item'; a.setAttribute('role', 'button'); a.tabIndex = 0;
    a.style.cssText = 'display:flex;align-items:center;gap:12px;';
    a.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:.7" aria-hidden="true"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg><span>Player development</span>';
    a.onclick = open; a.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
    anchor.appendChild(a);
    var orig = window.switchTeamView;
    if (typeof orig === 'function' && !orig.__dvWrapped) {
      var w = function () { var v = el('develop-view'); if (v) v.style.display = 'none'; var t = el('view-tabs'); if (t) t.style.display = ''; a.classList.remove('active'); return orig.apply(this, arguments); };
      w.__dvWrapped = true; window.switchTeamView = w;
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    injectCss();
    var timer = setInterval(function () {
      var d = el('coach-dashboard');
      if (d && d.style.display && d.style.display !== 'none') mountNav();
      if (el('develop-nav-item')) clearInterval(timer);
    }, 700);
    window.CoachDevelop = { open: open, mountNav: mountNav };
  });
})();
