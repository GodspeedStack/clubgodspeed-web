/**
 * GODSPEED BASKETBALL. Coaching IQ, inside the Coach Portal.
 *
 * The clinic library, rewritten as ours: one page per tab, everything visible,
 * grouped by what a coach is doing (guarding, attacking, shooting, the post,
 * culture, and the drills that teach each). No accordions. No source lines.
 *
 * Contract:
 *   window.CoachIQ.open(tab?)   renders into #iq-view and shows it
 *   Turns the "Coaching IQ" item under Coach Academy from "Coming" into live.
 *   Staff only (behind the Coach Portal login). No network. No emojis. No em dashes.
 */
(function () {
  'use strict';
  var el = function (id) { return document.getElementById(id); };
  function esc(s) { return (s == null ? '' : String(s)).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // [key, label, lead{title,text}, sections[ [title, intro, [[lead,line]...], style] ]]
  var TABS = [
    ['defense', 'Defense', {
      title: 'Want them to feel you.',
      text: 'Effort first, coverage second, the play third. You can teach the spot and the read; you cannot teach effort, so that is the one we never negotiate. If you give up easy baskets you will not win, and how a kid plays after he gets beat decides how good he is going to be.'
    }, [
      ['Six things we never give up', 'Say them before every game. Kids can recite them by week two.', [
        ['Get back before the ball', 'Transition defense is a sprint, not a jog. Beat the ball down the floor.'],
        ['No easy layups', 'Ever. A layup against us is contested or it is a foul.'],
        ['No open threes', 'Contest every shot. A hand up changes the number.'],
        ['Contested twos', 'If they are going to score, make it tough and make it a two.'],
        ['Enjoy contact', 'Be physical and seek it. Legal, on balance, chest first.'],
        ['Play as a group', 'Connected and talking. Five guys who move on the flight of the ball.']
      ], 'numbered'],
      ['Three places you can be', 'There is no fourth option.', [
        ['On the ball', 'Shoulder to shoulder, close enough to touch, no middle stance. Chin on the ball.'],
        ['On the middle help line', 'One guy on the ball, four in help. Play at the level of the ball. Make it look crowded.'],
        ['On the bench', 'The place you go when you are in neither of the first two.']
      ], 'numbered'],
      ['The help rule', 'How five guys guard one ball.', [
        ['One stops the ball', 'In transition one man stops the ball; the other four are already in help.'],
        ['Push it to a side', 'Get the ball to one side of the floor so the group can function as a group.'],
        ['Big sprints to the nail', 'The big gets to the nail to stop point guard penetration before it starts.'],
        ['Front the post', 'No middle ball in the post. Arm bar, foot free, physical presence.'],
        ['When beat, run to the paint', 'Turn and sprint to the paint. Do not chase the ball, protect the rim.']
      ]],
      ['Guarding the ball screen', 'The help defender is ready before the screen arrives.', [
        ['Hand on, go to the player', 'Chest up, stay attached through the screen.'],
        ['Two-hand tag', 'The help guy in the middle tags the roller with two hands, then recovers. It teaches him to always be in help.'],
        ['Three layers', 'System: the base defense everyone knows. Adjustments: what changes for this opponent. Parachute: the emergency defense when nothing is working. Practice changing coverages every third day so it is never new.']
      ]],
      ['What we get on players for', 'In this order, and only this order.', [
        ['Effort', 'Never negotiable. This is the only one we raise our voice about.'],
        ['Coverage', 'Were you in the right spot? Teachable, so teach it.'],
        ['Play', 'Did you make the right read? Last, because reads take the longest to build.']
      ], 'numbered']
    ]],
    ['offense', 'Offense', {
      title: 'The ball is a spotlight. The longer you hold it, the hotter it gets.',
      text: 'Our offense is rhythm and flow with discipline: space the floor, catch and see, help somebody, finish your cut, dribble with a purpose. Keep it simple, be a great copier of what works, and run a system the kids believe in.'
    }, [
      ['Five rules of offense', 'Every kid, every possession.', [
        ['Fight for space', 'Use pivots to create space. Space is earned, not given.'],
        ['Catch and see', 'On the catch, see your man, your teammates, and their men. Three things, half a second.'],
        ['Help somebody', 'Screen for a teammate, cheer the screener, sacrifice. When you help somebody you help yourself.'],
        ['Finish your cut', 'Every cut ends at a spot: top, slot, corner, low block, or center of the paint. Half cuts clog the floor.'],
        ['Dribble with a purpose', 'Attack somebody or help somebody. A dribble that does neither is a turnover waiting to happen.']
      ], 'numbered'],
      ['Why we play four out, one in', 'The spacing that fits our kids.', [
        ['Hard to guard in transition', 'Four players spaced wide and one running the rim stretches a defense that is still getting back.'],
        ['Their big has to guard the perimeter', 'A true four-man gets pulled out of the paint, which opens the drive.'],
        ['Hard to double the post', 'With that much space a double team leaves someone wide open.'],
        ['No threes without a rebounder', 'We do not shoot a three unless a post player is in the paint to chase it.']
      ]],
      ['Pick and pop', 'One set the whole team knows.', [
        ['Pop and reverse', 'Screen inside of the elbow defender, pop, reverse the ball to the corner.'],
        ['The second look', 'High-low with a double screen on the low block; the top of the double flashes to the high post.']
      ]]
    ]],
    ['shooting', 'Shooting', {
      title: 'No one just gets up shots. Always shoot for a goal.',
      text: 'Chart everything. If we cannot say how many shots our best player got in a two-hour practice, we are guessing. Twenty to thirty minutes of individual work every practice, passers leading shooters to the inside shoulder, and shooting when tired, because that is when games are decided.'
    }, [
      ['Five ways we get a three', 'Build all five into the offense. Send three or four to the glass.', [
        ['Fast break', 'Run the wings wide to the corners; the trailer is the second look.'],
        ['Catch and shoot off penetration', 'Drive, kick, feet ready. The finishing bridge feeds this.'],
        ['Post catch, double team kick', 'When they double the post, the open man is a three.'],
        ['Out of the offense', 'Screens and ball screens create the catch with momentum.'],
        ['Offensive rebound, clear to the line', 'Kick it out to the arc every time. Do not force a putback into a crowd.']
      ], 'numbered'],
      ['Standards', 'What a shooting block looks like at Godspeed.', [
        ['Count it', 'Track every shot in practice and games. Numbers are facts.'],
        ['Inside shoulder', 'Passers lead the shooter to the inside shoulder so the catch is already in the shot.'],
        ['Shoot tired', 'Shooting conditioning is real conditioning. The fourth quarter is where shots are made or missed.']
      ]]
    ]],
    ['post', 'Post play', {
      title: 'Paint is owned. Outside the paint is rented. The three-point line is homeless.',
      text: 'A great post player runs rim to rim, is legally physical, on balance with good feet, a relentless rebounder with good hands, defends his position and controls the paint, makes free throws, is vocal, and does not miss layups. Always use the backboard.'
    }, [
      ['Reading the defender', 'Feel first, then decide.', [
        ['Forearm means power', 'A forearm in your back means drop step and go through him.'],
        ['Hand means face up', 'A hand means he is playing light. Face up and attack.'],
        ['Pivot even to even', 'Feet shoulder width, pivot to an even base. Look middle; doubles come from the high side.']
      ]],
      ['Post moves we teach', 'Body low, elbows up, chin check before you go.', [
        ['Drop step', 'The first move every big learns.'],
        ['Two-dribble middle turn spin', 'Two dribbles, turn middle, spin to the rim.'],
        ['Chin check', 'Look over the shoulder before the move. It is the read.'],
        ['Reverse pivot fake', 'Sell it with the shoulders, then one dribble middle and finish.']
      ], 'numbered']
    ]],
    ['culture', 'Culture', {
      title: 'Always say we.',
      text: 'Four things every day: get better, have fun, make every play count, play to win. Players can never be afraid to lose or make a mistake. Coaches stick up for coaches. Respect the game. Develop your assistants. If someone is hurting the program, he is removed.'
    }, [
      ['Seven fundamental keys', 'Coaching is not plays, it is playing.', [
        ['See', 'Games are like darting taxis. Eyes up, always.'],
        ['Talk', 'A quiet team is a losing team.'],
        ['Have an act', 'Fake a cut before the real one.'],
        ['Down and balanced', 'Low is powerful.'],
        ['Details', 'Do the little things when nobody is grading them.'],
        ['Flesh to flesh', 'Take the charge. Contact is part of the game.'],
        ['Finish everything', 'The last play is the strongest play.']
      ], 'numbered'],
      ['Three levels of communication', 'Most teams stop at one.', [
        ['Given', 'You said it.'],
        ['Received', 'They heard it.'],
        ['Understood', 'They acted on it. Elite teams live here.']
      ], 'numbered'],
      ['Practice habits that build culture', 'Small rules, big effect.', [
        ['No out of bounds, no fouls', 'In practice, play through everything. It makes you play harder.'],
        ['Make them hate to lose', 'If they win, they should love it. If they lose, there is a cost.'],
        ['The penny jar', 'A penny for every good thing, into a jar the whole team can see fill up over the season.'],
        ['Build the team off the floor', 'Volleyball where everyone must touch the ball. Anything where the group needs the group.']
      ]]
    ]],
    ['drills', 'Drills that teach it', {
      title: 'Never become good at drills and bad at playing.',
      text: 'Every drill here exists to teach one of the ideas on the other tabs. Use imagination, make players think, and play three on three live on different parts of the floor with different rules. Make drills for your offense, not the other way around.'
    }, [
      ['Defense', 'Head to head, with a score.', [
        ['Head to head series', 'Four parts, one on one, defender talks and moves his feet. One: jab series with tracing, offense cannot dribble. Two: stationary dribble, defender plays the ball and dives for loose balls. Three: live dribble, force baseline. Four: add a shot after the whistle, two dribbles max. Ask for the score.'],
        ['Five on four scramble', 'Scramble into five on five; each team plays offense and defense once. Then Switch and Change: Pull (drop back to half-court defense), Change (run the other way), Switch (drop the ball and guard someone else). Three-minute games; doubles as conditioning.'],
        ['Special situations', 'Practice weekly: free-throw block out, free-throw offensive rebound, fouling up three, foul with a double-team chop, end-of-game switch and double hand-off.']
      ], 'numbered'],
      ['Shooting', 'Volume with a scoreboard.', [
        ['Olympic shooting', 'Loop and follow; time the weave so you run into the arc. Three minutes on the clock. Three points for a three, two for a two, one for a layup. Start at 120 and go up two every time you beat it.'],
        ['Celtic 50', 'Make five from five spots. Progress to ten from five spots.'],
        ['Get trapped', 'Simulate a trap off an offensive rebound. Find the open shooter on the wing. Poise under pressure.']
      ], 'numbered'],
      ['Post', 'Hands, feet, second jump.', [
        ['Blind pass chair', 'Coach passes to the block; player catches, passes back, circles the chair, whips his head around, catches the lob, finishes. Then catch, pass back, swim move to the low block.'],
        ['Chair series', 'Chairs above the low blocks. Grab rim, chair to chair, body low, elbows up: drop step, two-dribble middle spin, chin check, reverse pivot fake, reverse pivot one dribble middle.'],
        ['Pound the backboard', 'Hold his shirt for resistance; he jumps and pounds the board. The second jump matters more than the first.'],
        ['Mikan with outlet', 'Mikan, take it out of the net, outlet out of bounds, run and touch half court, pass back for a finish, swim back to the block.']
      ], 'numbered'],
      ['Footwork', 'Pivot creates space against pressure.', [
        ['Pivot 360', 'Jab, step across, reverse pivot. Stay down, see the floor, protect the ball, work both feet. No dribble; defender traces with max pressure. When you see numbers, pass.']
      ]]
    ]]
  ];

  var CSS = '\
#iq-view .iq2-tabs{display:inline-flex;gap:2px;padding:3px;background:rgba(118,118,128,.12);border-radius:11px;margin:0 0 18px;max-width:100%;overflow-x:auto;scrollbar-width:none}\
#iq-view .iq2-tabs::-webkit-scrollbar{display:none}\
#iq-view .iq2-tabs button{border:none;background:transparent;color:#6E6E73;font-family:inherit;font-size:13px;font-weight:600;padding:6px 14px;border-radius:8px;cursor:pointer;min-height:32px;min-width:0;text-transform:none;white-space:nowrap}\
#iq-view .iq2-tabs button.active{background:#fff;color:#1D1D1F;box-shadow:0 1px 3px rgba(0,0,0,.1)}\
#iq-view .iq2-tabs button:focus-visible{outline:2px solid #0071E3;outline-offset:2px}\
#iq-view .dv-lead{background:#0A0A0A;color:#fff;border-radius:16px;padding:22px 24px;margin:0 0 20px;display:flex;gap:18px;align-items:flex-start}\
#iq-view .dv-lead .n{font-size:34px;font-weight:800;color:#FF5722;line-height:1;flex:0 0 auto}\
#iq-view .dv-lead h4{margin:0 0 6px;font-size:18px;font-weight:700;letter-spacing:-.01em;color:#fff;text-transform:none}\
#iq-view .dv-lead p{margin:0;font-size:14px;line-height:1.55;color:#C7C7CC;max-width:760px}\
#iq-view .dv-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}\
#iq-view .dv-card{background:#fff;border:1px solid rgba(60,60,67,.07);border-radius:16px;padding:20px 22px;box-shadow:0 1px 2px rgba(15,23,42,.04),0 8px 24px rgba(15,23,42,.05);min-width:0}\
#iq-view .dv-card h4{margin:0 0 2px;font-size:16px;font-weight:700;letter-spacing:-.01em;text-transform:none}\
#iq-view .dv-card .in{margin:0 0 14px;font-size:13px;color:#6E6E73}\
#iq-view .dv-list{list-style:none;margin:0;padding:0;display:grid;gap:10px}\
#iq-view .dv-item{display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:start;font-size:13.5px;line-height:1.5;color:#3A3A3C}\
#iq-view .dv-item b{display:block;color:#1D1D1F;font-weight:600;font-size:14px}\
#iq-view .dv-item .mk{width:6px;height:6px;border-radius:50%;background:#0071E3;margin-top:8px}\
#iq-view .numbered .dv-item .mk{width:22px;height:22px;border-radius:50%;background:#1D1D1F;color:#fff;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;margin-top:1px}\
@media (max-width:960px){#iq-view .dv-grid{grid-template-columns:1fr}#iq-view .dv-lead{flex-direction:column;gap:8px}}\
@media print{#iq-view .dv-card{break-inside:avoid}}';
  function injectCss() { if (el('coach-iq-css')) return; var s = document.createElement('style'); s.id = 'coach-iq-css'; s.textContent = CSS; document.head.appendChild(s); }

  var current = 'defense';
  function tab(key) { return TABS.filter(function (t) { return t[0] === key; })[0] || TABS[0]; }
  function block(lead, sections) {
    var h = '<div class="dv-lead"><div class="n">1</div><div><h4>' + esc(lead.title) + '</h4><p>' + esc(lead.text) + '</p></div></div><div class="dv-grid">';
    sections.forEach(function (sec) {
      var style = sec[3] || '';
      h += '<section class="dv-card ' + style + '"><h4>' + esc(sec[0]) + '</h4><p class="in">' + esc(sec[1]) + '</p><ol class="dv-list">';
      sec[2].forEach(function (it, i) { h += '<li class="dv-item"><span class="mk" aria-hidden="true">' + (style === 'numbered' ? String(i + 1) : '') + '</span><div><b>' + esc(it[0]) + '</b>' + esc(it[1]) + '</div></li>'; });
      h += '</ol></section>';
    });
    return h + '</div>';
  }
  function html() {
    var t = tab(current);
    return '<div class="iq2-tabs" role="tablist">' + TABS.map(function (x) { return '<button type="button" role="tab" data-tab="' + x[0] + '"' + (x[0] === current ? ' class="active"' : '') + '>' + esc(x[1]) + '</button>'; }).join('') + '</div>' +
      '<div id="iq-body">' + block(t[2], t[3]) + '</div>';
  }
  function paint(v) {
    v.innerHTML = html();
    v.querySelectorAll('.iq2-tabs button').forEach(function (b) { b.addEventListener('click', function () { current = b.getAttribute('data-tab'); try { localStorage.setItem('gs_iq_tab', current); } catch (e) { /* optional */ } paint(v); setSub(); var m = document.querySelector('.dashboard-main'); if (m) m.scrollTop = 0; }); });
  }
  function setSub() {
    var s = document.querySelector('#coach-dashboard .dashboard-header .text-sub');
    if (s) s.textContent = tab(current)[1] + '. Everything on one page, in our words.';
  }
  function ensureView() {
    var v = el('iq-view'); if (v) return v;
    var main = document.querySelector('.dashboard-main'); if (!main) return null;
    v = document.createElement('div'); v.id = 'iq-view'; v.style.display = 'none';
    try { current = localStorage.getItem('gs_iq_tab') || current; } catch (e) { /* optional */ }
    paint(v);
    var after = main.querySelector('.dashboard-toolbar') || main.querySelector('.dashboard-header');
    if (after && after.nextSibling) main.insertBefore(v, after.nextSibling); else main.appendChild(v);
    return v;
  }
  function open(key) {
    injectCss();
    if (key) { current = key; }
    var v = ensureView(); if (!v) return;
    if (key) paint(v);
    v.parentNode.querySelectorAll('div[id$="-view"]').forEach(function (x) { if (x !== v) x.style.display = 'none'; });
    document.querySelectorAll('.team-nav-item.active, .segment-btn.active').forEach(function (n) { n.classList.remove('active'); });
    var item = el('iq-nav-item'); if (item) item.classList.add('active');
    var tabs = el('view-tabs'); if (tabs) tabs.style.display = 'none';
    var t = el('view-title'); if (t) t.textContent = 'Coaching IQ';
    setSub();
    v.style.display = 'block';
    if (window.CoachPortalShell) window.CoachPortalShell.closeDrawer();
  }

  // Turn the "Coaching IQ  Coming" sub-item into the live entry.
  function mountNav() {
    if (el('iq-nav-item')) return true;
    var anchor = el('academy-nav'); if (!anchor) return false;
    var target = null;
    anchor.querySelectorAll('.team-nav-item').forEach(function (n) { if (/^\s*Coaching IQ/.test(n.textContent)) target = n; });
    if (!target) return false;
    target.id = 'iq-nav-item';
    target.classList.remove('is-coming'); target.removeAttribute('aria-disabled');
    var pill = target.querySelector('.nav-coming'); if (pill) pill.remove();
    target.setAttribute('role', 'button'); target.tabIndex = 0; target.style.pointerEvents = '';
    target.onclick = function () { open(); };
    target.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
    var orig = window.switchTeamView;
    if (typeof orig === 'function' && !orig.__iqWrapped) {
      var w = function () { var v = el('iq-view'); if (v) v.style.display = 'none'; var t = el('view-tabs'); if (t) t.style.display = ''; target.classList.remove('active'); return orig.apply(this, arguments); };
      w.__iqWrapped = true; window.switchTeamView = w;
    }
    return true;
  }

  document.addEventListener('DOMContentLoaded', function () {
    injectCss();
    var tries = 0;
    var timer = setInterval(function () {
      var d = el('coach-dashboard');
      if (d && d.style.display && d.style.display !== 'none' && mountNav()) clearInterval(timer);
      if (++tries > 120) clearInterval(timer);
    }, 700);
    window.CoachIQ = { open: open, mountNav: mountNav };
  });
})();
