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


  // ---------- How we practice: finishing, bumping, reads, pace ----------
  var PRACTICE_LEAD = {
    title: 'Practice how we play.',
    text: 'Our kids learn by playing, so practice is built from live reps with a read in every one of them. Two kinds of blocks: a competition block has a winner and a loser, simple. A guided block uses dummy defenders who give a read without stealing the ball, so we can teach even with two coaches and nine kids. Start every rep with an advantage already built in, and start with the end of the possession in mind: paint touch, then layup, corner three, or free throws.'
  };
  var PRACTICE = [
    ['Spacing, again', 'Six spots. Every player can be held to this.', [
      ['Deep corner', 'All the way to the corner, not most of the way. One step short is the difference between an open shot and a contested one.'],
      ['Twelve to fifteen feet', 'Corners, wings or slots, and the top. Every spot is twelve to fifteen feet from the next one. If two players are closer than that, the spacing is wrong; fix it before anything else.'],
      ['Paint touches win', 'A possession that touches the paint is worth about a third more than one that does not. The first thing we teach is driving, because the paint opens everything else.']
    ]],
    ['Finishing', 'Win the bump. Two feet. Through contact.', [
      ['Ball in the air, feet in the air', 'Never catch flat-footed. As the pass is in the air your feet are moving: hop or slide into the catch so you can attack the closeout on the first dribble.'],
      ['Win the bump', 'Drive your line and do not let the defender knock you off it. Shoulder into his chest, off two feet, finish through the contact. No extended arm; that is a foul at every level.'],
      ['One-two, two feet', 'Every finish and every paint pass comes off two feet. One-footers are where kids fall down and give up a layup the other way.'],
      ['A missed layup is a bucket for them', 'Miss at the rim and it is usually two points the other way. Finish the rep. We do not walk off a missed layup.'],
      ['Corner finish', 'Catch on the move in the corner, rip through to the middle or rocker step, win the bump, finish. Same three pieces every time.']
    ], 'numbered'],
    ['Closeout defense', 'Guard two dribbles and you are a real defender.', [
      ['Square, up to touch', 'Close out square, all the way up to touch. Keep the ball in front. Guard the first dribble with your chest.'],
      ['The eagle', 'Off the ball, down in a stance with your arms all the way out, ready to help. The low man reads whether the on-ball defender recovers; if he does not, the low man helps and the offense reads the skip.']
    ]],
    ['Reads', 'Decide in half a second: shoot, pass, or drive.', [
      ['First-touch decision', 'The choice is made before the ball arrives. Catch and hold is the one thing we do not allow.'],
      ['Closeout read', 'Most shots come off a closeout. Closeout runs at you: attack the front foot. Closeout stops short: shoot. Help comes from the corner: kick. Help comes from the top: hit the fill behind you.'],
      ['Hand-off read', 'Off the hand-off: defender plays low, turn the corner and finish. Defender jumps high with his numbers above you, back cut every time.'],
      ['Stampede', 'Catch the ball-screen pass with momentum and go right by the help. Screen defender comes up high: back cut. Start one step higher and you buy yourself a step of runway.'],
      ['Two on one', 'Make the one defender commit. If he does not stop you, score. If he does, that is the pass. One pass, maximum.'],
      ['Drive, kick, swing', 'Do not re-drive a drive. Kick it, then swing it one more to the corner. The extra swing stretches the rotation and somebody forgets whose man it is.']
    ], 'numbered'],
    ['Paint automatics', 'Three rules every player on the floor follows when the ball is driven.', [
      ['Piece of the paint', 'As the ball drives, get a piece of the paint. Ball comes toward you, slide. Ball pulls away, fill behind.'],
      ['Get out and re-space', 'Out of the paint as fast as you got in, ball side, jump stop and relocate. A clogged lane kills the drive.'],
      ['Flow behind the ball', 'Off a ball screen, take one more dribble and flow behind so the handler always has a read behind him if he gets stopped. Any pop into a crowd becomes a slot cut.']
    ], 'numbered'],
    ['Pace', 'Easy points are the ones nobody guards.', [
      ['Nearest man inbounds', 'They score, we go. Nearest man takes it out, the big runs ahead, the guard catches above the free-throw line moving downhill.'],
      ['Wings run', 'To play fast the wings have to run. Advance pass first, dribble second.'],
      ['Count the quick scores', 'A score inside a few seconds of their make is a point we track all year. Six of those in a game is a great night.']
    ]],
    ['How a practice is built', 'Layer it, then let them play.', [
      ['Start with an advantage', 'Shoulder to chest, start behind the defender, or a screen. The read has to happen every rep, so give the offense an edge to start.'],
      ['Swing, swing, live', 'On the skip the defense is dead until the closeout touches the top of the square. Then the next skip is live and the offense has a small advantage to play out.'],
      ['Two on two, then four on four', 'Closeout reads two on two. Then four on four with a take-two defender who splits and takes the first pass either way, and the group scrambles.'],
      ['Five on four to finish', 'Play until a shot; whoever shoots or turns it over touches the coach under the rim while the other end converts a five on four. Protect the basket, stop the ball, then help to the weak side.'],
      ['Set, run, run', 'Run the set, then run it again without stopping. Coach while they play. Stopping the drill every ten seconds is how you lose a 12 year old.']
    ]]
  ];

  // ---------- Tuesday and Thursday shape (mirrors program_content.planner-practice-shape) ----------
  var SHAPE_LEAD = {
    title: 'Tuesday and Thursday, 6:00 to 8:00.',
    text: 'Doors 5:55. Two hours, seven blocks. Individual work ends at 6:30; every block after that is a read, run as either a guided block (dummy defenders who give a read but do not steal) or a competition block (winner, loser, simple). Say which one it is before the whistle. Every rep starts with an advantage: shoulder to chest, start behind, or a screen.'
  };
  var SHAPE = [
    ['The two hours', 'Out by 8:00 sharp.', [
      ['6:00  Start routine, 15', 'Ball-handling warmup, form shooting, dynamic stretch, get a partner. Same every practice; kids run it without a coach.'],
      ['6:15  Power-ups, 15', 'Position stations: Big, Wing, Guard. One coach per two stations, rotate at five minutes. Individual work ends here.'],
      ['6:30  Finishing bridge, 15', 'Closeout catch into win the bump into a two-foot finish. Corner version. Then two on one: make him commit, one pass max. A missed layup costs the rep.'],
      ['6:45  Guided reads, 20', 'The one read of the week: closeout read, hand-off read, or stampede. Two on two with the eagle and the low man. Dummy defenders from the extra kids. Nobody steals.'],
      ['7:05  Competition, 25', 'Swing-swing-live closeouts, then four on four with the take-two defender. Score, keep the ball. Drive, kick, swing. Winner and loser announced. Break routine at 7:17.'],
      ['7:30  Live conversion, 20', 'Five on four continuous from a shoulder-to-chest start. Play to a shot; shooter or turnover touches the coach under the rim while the other end converts. Set, run, run. Basket, ball, then weak side.'],
      ['7:50  Close, 10', 'Quick-strike inbounds off makes, nearest man takes it out. Free throws with the game on the line. Say-it-back: every kid names the one thing.']
    ], 'timeline'],
    ['Rules that hold the shape', 'Five things that make the two hours work with two coaches.', [
      ['One read per week', 'Power-ups feed it, the guided block teaches it, the competition block tests it, live play proves it.'],
      ['Name the block', 'Guided or competition. Kids play differently when they know which one it is.'],
      ['Nobody watches', 'Extra kids are dummy defenders or on the Utility station: strength, core. Standing still is not a station.'],
      ['Two feet, no arm', 'Two feet on every finish and every paint pass. Shoulder into the chest is fine; an extended arm is a foul at every level.'],
      ['Clock discipline', 'Seven blocks means the coach owns the clock. If a block runs long, live conversion gives up the minutes, never the finishing bridge.']
    ]]
  ];

  var CSS = '\
#develop-view .dv-tabs{display:inline-flex;gap:2px;padding:3px;background:rgba(118,118,128,.12);border-radius:11px;margin:0 0 18px}\
#develop-view .dv-tabs button{border:none;background:transparent;color:#6E6E73;font:600 13px inherit;font-family:inherit;font-size:13px;font-weight:600;padding:6px 14px;border-radius:8px;cursor:pointer;min-height:32px;min-width:0;text-transform:none}\
#develop-view .dv-tabs button.active{background:#fff;color:#1D1D1F;box-shadow:0 1px 3px rgba(0,0,0,.1)}\
#develop-view .dv-tabs button:focus-visible{outline:2px solid #0071E3;outline-offset:2px}\
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

  var current = 'principles';
  function block(lead, sections) {
    var h = '<div class="dv-lead"><div class="n">1</div><div><h4>' + esc(lead.title) + '</h4><p>' + esc(lead.text) + '</p></div></div>';
    h += '<div class="dv-grid">';
    sections.forEach(function (sec) {
      var style = sec[3] || '';
      h += '<section class="dv-card ' + style + (style === 'timeline' ? ' wide' : '') + '"><h4>' + esc(sec[0]) + '</h4><p class="in">' + esc(sec[1]) + '</p><ol class="dv-list">';
      sec[2].forEach(function (it, i) {
        var mark = style === 'numbered' || style === 'timeline' ? String(i + 1) : '';
        h += '<li class="dv-item"><span class="mk" aria-hidden="true">' + mark + '</span><div><b>' + esc(it[0]) + '</b>' + esc(it[1]) + '</div></li>';
      });
      h += '</ol></section>';
    });
    return h + '</div>';
  }
  function html() {
    return '<div class="dv-tabs" role="tablist">' +
      '<button type="button" role="tab" data-tab="principles"' + (current === 'principles' ? ' class="active"' : '') + '>Principles</button>' +
      '<button type="button" role="tab" data-tab="practice"' + (current === 'practice' ? ' class="active"' : '') + '>How we practice</button>' +
      '<button type="button" role="tab" data-tab="shape"' + (current === 'shape' ? ' class="active"' : '') + '>Tuesday and Thursday</button></div>' +
      '<div id="dv-body">' + (current === 'shape' ? block(SHAPE_LEAD, SHAPE) : current === 'practice' ? block(PRACTICE_LEAD, PRACTICE) : block(LEAD, SECTIONS)) + '</div>';
  }
  function paint(v) {
    v.innerHTML = html();
    v.querySelectorAll('.dv-tabs button').forEach(function (b) { b.addEventListener('click', function () { current = b.getAttribute('data-tab'); try { localStorage.setItem('gs_develop_tab', current); } catch (e) { /* optional */ } paint(v); setSub(); }); });
  }
  function setSub() {
    var s = document.querySelector('#coach-dashboard .dashboard-header .text-sub');
    if (s) s.textContent = current === 'shape' ? 'Doors 5:55. Seven blocks. Every block after power-ups is a read.' : current === 'practice' ? 'Finishing, bumping, reads, pace. How every practice is built.' : 'Program-wide. How we get every player better.';
  }

  function ensureView() {
    var v = el('develop-view'); if (v) return v;
    var main = document.querySelector('.dashboard-main'); if (!main) return null;
    v = document.createElement('div'); v.id = 'develop-view'; v.style.display = 'none';
    try { current = localStorage.getItem('gs_develop_tab') || current; } catch (e) { /* optional */ }
    paint(v);
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
    setSub();
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
    window.CoachDevelop = { open: open, mountNav: mountNav, show: function (tab) { current = tab; var v = ensureView(); if (v) paint(v); open(); } };
  });
})();
