/**
 * GODSPEED BASKETBALL. 5th Grade White playbook, inside the Coach Portal.
 *
 * Source of truth for the content: Scott's "Godspeed 5-Year Command Center"
 * material and the 5th Grade White coach onboarding page (Sep 2026). Content is
 * kept word for word; this file only moves it into the portal.
 *
 * Contract:
 *   window.CoachPlaybook.open(tab?)   render into #playbook-view (created inside
 *                                      .dashboard-main) and show it
 *   Tabs: spacing (default, spacing is the number one thing with this team),
 *         system (Square, Fill cut, Beating the press, Man to man, Special
 *         situations). Coaching IQ and Reading list are parked under Coach
 *         Academy as "Coming" (see markAcademyComing).
 *   Staff only: it lives behind the Coach Portal login and the onboarding gate.
 *   No network calls. No emojis. No em dashes in copy.
 */
(function () {
  'use strict';

  function esc(s){return (s==null?'':String(s)).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function el(id){return document.getElementById(id);}

  const TABS = [
    { key: 'spacing', label: 'Spacing first', title: 'Spacing first', sub: 'Number one with this team. Teach it before any set or play.' },
    { key: 'system',  label: 'The System',    title: 'Our system, pared down', sub: 'Square, Fill cut, Beating the press, Man to man, Special situations.' },
    { key: 'games',   label: 'Games with a job', title: 'Games with a job', sub: 'House scoring, the handicap ladder, and every small-sided game by what it fixes. Losers do wall pushes, winners shoot.' },
  ];
  // Coaching IQ and the Reading list are staged under Coach Academy and shown as
  // "Coming" until Scott turns them on. Their renderers stay in this file untouched.
  const ACADEMY_COMING = ['Coaching IQ', 'Reading list'];

  const CSS = `
#playbook-view{--bg:#F5F5F7;--card:#FFFFFF;--text:#1D1D1F;--text-soft:#6E6E73;--text-faint:#A1A1A6;--accent:#0071E3;--accent-dark:#0060C0;--accent-soft:#EAF3FF;--border:#E4E4E8;--border-light:#ECECF0;--radius-l:18px;--radius-m:12px;--radius-s:8px;--shadow-card:0 1px 3px rgba(15,23,42,.06),0 8px 24px rgba(15,23,42,.05);--font:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-family:var(--font);color:var(--text);max-width:880px}
#playbook-view .pb-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 18px;padding:3px;background:#e9e9eb;border-radius:12px;width:fit-content}
#playbook-view .pb-tabs button{border:none;background:transparent;color:var(--text-soft);font:600 13px var(--font);padding:8px 14px;border-radius:9px;cursor:pointer}
#playbook-view .pb-tabs button.active{background:#fff;color:var(--text);box-shadow:0 1px 3px rgba(0,0,0,.08)}
#playbook-view .pb-tabs button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
#playbook-view .pb-team{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-faint);margin-bottom:10px}
#playbook-view .pb-team i{width:10px;height:10px;border-radius:50%;background:#fff;border:2px solid #1D1D1F;display:inline-block}
#playbook-view .pb-head{margin:0 0 4px;font-size:22px;font-weight:700;letter-spacing:-.01em;text-transform:none}
#playbook-view .pb-sub{margin:0 0 16px;color:var(--text-soft);font-size:14px}
#playbook-view .pb-pane{display:none}#playbook-view .pb-pane.active{display:block}
#playbook-view h4,#playbook-view .sys-name,#playbook-view .iq-title,#playbook-view .b-title{text-transform:none;letter-spacing:normal}
#playbook-view ul{margin:0;padding:0}
#playbook-view .gm-intro{color:var(--text-soft);font-size:14px;line-height:1.55;margin:0 0 18px;max-width:760px}
#playbook-view .gm-rules{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px;margin:0 0 12px}
#playbook-view .gm-rule{background:var(--card);border:1px solid var(--border-light);border-radius:var(--radius-m);padding:12px 14px}
#playbook-view .gm-rule b{display:block;font-size:13px;margin-bottom:4px}
#playbook-view .gm-rule span{font-size:13px;color:var(--text-soft);line-height:1.5}
#playbook-view .gm-close{font-size:13px;color:var(--text);font-weight:600;margin:0 0 22px}
#playbook-view .gm-hc{counter-reset:hc;margin:0 0 8px}
#playbook-view .gm-hc-row{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--border-light);font-size:13px;line-height:1.5}
#playbook-view .gm-hc-row:before{counter-increment:hc;content:counter(hc);flex:0 0 22px;height:22px;border-radius:50%;background:#1D1D1F;color:#fff;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center}
#playbook-view .gm-hc-row b{margin-right:6px}
#playbook-view .gm-note{font-size:13px;color:var(--text-soft);line-height:1.55;margin:8px 0 22px;max-width:760px}
#playbook-view .gm-game{padding:12px 0;border-bottom:1px solid var(--border-light)}
#playbook-view .gm-game:last-child{border-bottom:none}
#playbook-view .gm-game h5{margin:0 0 4px;font-size:14px;font-weight:700;text-transform:none;letter-spacing:normal}
#playbook-view .gm-game p{margin:0 0 6px;font-size:13px;color:var(--text-soft);line-height:1.5}
#playbook-view .gm-score{display:inline-block;font-size:12px;font-weight:600;color:var(--accent-dark);background:var(--accent-soft);border-radius:var(--radius-s);padding:4px 8px;line-height:1.4}
#playbook-view .gm-look{margin:8px 0 0;padding:0 0 0 16px;font-size:12px;color:var(--text-soft);line-height:1.5}
#playbook-view .gm-look li{margin:0 0 2px}
#playbook-view .gm-night{list-style:none;margin:0 0 18px;padding:0}
#playbook-view .gm-night li{font-size:13px;color:var(--text-soft);line-height:1.55;padding:6px 0;border-bottom:1px solid var(--border-light)}
#playbook-view .gm-kids{background:#0A0A0A;color:#fff;border-radius:var(--radius-m);padding:16px 20px;font-size:14px;font-weight:600;line-height:1.5}
@media (max-width:640px){#playbook-view .gm-rules{grid-template-columns:1fr}}
#academy-nav .team-nav-item.is-coming{opacity:.55;cursor:default;pointer-events:none}
#academy-nav .team-nav-item.is-coming span{white-space:nowrap}
#academy-nav .team-nav-item.is-sub{padding-left:44px;font-size:13px}
#academy-nav .nav-coming{margin-left:auto;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#6E6E73;background:#E9E9EB;border-radius:999px;padding:3px 8px;line-height:1}
` + "#playbook-view .spacing-banner{margin-top:16px;background:#0A0A0A;color:#fff;border-radius:var(--radius-m);padding:16px 20px;display:flex;align-items:center;gap:14px;}\n#playbook-view .spacing-banner .n1{font-size:34px;font-weight:800;color:#FF5722;line-height:1;}\n#playbook-view .spacing-banner .st{font-size:14px;font-weight:600;}\n#playbook-view .spacing-banner .sd{font-size:12px;color:#c9c9cf;margin-top:2px;line-height:1.4;}\n#playbook-view .sec-title{font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-faint);margin:6px 2px 12px;}\n#playbook-view .principle{background:var(--card);border:1px solid var(--border-light);border-left:3px solid var(--accent);border-radius:var(--radius-m);padding:16px 18px;margin-bottom:12px;box-shadow:var(--shadow-card);}\n#playbook-view .principle h4{font-size:15px;font-weight:700;margin-bottom:5px;}\n#playbook-view .principle p{font-size:13.5px;color:var(--text-soft);line-height:1.55;}\n#playbook-view .sys-block{background:var(--card);border:1px solid var(--border-light);border-radius:var(--radius-m);box-shadow:var(--shadow-card);margin-bottom:14px;overflow:hidden;}\n#playbook-view .sys-head{display:flex;align-items:center;gap:12px;padding:16px 20px;cursor:pointer;}\n#playbook-view .sys-ico{width:38px;height:38px;border-radius:10px;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center;flex-shrink:0;}\n#playbook-view .sys-ico svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;}\n#playbook-view .sys-name{font-size:16px;font-weight:700;}\n#playbook-view .sys-maps{font-size:12px;color:var(--text-soft);margin-top:1px;}\n#playbook-view .sys-chev{margin-left:auto;color:var(--text-faint);font-size:20px;transition:transform .2s;}\n#playbook-view .sys-block.open .sys-chev{transform:rotate(90deg);}\n#playbook-view .sys-body{display:none;padding:0 20px 20px;border-top:1px solid var(--border-light);}\n#playbook-view .sys-block.open .sys-body{display:block;}\n#playbook-view .sys-layout{display:flex;gap:20px;padding-top:16px;flex-wrap:wrap;}\n#playbook-view .sys-diagram{flex:0 0 240px;max-width:100%;}\n#playbook-view .sys-diagram svg{width:100%;height:auto;background:var(--bg);border-radius:var(--radius-s);border:1px solid var(--border-light);}\n#playbook-view .sys-content{flex:1;min-width:260px;}\n#playbook-view .sys-sub{font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-faint);margin:14px 0 6px;}\n#playbook-view .sys-sub:first-child{margin-top:0;}\n#playbook-view .sys-intro{font-size:13.5px;line-height:1.55;color:var(--text);}\n#playbook-view .sys-list{list-style:none;}\n#playbook-view .sys-list li{font-size:13px;line-height:1.5;color:var(--text-soft);padding:4px 0 4px 16px;position:relative;}\n#playbook-view .sys-list li:before{content:\"\";position:absolute;left:0;top:11px;width:5px;height:5px;border-radius:50%;background:var(--accent);}\n#playbook-view .sys-setup-row{display:flex;gap:10px;padding:6px 0;border-bottom:1px solid var(--border-light);}\n#playbook-view .sys-setup-row:last-child{border-bottom:none;}\n#playbook-view .sys-setup-lbl{flex:0 0 118px;font-size:12.5px;font-weight:700;}\n#playbook-view .sys-setup-txt{flex:1;font-size:12.5px;color:var(--text-soft);line-height:1.45;}\n#playbook-view .rule-tag{display:inline-block;background:#0A0A0A;color:#fff;font-size:12px;font-weight:600;padding:6px 12px;border-radius:8px;margin:4px 6px 0 0;}\n#playbook-view .sys-court-line{fill:none;stroke:#c3c3cb;stroke-width:2;}\n#playbook-view .sys-court-dot{fill:var(--accent);}\n#playbook-view .sys-court-x{fill:none;stroke:#0A0A0A;stroke-width:3;stroke-linecap:round;}\n#playbook-view .sys-court-num{fill:#fff;font-weight:700;font-family:var(--font);}\n#playbook-view .filter-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;}\n#playbook-view .filter-row button{border:1px solid var(--border);background:var(--card);color:var(--text-soft);font-size:12px;font-weight:600;padding:7px 13px;border-radius:999px;cursor:pointer;}\n#playbook-view .filter-row button.active{background:var(--accent);color:#fff;border-color:var(--accent);}\n#playbook-view .iq-cat{font-size:12px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:var(--accent);margin:18px 2px 8px;}\n#playbook-view .iq-card{background:var(--card);border:1px solid var(--border-light);border-radius:var(--radius-m);box-shadow:var(--shadow-card);padding:15px 18px;margin-bottom:10px;cursor:pointer;}\n#playbook-view .iq-card .iq-top{display:flex;justify-content:space-between;align-items:baseline;gap:10px;}\n#playbook-view .iq-title{font-size:15px;font-weight:700;}\n#playbook-view .iq-src{font-size:11px;color:var(--text-faint);white-space:nowrap;}\n#playbook-view .iq-body{display:none;font-size:13.5px;line-height:1.62;color:var(--text-soft);margin-top:10px;}\n#playbook-view .iq-body.open{display:block;}\n#playbook-view .iq-quote{margin-top:10px;padding:10px 14px;background:var(--bg);border-left:3px solid var(--accent);border-radius:6px;font-style:italic;color:var(--text);font-size:13px;}\n#playbook-view .book{background:var(--card);border:1px solid var(--border-light);border-radius:var(--radius-m);box-shadow:var(--shadow-card);padding:14px 18px;margin-bottom:9px;cursor:pointer;}\n#playbook-view .book .b-top{display:flex;justify-content:space-between;align-items:baseline;gap:10px;}\n#playbook-view .book .b-title{font-size:14.5px;font-weight:700;}\n#playbook-view .book .b-author{font-size:11px;color:var(--text-faint);white-space:nowrap;}\n#playbook-view .book .b-why{display:none;font-size:13px;line-height:1.55;color:var(--text-soft);margin-top:8px;}\n#playbook-view .book .b-why.open{display:block;}\n#playbook-view .book .b-links{display:flex;gap:8px;margin-top:10px;}\n#playbook-view .book .b-links a{font-size:11px;font-weight:700;color:var(--accent);text-decoration:none;padding:4px 11px;border:1px solid var(--accent);border-radius:6px;}\n@media (max-width:640px){\n#playbook-view .sys-diagram{flex:0 0 100%;}\n}";

  function injectStyles(){ if(el('coach-playbook-css')) return; const s=document.createElement('style'); s.id='coach-playbook-css'; s.textContent=CSS; document.head.appendChild(s); }

  function ensureView(){
    let view = el('playbook-view');
    if (view) return view;
    const main = document.querySelector('.dashboard-main');
    if (!main) return null;
    view = document.createElement('div');
    view.id = 'playbook-view';
    view.style.display = 'none';
    view.innerHTML = `
      <div class="pb-team"><i></i>5th Grade</div>
      <h3 class="pb-head" id="pb-title"></h3>
      <p class="pb-sub" id="pb-sub"></p>
      <div class="pb-tabs" role="tablist">${TABS.map(t => `<button type="button" role="tab" data-tab="${t.key}">${t.label}</button>`).join('')}</div>
      <div class="pb-pane" data-pane="spacing"><div id="spacing-list"></div></div>
      <div class="pb-pane" data-pane="system"><div id="sys-list"></div></div>
      <div class="pb-pane" data-pane="games"><div id="games-list"></div></div>
`;
    const header = main.querySelector('.dashboard-header');
    if (header && header.nextSibling) main.insertBefore(view, header.nextSibling); else main.appendChild(view);
    view.querySelectorAll('.pb-tabs button').forEach(b => b.addEventListener('click', () => showTab(b.getAttribute('data-tab'))));
    try { renderSpacing(); renderSystem(); renderGames(GAMES_FALLBACK); loadGames(); } catch (e) { console.warn('[playbook] render failed:', e.message); }
    return view;
  }

  function showTab(key){
    const t = TABS.find(x => x.key === key) || TABS[0];
    document.querySelectorAll('#playbook-view .pb-tabs button').forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === t.key));
    document.querySelectorAll('#playbook-view .pb-pane').forEach(p => p.classList.toggle('active', p.getAttribute('data-pane') === t.key));
    const h = el('pb-title'); if (h) h.textContent = t.title;
    const s = el('pb-sub'); if (s) s.textContent = t.sub;
    try { localStorage.setItem('gs_playbook_tab', t.key); } catch (e) { /* optional */ }
  }

  function open(tab){
    injectStyles();
    const view = ensureView();
    if (!view) return;
    const main = view.parentNode;
    main.querySelectorAll('div[id$="-view"]').forEach(v => { if (v !== view) v.style.display = 'none'; });
    document.querySelectorAll('.team-nav-item.active, .segment-btn.active').forEach(n => n.classList.remove('active'));
    const item = el('playbook-nav-item'); if (item) item.classList.add('active');
    const tabs = el('view-tabs'); if (tabs) tabs.style.display = 'none';
    const title = el('view-title'); if (title) title.textContent = '5th Grade Playbook';
    view.style.display = 'block';
    let saved = null; try { saved = localStorage.getItem('gs_playbook_tab'); } catch (e) { /* optional */ }
    showTab(tab || saved || 'spacing');
  }

  function comingPill(){ const p = document.createElement('span'); p.className = 'nav-coming'; p.textContent = 'Coming'; return p; }

  // Coach Academy is not live yet: keep the item, take away the click, tag it
  // "Coming", and list Coaching IQ and Reading list under it the same way.
  function markAcademyComing(anchor){
    const academy = anchor.querySelector('.team-nav-item');
    if (!academy || academy.classList.contains('is-coming')) return;
    academy.removeAttribute('onclick'); academy.onclick = null;
    academy.classList.remove('active'); academy.classList.add('is-coming');
    academy.setAttribute('aria-disabled', 'true');
    academy.appendChild(comingPill());
    let after = academy;
    ACADEMY_COMING.forEach(label => {
      const d = document.createElement('div');
      d.className = 'team-nav-item is-coming is-sub';
      d.setAttribute('aria-disabled', 'true');
      d.style.cssText = 'display:flex;align-items:center;gap:12px;';
      const t = document.createElement('span'); t.textContent = label; d.appendChild(t); d.appendChild(comingPill());
      anchor.insertBefore(d, after.nextSibling); after = d;
    });
  }

  function mountNav(){
    if (el('playbook-nav-item')) return;
    const anchor = el('academy-nav');
    if (!anchor) return;
    markAcademyComing(anchor);
    const a = document.createElement('div');
    a.className = 'team-nav-item';
    a.id = 'playbook-nav-item';
    a.style.cssText = 'display:flex;align-items:center;gap:12px;';
    a.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.7" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"></path></svg><span>5th Grade Playbook</span>';
    a.onclick = () => open();
    anchor.appendChild(a);
    // Any team view chosen later should hide the playbook and restore the tabs.
    const orig = window.switchTeamView;
    if (typeof orig === 'function' && !orig.__pbWrapped) {
      const wrapped = function () { const v = el('playbook-view'); if (v) v.style.display = 'none'; const t = el('view-tabs'); if (t) t.style.display = ''; a.classList.remove('active'); return orig.apply(this, arguments); };
      wrapped.__pbWrapped = true; window.switchTeamView = wrapped;
    }
  }

  // Mount when the dashboard appears (enterPortal shows it). Poll lightly; no MutationObserver needed.
  document.addEventListener('DOMContentLoaded', () => {
    injectStyles();
    const timer = setInterval(() => {
      const dash = el('coach-dashboard');
      if (dash && dash.style.display !== 'none' && dash.style.display !== '') { mountNav(); }
      if (el('playbook-nav-item')) clearInterval(timer);
    }, 700);
    window.CoachPlaybook = { open, mountNav };
  });

  // ── content (verbatim from the 5th Grade White onboarding page) ──
// [category, title, tip]. Categories are the order a coach teaches them:
// where players stand, how they move, how they attack, how they beat pressure,
// and how it becomes a habit.
var SPACING_CATS=['Setup','Movement','Attack','Pressure','Habits'];
var SPACING=[
  ['Setup','Space the floor to five spots','Two in the corners, two on the wings or slots, one at the top. Even, wide spacing forces the defense to guard the whole floor and opens driving lanes.'],
  ['Movement','One pass, one spot away','Cutters and screeners return to open space. Never let two players stand in the same area. Crowded offense is easy to guard.'],
  ['Movement','Fill behind the drive','When a teammate drives, everyone else relocates to keep the floor spaced. The Fill cut (in the System tab) is how we do it.'],
  ['Attack','Attack first','More than anything, we want guys to attack. Catch it, face up, and go. Spacing exists so there is somewhere to attack. A player who hesitates lets the defense reset.'],
  ['Attack','Drive gaps, not bodies','Attack the space between two defenders. Good spacing creates gaps. If there is no gap, the spacing is wrong, fix it first.'],
  ['Attack','Reads when you get stopped','The second thing we teach after attacking. Getting stopped is fine, freezing is not. Read who helped: if the corner defender helped, kick to the corner. If the top defender helped, hit the fill behind you. If nobody helped, keep going. If the ball is in trouble, retreat dribble to open space and start over. Everyone else holds their spot so the read is easy.'],
  ['Pressure','Spacing beats pressure','Against the press and the trap, spread out so traps have to travel and there is always an open outlet. Never put two players in one trap.'],
  ['Habits','Space is a habit, not a play','We coach spacing every drill, every scrimmage, every day. When in doubt at practice, fix the spacing before anything else.']
];
var spacingFilter='All';
function setSpacing(c){spacingFilter=c;renderSpacing();}
function renderSpacing(){
  var h='<div class="spacing-banner" style="margin:0 0 16px;"><div class="n1">1</div><div><div class="st">Why spacing is number one</div><div class="sd">Everything we run depends on the floor being spaced. Cuts, drives, and the Square offense only work with room to operate. Teach spacing first and the rest follows.</div></div></div>';
  h+='<div class="filter-row" role="group" aria-label="Spacing categories">'+['All'].concat(SPACING_CATS).map(function(c){return '<button type="button" data-cat="'+esc(c)+'"'+(c===spacingFilter?' class="active"':'')+'>'+esc(c)+'</button>';}).join('')+'</div>';
  SPACING_CATS.forEach(function(cat){
    if(spacingFilter!=='All'&&spacingFilter!==cat) return;
    var tips=SPACING.filter(function(p){return p[0]===cat;});
    if(!tips.length) return;
    h+='<div class="iq-cat">'+esc(cat)+'</div>';
    tips.forEach(function(p){h+='<div class="principle"><h4>'+esc(p[1])+'</h4><p>'+esc(p[2])+'</p></div>';});
  });
  var root=document.getElementById('spacing-list'); if(!root) return;
  root.innerHTML=h;
  root.querySelectorAll('.filter-row button').forEach(function(b){b.addEventListener('click',function(){setSpacing(b.getAttribute('data-cat'));});});
}

/* ---------- system (pared to 5) ---------- */
function courtSquare(){
  return '<svg viewBox="0 0 300 260" role="img" aria-label="Square, five-out spacing"><g class="sys-court-line">'+
    '<rect x="6" y="6" width="288" height="248" rx="6"/><rect x="115" y="150" width="70" height="104"/><line x1="115" y1="150" x2="185" y2="150"/><path d="M120 150 A30 30 0 0 0 180 150"/><line x1="133" y1="243" x2="167" y2="243"/><circle cx="150" cy="236" r="7"/><path d="M40 254 L40 165 A118 118 0 0 1 260 165 L260 254"/></g>'+
    dot(70,42,'1')+dot(150,42,'2')+dot(230,42,'3')+dot(40,232,'4')+dot(260,232,'5')+'</svg>';
}
function courtPress(){
  return '<svg viewBox="0 0 200 320" role="img" aria-label="Press break, full court"><g class="sys-court-line">'+
    '<rect x="6" y="6" width="188" height="308" rx="6"/><line x1="6" y1="160" x2="194" y2="160"/><circle cx="100" cy="160" r="20"/><rect x="72" y="270" width="56" height="44"/><line x1="72" y1="270" x2="128" y2="270"/><circle cx="100" cy="303" r="5"/><rect x="72" y="6" width="56" height="44"/><line x1="72" y1="50" x2="128" y2="50"/><circle cx="100" cy="17" r="5"/></g>'+
    dot(100,300,'1')+dot(45,255,'2')+dot(155,255,'3')+dot(100,205,'4')+dot(100,80,'5')+'</svg>';
}
function courtMan(){
  return '<svg viewBox="0 0 300 260" role="img" aria-label="Half court man to man defense"><g class="sys-court-line">'+
    '<rect x="6" y="6" width="288" height="248" rx="6"/><rect x="115" y="150" width="70" height="104"/><line x1="115" y1="150" x2="185" y2="150"/><path d="M120 150 A30 30 0 0 0 180 150"/><line x1="133" y1="243" x2="167" y2="243"/><circle cx="150" cy="236" r="7"/><path d="M40 254 L40 165 A118 118 0 0 1 260 165 L260 254"/></g>'+
    x(150,62)+x(70,140)+x(230,140)+x(118,205)+x(182,205)+'</svg>';
}
function courtSpecial(){
  return '<svg viewBox="0 0 300 200" role="img" aria-label="Baseline out of bounds, box set"><g class="sys-court-line">'+
    '<rect x="6" y="6" width="288" height="188" rx="6"/><rect x="115" y="6" width="70" height="92"/><line x1="115" y1="98" x2="185" y2="98"/><path d="M120 98 A30 30 0 0 0 180 98"/><line x1="133" y1="14" x2="167" y2="14"/><circle cx="150" cy="22" r="6"/></g>'+
    dot(214,30,'I')+dot(120,70,'1')+dot(180,70,'2')+dot(120,125,'3')+dot(180,125,'4')+'</svg>';
}
function dot(xx,yy,n){return '<circle class="sys-court-dot" cx="'+xx+'" cy="'+yy+'" r="13"/><text class="sys-court-num" x="'+xx+'" y="'+(yy+5)+'" text-anchor="middle" font-size="13">'+n+'</text>';}
function x(xx,yy){var s=9;return '<line class="sys-court-x" x1="'+(xx-s)+'" y1="'+(yy-s)+'" x2="'+(xx+s)+'" y2="'+(yy+s)+'"/><line class="sys-court-x" x1="'+(xx+s)+'" y1="'+(yy-s)+'" x2="'+(xx-s)+'" y2="'+(yy+s)+'"/>';}

var SYS=[
  {key:'square',name:'Square',maps:'Our offense, 5-out / 4-out (Flow)',ico:'<rect x="4" y="4" width="16" height="16" rx="2"/>',svg:courtSquare,
    intro:'Five-out or four-out spacing shaped like a square, run as our Flow offense: high ball screen, roll and replace, with dribble-drive spacing. The replace man is open for the jumper almost every time. This only works with great spacing.',
    principles:['Roll and Replace (our Yo-Yo): the screener rolls to the rim, the low post sprints up the lane line to replace at the top.','Sink and Sprint: the low post sinks to the baseline as the screen sets, then sprints the lane line to replace.','Attack, pass, or exchange within a second of using the screen.','Keep the floor spaced to five spots so drives have gaps and the replace man is open.','Hit the strong-side elbow, the kill zone, as the target for the ball handler.'],
    setup:[['Roll and Replace','Screener rolls hard, low post replaces at the top for the open jumper.'],['vs the blitz','Pull and pivot: plant the inside foot, shuffle back, buy time for the cutters.'],['Flow','Dribble hand-offs, pin downs, and zoom all flow into the same roll and replace.']],
    rules:['Space to five spots first.','High ball screen, roll and replace.','Replace man is the shooter.','Attack the gaps off the screen.']},
  {key:'fill',name:'Fill cut',maps:'The spacing cut',ico:'<path d="M5 12h14M13 6l6 6-6 6"/>',svg:null,
    intro:'The Fill cut is how we keep the floor spaced when the ball moves. Fill the spot a teammate leaves when they drive. It is the single most important habit for our spacing.',
    principles:['When a teammate drives, do not stand and watch. Move to fill the space they vacated.','Relocate along the arc to a new window so the driver always has a kick-out.','Never let two players end up in the same area. One in, one out.','Fill on time: move as the drive starts, not after.','Every cut finishes at a spot: top, slot, corner, or block. Never drift into no-man\'s-land.'],
    setup:[['Drive and fill','Ball handler drives a gap; the nearest spacing player fills behind to the open spot.'],['Kick and relocate','On the kick-out, the shooter can relocate one spot over to lose the closeout.']],
    rules:['Fill the spot the driver leaves.','One in, one out, never two in a spot.','Move on the drive, not after.','Finish every cut at a real spot.']},
  {key:'press',name:'Beating the press',maps:'Press break',ico:'<path d="M4 12h16M4 6h16M4 18h16"/>',svg:courtPress,
    intro:'A broken press is a numbers advantage. Attack it to score, do not just survive it. Spacing beats the trap: keep players spread so traps have to travel, and never put two men in one trap.',
    principles:['Get it in quick and find the middle: the middle of the press is the soft spot.','Beat pressure with the pass, not the dribble, up the floor.','When the first line breaks, sprint and throw ahead: attack four-on-three and three-on-two.','Stay calm and strong: two feet, pivot, protect, find the release.','Always give the ball handler two outlets, never leave him alone.'],
    setup:[['Press break','Inbounder takes it out. Two guards start low and sprint to the ball side and the middle. A wing flashes to the free-throw line as the middle release. A rim-runner sprints deep. Inbound, look middle, reverse, then sprint ahead to score.'],['vs 3/4 court','Push the ball across before they set the trap at half court. Do not walk it up.']],
    rules:['Ball to the middle beats the press.','Pass over the trap, do not dribble into it.','Spread out, never two men in one trap.','Break it and sprint to score.']},
  {key:'man',name:'Man to man defense',maps:'Our base defense',ico:'<path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/>',svg:courtMan,
    intro:'Man to man is our base. Play at the level of the ball at all times, shoulder to shoulder, close enough to touch. Be physical. Make players feel you on defense.',
    principles:['One guy always on the ball, four guys always in help. In transition, one man stops the ball, the other four are ready to help.','You are in one of three places: on the ball, on the middle help line, or on the bench. There is no fourth option.','No middle stance. Be in air space. Front the post, no middle ball in the post. Arm bar, foot free.','Get on players in this order: Effort first (never negotiable), then Coverage (right spot), then Play (right read).','When you get beat, turn and run to the paint. It is how you play after you get beat that decides how good you become.'],
    setup:[['6 keys','Get back in transition. No easy layups. No open threes. Contest every two. Enjoy contact. Play as a connected group.'],['Pick and roll','Hand on, go to the player, chest up. Two-hand tag with the help in the middle, ready before the screen arrives.'],['Three aspects','System (base everyone knows), Adjustments (per opponent), Parachute (emergency defense).']],
    rules:['Level of the ball, shoulder to shoulder.','On the ball or in help, no fourth option.','No easy layups, no open threes.','Effort first, always.']},
  {key:'special',name:'Special situations',maps:'SLOB, BLOB, end of game',ico:'<path d="M12 8v4l3 2M12 3a9 9 0 100 18 9 9 0 000-18z"/>',svg:courtSpecial,
    intro:'Do not bloat the playbook. Run our base offense and sets from out of bounds with one consistent alignment, and have a call for every end-game situation.',
    principles:['Same alignment every time: do not tip the defense with how you line up.','Get into your base actions from SLOB and BLOB, do not invent new plays.','Have a get-it-in safety and a score option out of the same look.','Know the situation cold: time, score, fouls, and the shot you need.','Small edges add up: win the in-between phases.'],
    setup:[['G, Get it in','Safety option, purely to inbound it clean under pressure.'],['S, Score','A sequence of actions off the inbound to get a real look.'],['Checklist','SLOB and BLOB (need a 2, need a 3, score, defense), ELOB advance, jump ball, free throw, end of quarter, who to foul, timeout usage.']],
    rules:['One alignment for every out of bounds.','Base offense first, special plays second.','Always have a get-it-in and a score call.','Rehearse end game: need a 2, need a 3, who to foul.']}
];
function renderSystem(){
  var h='<div class="spacing-banner" style="margin:0 0 16px;"><div class="n1">1</div><div><div class="st">Every piece below assumes good spacing.</div><div class="sd">The Square, the Fill cut, the press break, they all break down without it. Spacing is the thread through the whole system.</div></div></div>';
  SYS.forEach(function(s){
    h+='<div class="sys-block" id="sys-'+s.key+'">';
    h+='<div class="sys-head" onclick="document.getElementById(\'sys-'+s.key+'\').classList.toggle(\'open\')">'+
       '<div class="sys-ico"><svg viewBox="0 0 24 24">'+s.ico+'</svg></div>'+
       '<div><div class="sys-name">'+esc(s.name)+'</div><div class="sys-maps">'+esc(s.maps)+'</div></div>'+
       '<div class="sys-chev">&rsaquo;</div></div>';
    h+='<div class="sys-body"><div class="sys-layout">';
    if(s.svg){h+='<div class="sys-diagram">'+s.svg()+'</div>';}
    h+='<div class="sys-content">';
    h+='<div class="sys-intro">'+esc(s.intro)+'</div>';
    h+='<div class="sys-sub">Principles</div><ul class="sys-list">';
    s.principles.forEach(function(p){h+='<li>'+esc(p)+'</li>';});
    h+='</ul>';
    h+='<div class="sys-sub">Setup</div>';
    s.setup.forEach(function(r){h+='<div class="sys-setup-row"><div class="sys-setup-lbl">'+esc(r[0])+'</div><div class="sys-setup-txt">'+esc(r[1])+'</div></div>';});
    h+='<div class="sys-sub">Rules</div><div>';
    s.rules.forEach(function(r){h+='<span class="rule-tag">'+esc(r)+'</span>';});
    h+='</div>';
    h+='</div></div></div></div>';
  });
  document.getElementById('sys-list').innerHTML=h;
}

/* ---------- coaching iq ---------- */
var IQ=[
  {cat:'Defense',title:'6 Keys to Defense',source:'Kevin O\'Neill (USC)',body:'1. Transition D, get back before the ball.<br>2. No easy layups, ever.<br>3. No open 3s, contest every shot.<br>4. Contested 2s, make them shoot tough.<br>5. Enjoy contact, be physical, seek it.<br>6. Play as a group on defense, connected, communicating.<br><div class="iq-quote">"If you give up easy baskets you won\'t win."</div>'},
  {cat:'Defense',title:'Defensive Positioning, 3 Places You Can Be',source:'Kevin O\'Neill (USC)',body:'You are either on the ball, on the middle help line, or on the bench. There is no fourth option. Play at the level of the ball. Shoulder to shoulder, close to touch. No middle stance. Be in air space. Physical presence. Front the post. No middle ball in the post.<br><div class="iq-quote">"Want people to feel you on defense."</div>'},
  {cat:'Defense',title:'Help Defense Rule',source:'Kevin O\'Neill (USC)',body:'One guy always on the ball, four always in help. In transition, one man stops the ball, the other four are ready to help. Get the ball to one side of the court to be a functional group. Sprint your big to the nail to stop point guard penetration.<br><div class="iq-quote">"3 on 2, 5 on 4 D must be great or you won\'t win."</div>'},
  {cat:'Defense',title:'Defending the Pick and Roll',source:'Kevin O\'Neill (USC)',body:'Hand on, go to the player, chest up. Two-hand tag with the help guy in the middle. Teaches players to always be in help position. The help defender must be ready before the screen arrives.'},
  {cat:'Defense',title:'Half Court Man to Man Principles',source:'Kevin O\'Neill (USC)',body:'Play at the level of the ball. Man to man, shoulder to shoulder. Close to touch. No middle stance. Be in air space. Physical presence. Make it look crowded. Front post. No middle ball in post. Arm bar, foot free.<br><div class="iq-quote">"It\'s how you play after you get beat that decides how good you\'re going to be."</div>When beat: turn and run to paint.'},
  {cat:'Defense',title:'3 Things to Get on Players For',source:'Kevin O\'Neill (USC)',body:'In this order:<br>1. <strong>Effort</strong>, never negotiable<br>2. <strong>Coverage</strong>, are you in the right spot?<br>3. <strong>Play</strong>, did you make the right read?<br>Effort first, always. You can teach coverage and plays. You cannot teach effort.'},
  {cat:'Defense',title:'3 Aspects of Defense',source:'Kevin O\'Neill (USC)',body:'1. <strong>System</strong>, your base defense that everyone knows.<br>2. <strong>Adjustments</strong>, what you change per opponent.<br>3. <strong>Parachute</strong>, emergency defense when nothing else works.'},
  {cat:'Drills',title:'5 on 4 Scramble Drill',source:'Kevin O\'Neill (USC)',body:'5 on 4 scramble transitions into 5 on 5. Each team plays offense and defense once. Then 5 on 5 Switch and Change: Pull (back to half court), Change (run the other way), Switch (drop the ball, defend someone else). 3-minute games. Doubles as conditioning.'},
  {cat:'Offense',title:'5 Rules of Offense',source:'Bob McKillop (Davidson)',body:'1. <strong>Fight for Space</strong>, use pivots to create space.<br>2. <strong>Catch and See</strong>, opponent, teammates, teammates\' opponents.<br>3. <strong>Help Somebody</strong>, cheer the screener, sacrifice.<br>4. <strong>Finish Your Cut</strong>, top of key, slot, corner, low block, center of paint.<br>5. <strong>Dribble with a Purpose</strong>, attack somebody or help somebody.<br><div class="iq-quote">"When you help somebody you help yourself."</div>'},
  {cat:'Offense',title:'Why We Run 4-Out-1-In Spacing',source:'Billy Donovan (Florida)',body:'Difficult to defend in transition. Forces a true 4-man to defend on the perimeter. Makes it hard to double the post with so much space. No 3s unless there is a post player in the paint to rebound.<br><div class="iq-quote">"Don\'t ignore the numbers. Numbers are facts."</div>'},
  {cat:'Offense',title:'5 Ways to Get a 3-Point Shot',source:'Billy Donovan (Florida)',body:'1. Fast break.<br>2. Catch and shoot off dribble penetration.<br>3. Post catch, double team, kick.<br>4. Shots out of offense, screens and PnR.<br>5. Offensive rebound, clear to the 3pt line every time.'},
  {cat:'Offense',title:'Davidson Offensive Philosophy',source:'Bob McKillop (Davidson)',body:'Always make yourself better. Be a great copier. Keep it simple. Establish a system you believe in. Offense based on rhythm and flow. Run with discipline.<br><div class="iq-quote">"The ball is like a spotlight, the longer you hold it, the hotter it gets."</div>'},
  {cat:'Shooting',title:'Shooting Practice Standards',source:'Billy Donovan (Florida)',body:'Chart everything. How many shots does your best player get in a 2-hour practice? Always do 20-30 minutes of individual work. Passers lead shooters, pass into the inside shoulder. Players must know how to shoot when tired.'},
  {cat:'Drills',title:'Olympic Shooting Drill',source:'Billy Donovan (Florida)',body:'Loop and follow format. Time the weave so you run into the 3pt line. 3 minutes on the clock. 3pt = 3, 2pt = 2, layup = 1. Start at 120 points, go up 2 each time.'},
  {cat:'Drills',title:'Celtic 50',source:'Billy Donovan (Florida)',body:'Make 5 from 5 spots. Progress to 10 from 5 spots. High volume, tracks consistency across the floor.'},
  {cat:'Post Play',title:'What Makes a Great Post Player',source:'Kevin Sutton (Montverde)',body:'Runs rim to rim. Legally physical. On balance. Good feet. Relentless rebounder. Good hands. Defends the position and controls the paint. Makes free throws. Vocal. Does not miss layups.<br><div class="iq-quote">"When players hold each other accountable you have something special."</div>'},
  {cat:'Post Play',title:'Reading the Defender in the Post',source:'Kevin Sutton (Montverde)',body:'Feel a hand or forearm to know which way to go. <strong>Forearm</strong> = power game (drop step, go through them). <strong>Hand</strong> = face-up game (they are playing light, attack). Pivot even to even. Feet shoulder width. Look middle, doubles come from the high side.'},
  {cat:'Post Play',title:'Paint Ownership System',source:'Kevin Sutton (Montverde)',body:'<strong>Paint = Own. Outside the paint = Rent. 3-Point Line = Homeless.</strong> Do not miss layups. Always use the backboard.'},
  {cat:'IQ / Philosophy',title:'7 Fundamental Keys',source:'Bob McKillop (Davidson)',body:'1. See, games are like darting taxis. 2. Talk. 3. Have an Act, fake a cut. 4. Down and Balanced, be powerful. 5. Details, do the little things. 6. Flesh to Flesh Contact, take a charge. 7. Finish Everything, last play is the strongest.<br><div class="iq-quote">"Coaching is not plays, it\'s playing."</div>'},
  {cat:'IQ / Philosophy',title:'4 Daily Objectives',source:'Bob McKillop (Davidson)',body:'Every meeting, practice, and game day: 1. Get Better. 2. Have Fun. 3. Make Every Play Count. 4. Play to Win.<br><div class="iq-quote">"Players can never be afraid to lose or make a mistake."</div>'},
  {cat:'IQ / Philosophy',title:'Communication in Basketball',source:'Kevin Sutton (Montverde)',body:'1. Information given, you said it. 2. Information received, they heard it. 3. Information understood, they acted on it. Most teams stop at level 1. Elite teams operate at level 3.'},
  {cat:'Culture',title:'Culture Rules',source:'Kevin O\'Neill (USC)',body:'Always say "we." No out of bounds, no fouls in practice, it makes you play harder. Coaches stick up for other coaches. Respect the game. Develop your assistants. If someone is hurting the program, remove them.<br><div class="iq-quote">"The players on your team are the most important part of the job."</div>'},
  {cat:'Culture',title:'The Penny Jar',source:'Bob McKillop (Davidson)',body:'Give a penny for every good thing and place it in a jar. The team visually watches their accomplishments grow across the season. Simple, visual, powerful. Find team building outside basketball too.'}
];
var iqFilter='All';
function renderIQ(){
  var cats=['All'].concat(Array.from(new Set(IQ.map(function(c){return c.cat;}))));
  var fh='';
  cats.forEach(function(c){fh+='<button class="'+(c===iqFilter?'active':'')+'" onclick="setIQ(\''+c.replace(/'/g,"\\'")+'\')">'+esc(c)+'</button>';});
  document.getElementById('iq-filter').innerHTML=fh;
  var items=IQ.filter(function(c){return iqFilter==='All'||c.cat===iqFilter;});
  var byCat={},order=[];
  items.forEach(function(c){if(!byCat[c.cat]){byCat[c.cat]=[];order.push(c.cat);}byCat[c.cat].push(c);});
  var h='';
  order.forEach(function(cat){
    h+='<div class="iq-cat">'+esc(cat)+'</div>';
    byCat[cat].forEach(function(c){
      h+='<div class="iq-card" onclick="this.querySelector(\'.iq-body\').classList.toggle(\'open\')">'+
         '<div class="iq-top"><span class="iq-title">'+esc(c.title)+'</span><span class="iq-src">'+esc(c.source)+'</span></div>'+
         '<div class="iq-body">'+c.body+'</div></div>';
    });
  });
  document.getElementById('iq-list').innerHTML=h;
}
function setIQ(c){iqFilter=c;renderIQ();}

/* ---------- reading list ---------- */
var BOOKS=[
  {cat:'Philosophy & Culture',items:[
    {title:'InSideOut Coaching',author:'Joe Ehrmann',why:'The foundational text on transformational coaching. Building men, not just players. This IS the Godspeed philosophy.',audible:'https://www.audible.com/pd/InSideOut-Coaching-Audiobook/B005ESYPUY'},
    {title:'The Captain Class',author:'Sam Walker',why:'What makes the greatest teams in history. The common thread is not talent, it is culture, selflessness, and relentless standards.',scribd:'https://www.scribd.com/document/907116353/The-Captain-Class',audible:'https://www.audible.com/pd/The-Captain-Class-Audiobook/B06XDSV65L'},
    {title:'Legacy',author:'James Kerr',why:'How the All Blacks built the most dominant culture in sports. Leave the jersey in a better place. Brotherhood in action.',scribd:'https://www.scribd.com/document/574849709/Legacy',audible:'https://www.audible.com/pd/Legacy-Audiobook/B0CP4RDJ4G'},
    {title:'Wooden on Leadership',author:'John Wooden',why:'The pyramid of success from the greatest coach of all time. His definition of success has nothing to do with scoreboards.',scribd:'https://www.scribd.com/document/882215254/Wooden-on-Leadership'},
    {title:'The Score Takes Care of Itself',author:'Bill Walsh',why:'Standard of performance. Set the standard high enough in everything and winning is a byproduct.',scribd:'https://www.scribd.com/audiobook/237910952/The-Score-Takes-Care-of-Itself',audible:'https://www.audible.com/pd/The-Score-Takes-Care-of-Itself-Audiobook/B002V0PP70'},
    {title:'Eleven Rings',author:'Phil Jackson',why:'Managing egos, building trust, mindful leadership. How to coach talented players who need more than Xs and Os.',scribd:'https://www.scribd.com/document/970178141/Book-Eleven-Rings-Phil-Jackson',audible:'https://www.audible.com/pd/Eleven-Rings-Audiobook/B00CS9Z7Y0'}
  ]},
  {cat:'Basketball Tactics & Development',items:[
    {title:'Basketball on Paper',author:'Dean Oliver',why:'The four factors that determine who wins. Teaches you to see the game through data, not just feel.',scribd:'https://www.scribd.com/document/465529536/basketball-on-paper-rules-and-tools-for-performance-analysis'},
    {title:'Thinking Basketball',author:'Ben Taylor',why:'Modern basketball IQ explained. Teach players to read the game, not just run plays. Decision-making is the separator.',scribd:'https://www.scribd.com/document/516474350/Ben-Taylor-Thinking-Basketball'},
    {title:'The Playmaker\'s Advantage',author:'Leonard Zaichkowsky',why:'Cognitive basketball, how the brain processes the game. Train anticipation, pattern recognition, split-second reads.',audible:'https://www.audible.com/pd/The-Playmakers-Advantage-Audiobook/B074F3V1LR'}
  ]},
  {cat:'Mindset & Performance',items:[
    {title:'Relentless',author:'Tim Grover',why:'The trainer behind Jordan and Kobe on what separates good from great from unstoppable.',scribd:'https://www.scribd.com/audiobook/480308617/Relentless-From-Good-to-Great-to-Unstoppable',audible:'https://www.audible.com/pd/Relentless-Audiobook/1797121766'},
    {title:'The Mamba Mentality',author:'Kobe Bryant',why:'Kobe\'s own breakdown of his work ethic, preparation, and obsession with detail.',scribd:'https://www.scribd.com/document/544592009/The-Mamba-Mentality-How-I-Play-Kobe-Bryant'},
    {title:'Atomic Habits',author:'James Clear',why:'Systems over goals. Build the daily habits that compound into elite performance. The Habits in Brotherhood. Habits. Success.',scribd:'https://www.scribd.com/document/891099750/Atomic-Habits-by-James-Clear',audible:'https://www.audible.com/pd/Atomic-Habits-Audiobook/1524779261'},
    {title:'Can\'t Hurt Me',author:'David Goggins',why:'Mental toughness taken to the extreme. The mindset you are building during conditioning.',scribd:'https://www.scribd.com/document/501407704/Can-t-Hurt-Me-by-David-Goggins',audible:'https://www.audible.com/pd/Cant-Hurt-Me-Audiobook/B07KKMNZCH'},
    {title:'Chop Wood Carry Water',author:'Joshua Medcalf',why:'Mastering the mundane. Why the boring daily work separates dreamers from achievers.',scribd:'https://www.scribd.com/book/490560112/Chop-Wood-Carry-Water',audible:'https://www.audible.com/pd/Chop-Wood-Carry-Water-Audiobook/B01MQDIW7M'},
    {title:'Mind Gym',author:'Gary Mack',why:'Sports psychology made practical. Visualization, focus, pressure management.',scribd:'https://www.scribd.com/book/479959647/Mind-Gym-An-Athlete-s-Guide-to-Inner-Excellence',audible:'https://www.audible.com/pd/Mind-Gym-Audiobook/B002VA3GJO'}
  ]},
  {cat:'Faith & Character',items:[
    {title:'The Way of the Warrior',author:'Erwin McManus',why:'Spiritual strength and courage. Fighting for something bigger than yourself. The faith backbone of Godspeed.',audible:'https://www.audible.com/pd/The-Way-of-the-Warrior-Audiobook/1984828487'},
    {title:'Uncommon',author:'Tony Dungy',why:'Super Bowl champion coach on faith, family, and doing things the right way when everyone else cuts corners.',scribd:'https://www.scribd.com/audiobook/241864053/Uncommon-Finding-Your-Path-to-Significance'},
    {title:'Training Camp',author:'Jon Gordon',why:'A fable about becoming your best. Short, powerful, perfect to discuss during brotherhood circles.',audible:'https://www.audible.com/pd/Training-Camp-Audiobook/B003KFCYCE'},
    {title:'The Energy Bus',author:'Jon Gordon',why:'Positive leadership and eliminating negativity. Build a team where everyone lifts each other.',scribd:'https://www.scribd.com/book/269501212/The-Energy-Bus-10-Rules-to-Fuel-Your-Life-Work-and-Team-with-Positive-Energy',audible:'https://www.audible.com/pd/The-Energy-Bus-Audiobook/B002V5GV9G'}
  ]}
];
function renderReading(){
  var h='';
  BOOKS.forEach(function(cat){
    h+='<div class="iq-cat">'+esc(cat.cat)+'</div>';
    cat.items.forEach(function(b){
      var links='';
      if(b.scribd)links+='<a href="'+esc(b.scribd)+'" target="_blank" rel="noopener" onclick="event.stopPropagation()">Scribd</a>';
      if(b.audible)links+='<a href="'+esc(b.audible)+'" target="_blank" rel="noopener" onclick="event.stopPropagation()">Audible</a>';
      h+='<div class="book" onclick="this.querySelector(\'.b-why\').classList.toggle(\'open\')">'+
         '<div class="b-top"><span class="b-title">'+esc(b.title)+'</span><span class="b-author">'+esc(b.author)+'</span></div>'+
         '<div class="b-why">'+esc(b.why)+(links?'<div class="b-links">'+links+'</div>':'')+'</div></div>';
    });
  });
  document.getElementById('reading-list').innerHTML=h;
}
// ── Games with a job ──
// Content lives in program_content.playbook-games so a scoring rule can change
// without a push; GAMES_FALLBACK is the same content frozen at build time so the
// page still renders offline or before the fetch returns.
var GAMES_FALLBACK={"title":"Games with a job","intro":"Scrimmaging and small-sided games are the core of the program. Every game has a scoring rule that forces the thing being taught, so the kids chase the rule to win and the coach gets the rep. Nothing here needs a screen; it needs a whistle, a scoreboard someone can read, and a coach who calls it honestly.","scoring":{"title":"Godspeed scoring, the house rules","note":"Use these in every scrimmage unless a game below says otherwise. Say them out loud before the first possession and write them on the whiteboard.","rules":[["Box out","1 point. Every defender who puts a body on a man on the shot earns his team a point, whether or not the ball comes to him. Five box outs on one shot is five points. This is the calling card and it pays the most."],["Rebound","1 point on top of the box out, either end."],["Paint touch basket","2 points. A basket that comes after the ball or a driver touched the paint."],["Jump shot without a paint touch","1 point."],["Free throw","1 point, and a missed free throw is minus 1 for the shooter's team."],["Assisted basket","Plus 1 on top of whatever the basket is worth."],["Sprint back","1 point for the team when all five cross half court before the ball on a change of possession. Zero if one player jogs."],["Careless turnover","Behind the back dribble, no look pass, or one hand pass that is lost: minus 1. The play is dead, the ball goes the other way."],["Chasing a steal","Leaving your spot to chase a steal and giving up a basket: minus 2. The whole point of the fall is spots."],["Smallest player","The only one excused from the box out; his job is to be at the nail before the shot lands. If he is, his team gets his point anyway."]],"close":"The scoreboard is the tally of these, not baskets. A team can win a scrimmage without making a shot. That is the point."},"handicaps":{"title":"Handicaps for the older team","intro":"When 5th Black plays the development team, or 6th grade plays 5th Black, the older team plays under a significant handicap. Pick one to start and stack a second when the younger team stops competing.","items":[["Two dribbles","Any third dribble is a turnover. Turns the older team into passers and cutters."],["Assisted only","Older team baskets count only when assisted. Unassisted baskets score zero and the ball goes the other way."],["Weak hand only","Older team may only dribble with the off hand. Any strong hand dribble is a turnover."],["No paint on offense","Older team cannot score in the paint; all their baskets are jump shots worth 1. The younger team gets 2 for every paint touch basket."],["Four on five","Older team plays a man down on defense, five on four the other way. Younger team learns to attack an advantage; older team learns to help and recover."],["Silent","Older team cannot talk on defense. Younger team must talk to earn its sprint back and box out points."],["Ten point head start","Running clock. The younger team starts up 10 in a 6 minute game; the older team must make the box outs to catch up."]],"rule":"The handicap is right when the younger team wins about a third of the time. If they never win, add a handicap. If they always win, remove one."},"ssg":{"title":"Small-sided games by what you are fixing","rule":"Every game is half court unless it says full. Ten possessions or a 4 minute clock, then rotate. Losers do not run laps and do not run seventeens (a seventeen costs five minutes, longer than the game itself); losers of a small-sided game do one round of wall pushes at the nearest wall, twenty seconds on, while the winners shoot. Nobody watches. Seventeens are saved for the timed conditioning block and the closing scrimmage.","sections":[{"key":"handles","name":"Handles and pressure","tag":"Guards","games":[{"name":"1 on 1 full court, push the ball","how":"Offense must cross half court in eight seconds with the defender live, dribbling with the off hand only until half court, then live from there. A strong hand dribble before half court is a turnover.","score":"Crossed half court in time 1, paint touch basket 2, box out on the miss 1, ten second count or turnover minus 1.","look":["Long strides and the ball out in front, not pounded beside the hip","Off hand up and pushing the defender off until half court","Eyes up crossing half court, reading the defender's hips"]},{"name":"2 on 2 press break","how":"Two defenders trap at half court, two on offense have 8 seconds.","score":"Cross half court under pressure 1, turnover minus 1, basket after crossing 2.","look":["The pass beats the trap, never the dribble","The second player shows to the middle before the trap closes","First pass after the trap goes ahead, never back"]},{"name":"Weak hand king of the court","how":"1 on 1 half court, weak hand only for both. Winner stays.","score":"Winner stays. Any strong hand dribble is a turnover.","look":["Off hand dribble is below the knee under pressure","Finishes with the off hand on the off side","Nobody switches hands to bail out"]}]},{"key":"spots","name":"Defense: spots","tag":"Toughness","games":[{"name":"Shell, live after four passes","how":"4 on 4, the offense must make four passes before it can score; the defense must be in the right spot on every pass. Coach checks and calls spot or lost.","score":"Every correct spot on a pass 1, a lost spot minus 1, a stop with all four box outs 4.","look":["Ball, you, man on every pass","Helpers move while the ball is in the air","Four bodies on four men at the shot"]},{"name":"No steal shell","how":"4 on 4 live, but a defender who reaches for a steal and loses his spot costs 2 whether or not he gets the ball. Stops with box outs are the only way to score on defense.","score":"Stop with box outs scores, a reach that loses a spot minus 2.","look":["Hands active, feet in position","Nobody leaves a spot to gamble","Deflections come from position, not reaching"]},{"name":"Help and recover 3 on 3","how":"Offense starts with a live drive from the wing; the low man must help and recover.","score":"Help then recover to a contested shot 2, help with no recover 0, open shot minus 1.","look":["Low man stops the ball early, chest to the driver","Recovers on the kick with a short choppy closeout","The other defender covers two while the help is out"]},{"name":"Closeout wars","how":"2 on 2, offense starts with a skip pass, defender closes out short and choppy, hand up.","score":"Contested shot 1 to the defense, drive past the closeout 2 to the offense, box out 1.","look":["Sprint two thirds, chop the last third","High hand on the shooting side, not two hands up","Body on the shooter after the release"]}]},{"key":"zone131","name":"The 1-3-1","tag":"Toughness","games":[{"name":"1-3-1 slots, pass only","how":"5 on 5 half court, offense may only pass, no dribble. Defense must be in its slot on every pass.","score":"Every deflection 1, every possession where the runner reads the skip correctly 1, a basket given up from a lost slot minus 2.","look":["Sprint to slots, call the second pass out loud","Weak wing on the weak block on every ball side pass","Runner sprints the baseline on the skip"]},{"name":"Corner trap game","how":"Offense tries to enter the corner; the 1-3-1 traps it.","score":"Trap set with both hands up 1, turnover forced 2, offense splits the trap 2 for the offense.","look":["Wing and runner arrive together, knee to knee","Hands high, no reaching, force the lob","Middle fronts the ball side block while the trap is on"]}]},{"key":"zone","name":"Beating a zone","tag":"Passing/Reads","games":[{"name":"4-on-3 Wall","how":"Three defenders play a zone wall; four on offense start with a middle pick and roll. Player 2 starts outside the wall and cuts along the baseline, player 3 short rolls or pops after the screen, the fourth keeps spacing and fills the gap the cutter opens. Coach calls a variable shot clock (4, 8, or 12) before every possession and never tells them the answer.","score":"Paint touch basket 2, kick out three after a paint touch 2, forced shot with no read 0, turnover minus 1. First to five, losers do a round of wall pushes while the winners shoot.","look":["Can the handler find the soft spot","Can the screener choose roll, short roll, or pop","Can the off ball players find gaps and keep spacing","Can all four adapt when the clock changes"]},{"name":"Zone reads on the square, live","how":"Five on five against a coach run zone, paint touch before any shot. Runs right after 4-on-3 Wall on build nights.","score":"Paint touch basket 2, kick out three after a paint touch 2, shot with no paint touch 0.","look":["Feed the high post first against an odd front","Skip on the second reversal","Short corner filled against an even front"]}]},{"key":"post","name":"Post feeds and the four formation","tag":"Bigs","games":[{"name":"Feed the post or no shot","how":"4 on 4, no shot may go up until the ball has been entered to the block once.","score":"Clean entry away from the defender 1, post score 2, kick out three after an entry 2.","look":["Entry pass is away from the defender, bounce or overhead","Post seals early and shows a target hand","Passer relocates after the entry"]},{"name":"Samire rule","how":"5 on 5, if a big is caught standing at the elbow for two seconds the possession ends and the defense gets 1. Bigs must screen or dive.","score":"Screen that frees a driver 1, standing still ends the possession.","look":["Bigs screen or dive, never stand","Screen angle frees the driver's path","Dive after the screen, hands ready"]},{"name":"Look inside first","how":"The guard must look at the post before any drive; the coach calls no look and kills the possession.","score":"Post look before the drive keeps the possession, no look ends it.","look":["Eyes go inside on every catch","Post is sealed and calling for it","Drive comes only after the look"]}]},{"key":"cutting","name":"Cutting series","tag":"Passing/Reads","games":[{"name":"Cut on the drive","how":"3 on 3, when the ball is driven the two off players must cut to the spots for that drive angle.","score":"Correct cut 1 each, basket off a cut 2, standing still minus 1.","look":["Cutters move the moment the drive starts","Baseline drive: weak side drops, top fills","Nobody stands and watches the ball"]},{"name":"Cut or die","how":"4 on 4, a player who stands in one spot for three seconds turns the ball over.","score":"Relocate after the pass 1, basket off relocation 2, three seconds still is a turnover.","look":["Pass and cut, pass and relocate","Cuts have a purpose: basket, backdoor, or fill","Spacing holds after every cut"]}]},{"key":"rebounding","name":"Rebounding","tag":"Toughness","games":[{"name":"War rebounding","how":"3 on 3 in the paint, coach shoots, every defender must hit a body first.","score":"Each box out 1, rebound 1, offensive rebound 3 because it means someone did not box out.","look":["Hit first, then find the ball","Low hips, arms wide, hold the seal","Two hands on the ball, chin it"]},{"name":"Box out or nobody scores","how":"5 on 5 full court, but a basket counts only if the offense also had a body on every defender at the shot the possession before. Reads strange, plays great.","score":"Basket counts only after five box outs on the previous defensive possession.","look":["Five bodies on five men at every shot","Guards box out too, not just bigs","Nobody leaks before the ball is secured"]},{"name":"Smallest man to the nail","how":"5 on 5, any time the smallest player on the floor is at the nail before the shot lands his team gets 2. If he crashes, 0.","score":"At the nail before the shot lands 2, crashing 0.","look":["Smallest player reads the shot and sprints to the nail","He is the first man back on the miss","Teammates trust him and crash"]}]},{"key":"shooting","name":"Shooting out of the concepts","tag":"Guards","games":[{"name":"Drive and kick 3 on 3","how":"A shot counts only if it came off a drive and kick.","score":"Kick out three 2, drive to the rim after the kick is refused 2, jump shot with no drive 0.","look":["Driver gets two feet in the paint before the kick","Shooter is set with hands ready before the pass","Refused kick becomes a drive, not a hold"]},{"name":"Swing to the open man 4 on 4","how":"The ball must be swung side to side once before a shot.","score":"Swing then shot 2, no swing 0, assisted 1 extra.","look":["Ball reverses in two passes, not three","Weak side shooters lift on the swing","Shot comes off the reversal, not a hold"]},{"name":"Post feed and kick","how":"Entry to the block, kick out for the shot.","score":"Entry 1, kick out shot 2, box out on the miss 1.","look":["Post reads the help before the kick","Perimeter players relocate after the entry","Shooter is on balance, feet set"]},{"name":"Free throw ladder","how":"Whole team at the line under fatigue, every miss adds a seventeen to the end of practice for everyone, every make removes one. Ends the night.","score":"Each miss adds a seventeen, each make removes one.","look":["Same routine every shot","Breathe before the release","Nobody talks to the shooter"]}]},{"key":"notfalling","name":"When the shot is not falling","tag":"Culture","games":[{"name":"No jumpers","how":"5 on 5, jump shots are worth 0 for four minutes. The only ways to score are paint touch baskets, free throws, and box outs. Teaches what to do when the shot is off.","score":"Paint touch basket 2, free throw 1, box out 1, jump shot 0.","look":["Ball gets to the paint on every possession","Contact is welcomed at the rim","Box outs pile up when shots stop"]},{"name":"Foul line game","how":"Baskets count 1, a drawn foul counts 2. Kids learn that contact at the rim is a score.","score":"Basket 1, drawn foul 2.","look":["Drivers go through the chest, not around","Finish through contact, expect the whistle","No fading away from the rim"]}]},{"key":"transition","name":"Transition","tag":"Conditioning","games":[{"name":"Sprint back or nothing","how":"5 on 5 full court, a team can only score on offense if all five sprinted back on the previous defensive possession. Coach counts to two; anyone still on the wrong side of half court voids the next score.","score":"Next basket counts only if all five crossed half court before the count of two.","look":["Runner and middle to the paint first","Wings next, point last","Set before the ball crosses half court"]},{"name":"3 on 2 to 2 on 1","how":"Classic, scored Godspeed style.","score":"Advantage taken and scored 2, waited and reset 0, turnover minus 1.","look":["Ball in the middle, wings wide and ahead","Attack the advantage in two passes or fewer","Trail defender sprints to the ball"]}]}]},"night":{"title":"Running a night with this","items":["First 40 minutes: reps with no lines. Four baskets, pairs, everyone working: core handles, finishing, closeouts, shell. Hundreds of touches.","Middle 60 minutes: small-sided games from the sections above that match what you saw in the last game. Two or three games, ten possessions each, rotate teams, read the scores out loud.","Last 15 minutes: five on five full court with the house scoring. Once a week that segment is the play up against the older team under a handicap.","Close: free throw ladder and the conditioning card reminder.","One coach keeps the tally on a clipboard. Read the numbers at the end: box outs, sprint backs, minus points. That is the report card, not the baskets."]},"kids":"Every box out is a point. Every sprint back is a point. Chase steals and you cost us two. The scoreboard counts what we teach, not just what goes in."};
function gmClient(){ try { return window.auth && typeof window.auth.getSupabaseClient === 'function' ? window.auth.getSupabaseClient() : null; } catch (e) { return null; } }
async function loadGames(){
  try {
    var c = gmClient(); if (!c) return;
    var r = await c.from('program_content').select('body').eq('slug','playbook-games').maybeSingle();
    if (r && r.data && r.data.body && r.data.body.ssg) renderGames(r.data.body);
  } catch (e) { console.warn('[playbook] games fetch failed:', e.message); }
}
function renderGames(g){
  var root=document.getElementById('games-list'); if(!root||!g) return;
  var h='<p class="gm-intro">'+esc(g.intro)+'</p>';
  if(g.scoring){
    h+='<div class="sec-title">'+esc(g.scoring.title)+'</div><p class="gm-note" style="margin-top:0">'+esc(g.scoring.note)+'</p><div class="gm-rules">';
    (g.scoring.rules||[]).forEach(function(r){h+='<div class="gm-rule"><b>'+esc(r[0])+'</b><span>'+esc(r[1])+'</span></div>';});
    h+='</div><p class="gm-close">'+esc(g.scoring.close)+'</p>';
  }
  if(g.handicaps){
    h+='<div class="sec-title">'+esc(g.handicaps.title)+'</div><p class="gm-note" style="margin-top:0">'+esc(g.handicaps.intro)+'</p><div class="gm-hc">';
    (g.handicaps.items||[]).forEach(function(r){h+='<div class="gm-hc-row"><div><b>'+esc(r[0])+'.</b>'+esc(r[1])+'</div></div>';});
    h+='</div><p class="gm-note">'+esc(g.handicaps.rule)+'</p>';
  }
  if(g.ssg){
    h+='<div class="sec-title">'+esc(g.ssg.title)+'</div><p class="gm-note" style="margin-top:0">'+esc(g.ssg.rule)+'</p>';
    (g.ssg.sections||[]).forEach(function(sec){
      h+='<div class="sys-block" id="gm-'+esc(sec.key)+'">';
      h+='<div class="sys-head" onclick="document.getElementById(\'gm-'+esc(sec.key)+'\').classList.toggle(\'open\')">'+
         '<div class="sys-ico"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/></svg></div>'+
         '<div><div class="sys-name">'+esc(sec.name)+'</div><div class="sys-maps">'+(sec.games||[]).length+' games</div></div>'+
         '<div class="sys-chev">&rsaquo;</div></div>';
      h+='<div class="sys-body"><div class="sys-content">';
      (sec.games||[]).forEach(function(gm){
        h+='<div class="gm-game"><h5>'+esc(gm.name)+'</h5><p>'+esc(gm.how)+'</p>';
        if(gm.score) h+='<span class="gm-score">Score: '+esc(gm.score)+'</span>';
        if(gm.look&&gm.look.length){h+='<ul class="gm-look">';gm.look.forEach(function(l){h+='<li>'+esc(l)+'</li>';});h+='</ul>';}
        h+='</div>';
      });
      h+='</div></div></div>';
    });
  }
  if(g.night){
    h+='<div class="sec-title">'+esc(g.night.title)+'</div><ul class="gm-night">';
    (g.night.items||[]).forEach(function(t){h+='<li>'+esc(t)+'</li>';});
    h+='</ul>';
  }
  if(g.kids) h+='<div class="gm-kids">'+esc(g.kids)+'</div>';
  root.innerHTML=h;
}
})();
