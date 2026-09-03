/* =========================================================================
   Godspeed Coach Portal, Playbook add-on
   Adds a "Playbook" tab to coach-portal.html with: Sign Documents (recorded
   to Supabase), Spacing First, System (Square, Fill cut, Beating the press,
   Man to man, Special situations), Coaching IQ, and the Reading List.

   Install: add ONE line before </body> in coach-portal.html:
     <script src="coach-portal-addon.js" defer></script>

   Fully additive. Touches nothing else in the portal. Safe to remove.
   ========================================================================= */
(function () {
  if (window.__gsobLoaded) return;
  window.__gsobLoaded = true;

  /* ---------- config ---------- */
  var SB_URL = 'https://nnqokhqennuxalamnvps.supabase.co';
  /* Publishable key: public by design. RLS blocks all anonymous reads; the only
     anon-callable path is record_coach_signature, which inserts and returns an id. */
  var SB_KEY = 'sb_publishable_T-kU6lCkgtioCub_2_NI0A_rWL27an0';
  var COACH_TEAM = '5th White';

  /* ---------- helpers ---------- */
  function esc(s){return (s==null?'':String(s)).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function todayStr(){return new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});}
  function lsGet(k,f){try{var v=localStorage.getItem(k);return v==null?f:JSON.parse(v);}catch(e){return f;}}
  function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
  function el(id){return document.getElementById(id);}

  /* ---------- scoped styles ---------- */
  var CSS = ''
  + '#gsob-view{--g-accent:#0071E3;--g-text:#1D1D1F;--g-soft:#6E6E73;--g-faint:#A1A1A6;--g-bg:#F5F5F7;--g-card:#FFF;--g-border:#E4E4E8;--g-borderl:#ECECF0;--g-good:#1E9E62;--g-goods:#E7F6EE;--g-accsoft:#EAF3FF;font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",Roboto,sans-serif;color:var(--g-text);}'
  + '#gsob-view *{box-sizing:border-box;}'
  + '#gsob-view .gsob-subnav{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px;}'
  + '#gsob-view .gsob-subnav button{border:1px solid var(--g-border);background:var(--g-card);color:var(--g-soft);font-size:13px;font-weight:600;padding:8px 15px;border-radius:999px;cursor:pointer;}'
  + '#gsob-view .gsob-subnav button.active{background:var(--g-text);color:#fff;border-color:var(--g-text);}'
  + '#gsob-view .gsob-subnav button.locked{opacity:0.5;}'
  + '#gsob-view .gsob-lockhero{background:var(--g-card);border:1px solid var(--g-borderl);border-radius:12px;padding:44px 26px;text-align:center;}'
  + '#gsob-view .gsob-lockhero h3{font-size:17px;font-weight:700;margin:0 0 8px;}'
  + '#gsob-view .gsob-lockhero p{font-size:13.5px;color:var(--g-soft);line-height:1.55;max-width:440px;margin:0 auto 18px;}'
  + '#gsob-view .gsob-lk{width:44px;height:44px;margin:0 auto 14px;border:2.5px solid var(--g-faint);border-radius:8px;border-top:none;position:relative;}'
  + '#gsob-view .gsob-lk:before{content:"";position:absolute;left:50%;top:-17px;transform:translateX(-50%);width:24px;height:22px;border:2.5px solid var(--g-faint);border-bottom:none;border-radius:12px 12px 0 0;}'
  + '#gsob-view .gsob-panel{display:none;}'
  + '#gsob-view .gsob-panel.active{display:block;}'
  + '#gsob-view .gsob-spaceban{background:#0A0A0A;color:#fff;border-radius:12px;padding:16px 20px;display:flex;align-items:center;gap:14px;margin-bottom:16px;}'
  + '#gsob-view .gsob-spaceban .n1{font-size:34px;font-weight:800;color:#FF5722;line-height:1;}'
  + '#gsob-view .gsob-spaceban .st{font-size:14px;font-weight:600;}'
  + '#gsob-view .gsob-spaceban .sd{font-size:12px;color:#c9c9cf;margin-top:2px;line-height:1.4;}'
  + '#gsob-view .gsob-principle{background:var(--g-card);border:1px solid var(--g-borderl);border-left:3px solid var(--g-accent);border-radius:12px;padding:16px 18px;margin-bottom:12px;}'
  + '#gsob-view .gsob-principle h4{font-size:15px;font-weight:700;margin:0 0 5px;}'
  + '#gsob-view .gsob-principle p{font-size:13.5px;color:var(--g-soft);line-height:1.55;margin:0;}'
  + '#gsob-view .gsob-docprog{display:flex;align-items:center;gap:12px;background:var(--g-card);border:1px solid var(--g-borderl);border-radius:12px;padding:14px 18px;margin-bottom:16px;}'
  + '#gsob-view .gsob-docprog .bar{flex:1;height:8px;background:var(--g-borderl);border-radius:99px;overflow:hidden;}'
  + '#gsob-view .gsob-docprog .fill{height:100%;background:var(--g-good);width:0;transition:width .3s;}'
  + '#gsob-view .gsob-docprog .lbl{font-size:13px;font-weight:700;white-space:nowrap;}'
  + '#gsob-view .gsob-card{background:var(--g-card);border:1px solid var(--g-borderl);border-radius:12px;margin-bottom:14px;overflow:hidden;}'
  + '#gsob-view .gsob-dhead{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;cursor:pointer;}'
  + '#gsob-view .gsob-dhead .t{font-size:16px;font-weight:700;}'
  + '#gsob-view .gsob-dhead .s{font-size:12px;color:var(--g-soft);margin-top:2px;}'
  + '#gsob-view .gsob-badge{font-size:11px;font-weight:700;padding:5px 11px;border-radius:999px;white-space:nowrap;}'
  + '#gsob-view .gsob-badge.todo{background:var(--g-accsoft);color:var(--g-accent);}'
  + '#gsob-view .gsob-badge.signed{background:var(--g-goods);color:var(--g-good);}'
  + '#gsob-view .gsob-dbody{display:none;padding:0 20px 20px;border-top:1px solid var(--g-borderl);}'
  + '#gsob-view .gsob-dbody.open{display:block;}'
  + '#gsob-view .gsob-dtext{font-size:13.5px;line-height:1.62;padding-top:16px;}'
  + '#gsob-view .gsob-dtext p{margin:0 0 10px;}#gsob-view .gsob-dtext ul{margin:6px 0 12px 20px;}#gsob-view .gsob-dtext li{margin-bottom:5px;}'
  + '#gsob-view .gsob-signrow{margin-top:14px;padding-top:16px;border-top:1px dashed var(--g-border);}'
  + '#gsob-view .gsob-field{display:flex;flex-direction:column;gap:5px;}'
  + '#gsob-view .gsob-field label{font-size:11px;font-weight:700;color:var(--g-soft);text-transform:uppercase;letter-spacing:.05em;}'
  + '#gsob-view .gsob-field input[type=text]{border:1px solid var(--g-border);border-radius:8px;padding:10px 12px;font-size:14px;min-width:220px;}'
  + '#gsob-view .gsob-field input[type=text]:focus{border-color:var(--g-accent);outline:none;}'
  + '#gsob-view .gsob-consent{display:flex;align-items:flex-start;gap:9px;margin-top:12px;font-size:13px;line-height:1.4;cursor:pointer;}'
  + '#gsob-view .gsob-consent input{margin-top:2px;width:16px;height:16px;accent-color:var(--g-accent);}'
  + '#gsob-view .gsob-btn{border:none;border-radius:999px;padding:11px 20px;font-size:13px;font-weight:700;cursor:pointer;}'
  + '#gsob-view .gsob-btn.primary{background:var(--g-accent);color:#fff;}'
  + '#gsob-view .gsob-btn.primary:disabled{background:var(--g-border);color:var(--g-faint);cursor:not-allowed;}'
  + '#gsob-view .gsob-btn.ghost{background:transparent;color:var(--g-accent);border:1px solid var(--g-accent);}'
  + '#gsob-view .gsob-note{font-size:12.5px;color:var(--g-good);font-weight:600;margin-top:12px;}'
  + '#gsob-view .gsob-legal{font-size:11.5px;color:var(--g-faint);line-height:1.5;margin-top:8px;}'
  + '#gsob-view .gsob-sys{background:var(--g-card);border:1px solid var(--g-borderl);border-radius:12px;margin-bottom:14px;overflow:hidden;}'
  + '#gsob-view .gsob-shead{display:flex;align-items:center;gap:12px;padding:16px 20px;cursor:pointer;}'
  + '#gsob-view .gsob-sico{width:38px;height:38px;border-radius:10px;background:var(--g-accsoft);color:var(--g-accent);display:flex;align-items:center;justify-content:center;flex-shrink:0;}'
  + '#gsob-view .gsob-sico svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;}'
  + '#gsob-view .gsob-sname{font-size:16px;font-weight:700;}#gsob-view .gsob-smaps{font-size:12px;color:var(--g-soft);margin-top:1px;}'
  + '#gsob-view .gsob-chev{margin-left:auto;color:var(--g-faint);font-size:20px;transition:transform .2s;}'
  + '#gsob-view .gsob-sys.open .gsob-chev{transform:rotate(90deg);}'
  + '#gsob-view .gsob-sbody{display:none;padding:0 20px 20px;border-top:1px solid var(--g-borderl);}'
  + '#gsob-view .gsob-sys.open .gsob-sbody{display:block;}'
  + '#gsob-view .gsob-slayout{display:flex;gap:20px;padding-top:16px;flex-wrap:wrap;}'
  + '#gsob-view .gsob-diagram{flex:0 0 240px;max-width:100%;}'
  + '#gsob-view .gsob-diagram svg{width:100%;height:auto;background:var(--g-bg);border-radius:8px;border:1px solid var(--g-borderl);}'
  + '#gsob-view .gsob-scontent{flex:1;min-width:260px;}'
  + '#gsob-view .gsob-ssub{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--g-faint);margin:14px 0 6px;}'
  + '#gsob-view .gsob-ssub.first{margin-top:0;}'
  + '#gsob-view .gsob-sintro{font-size:13.5px;line-height:1.55;}'
  + '#gsob-view .gsob-slist{list-style:none;margin:0;padding:0;}'
  + '#gsob-view .gsob-slist li{font-size:13px;line-height:1.5;color:var(--g-soft);padding:4px 0 4px 16px;position:relative;}'
  + '#gsob-view .gsob-slist li:before{content:"";position:absolute;left:0;top:11px;width:5px;height:5px;border-radius:50%;background:var(--g-accent);}'
  + '#gsob-view .gsob-srow{display:flex;gap:10px;padding:6px 0;border-bottom:1px solid var(--g-borderl);}'
  + '#gsob-view .gsob-srow:last-child{border-bottom:none;}'
  + '#gsob-view .gsob-slbl{flex:0 0 118px;font-size:12.5px;font-weight:700;}#gsob-view .gsob-stxt{flex:1;font-size:12.5px;color:var(--g-soft);line-height:1.45;}'
  + '#gsob-view .gsob-ruletag{display:inline-block;background:#0A0A0A;color:#fff;font-size:12px;font-weight:600;padding:6px 12px;border-radius:8px;margin:4px 6px 0 0;}'
  + '#gsob-view .gsob-cline{fill:none;stroke:#c3c3cb;stroke-width:2;}#gsob-view .gsob-cdot{fill:var(--g-accent);}#gsob-view .gsob-cx{fill:none;stroke:#0A0A0A;stroke-width:3;stroke-linecap:round;}#gsob-view .gsob-cnum{fill:#fff;font-weight:700;}'
  + '#gsob-view .gsob-iqcat{font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--g-accent);margin:18px 2px 8px;}'
  + '#gsob-view .gsob-iq{background:var(--g-card);border:1px solid var(--g-borderl);border-radius:12px;padding:15px 18px;margin-bottom:10px;cursor:pointer;}'
  + '#gsob-view .gsob-iqtop{display:flex;justify-content:space-between;align-items:baseline;gap:10px;}'
  + '#gsob-view .gsob-iqtitle{font-size:15px;font-weight:700;}#gsob-view .gsob-iqsrc{font-size:11px;color:var(--g-faint);white-space:nowrap;}'
  + '#gsob-view .gsob-iqbody{display:none;font-size:13.5px;line-height:1.62;color:var(--g-soft);margin-top:10px;}#gsob-view .gsob-iqbody.open{display:block;}'
  + '#gsob-view .gsob-iqquote{margin-top:10px;padding:10px 14px;background:var(--g-bg);border-left:3px solid var(--g-accent);border-radius:6px;font-style:italic;color:var(--g-text);font-size:13px;}'
  + '#gsob-view .gsob-book{background:var(--g-card);border:1px solid var(--g-borderl);border-radius:12px;padding:14px 18px;margin-bottom:9px;cursor:pointer;}'
  + '#gsob-view .gsob-btop{display:flex;justify-content:space-between;align-items:baseline;gap:10px;}'
  + '#gsob-view .gsob-btitle{font-size:14.5px;font-weight:700;}#gsob-view .gsob-bauthor{font-size:11px;color:var(--g-faint);white-space:nowrap;}'
  + '#gsob-view .gsob-bwhy{display:none;font-size:13px;line-height:1.55;color:var(--g-soft);margin-top:8px;}#gsob-view .gsob-bwhy.open{display:block;}'
  + '#gsob-view .gsob-blinks{display:flex;gap:8px;margin-top:10px;}#gsob-view .gsob-blinks a{font-size:11px;font-weight:700;color:var(--g-accent);text-decoration:none;padding:4px 11px;border:1px solid var(--g-accent);border-radius:6px;}'
  + '#gsob-view .gsob-sectitle{font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--g-faint);margin:6px 2px 12px;}'
  + '@media(max-width:600px){#gsob-view .gsob-diagram{flex:0 0 100%;}}';

  /* ---------- court diagrams ---------- */
  function dot(x,y,n){return '<circle class="gsob-cdot" cx="'+x+'" cy="'+y+'" r="13"/><text class="gsob-cnum" x="'+x+'" y="'+(y+5)+'" text-anchor="middle" font-size="13">'+n+'</text>';}
  function xx(x,y){var s=9;return '<line class="gsob-cx" x1="'+(x-s)+'" y1="'+(y-s)+'" x2="'+(x+s)+'" y2="'+(y+s)+'"/><line class="gsob-cx" x1="'+(x+s)+'" y1="'+(y-s)+'" x2="'+(x-s)+'" y2="'+(y+s)+'"/>';}
  function courtSquare(){return '<svg viewBox="0 0 300 260"><g class="gsob-cline"><rect x="6" y="6" width="288" height="248" rx="6"/><rect x="115" y="150" width="70" height="104"/><line x1="115" y1="150" x2="185" y2="150"/><path d="M120 150 A30 30 0 0 0 180 150"/><line x1="133" y1="243" x2="167" y2="243"/><circle cx="150" cy="236" r="7"/><path d="M40 254 L40 165 A118 118 0 0 1 260 165 L260 254"/></g>'+dot(70,42,'1')+dot(150,42,'2')+dot(230,42,'3')+dot(40,232,'4')+dot(260,232,'5')+'</svg>';}
  function courtPress(){return '<svg viewBox="0 0 200 320"><g class="gsob-cline"><rect x="6" y="6" width="188" height="308" rx="6"/><line x1="6" y1="160" x2="194" y2="160"/><circle cx="100" cy="160" r="20"/><rect x="72" y="270" width="56" height="44"/><line x1="72" y1="270" x2="128" y2="270"/><circle cx="100" cy="303" r="5"/><rect x="72" y="6" width="56" height="44"/><line x1="72" y1="50" x2="128" y2="50"/><circle cx="100" cy="17" r="5"/></g>'+dot(100,300,'1')+dot(45,255,'2')+dot(155,255,'3')+dot(100,205,'4')+dot(100,80,'5')+'</svg>';}
  function courtMan(){return '<svg viewBox="0 0 300 260"><g class="gsob-cline"><rect x="6" y="6" width="288" height="248" rx="6"/><rect x="115" y="150" width="70" height="104"/><line x1="115" y1="150" x2="185" y2="150"/><path d="M120 150 A30 30 0 0 0 180 150"/><line x1="133" y1="243" x2="167" y2="243"/><circle cx="150" cy="236" r="7"/><path d="M40 254 L40 165 A118 118 0 0 1 260 165 L260 254"/></g>'+xx(150,62)+xx(70,140)+xx(230,140)+xx(118,205)+xx(182,205)+'</svg>';}
  function courtSpecial(){return '<svg viewBox="0 0 300 200"><g class="gsob-cline"><rect x="6" y="6" width="288" height="188" rx="6"/><rect x="115" y="6" width="70" height="92"/><line x1="115" y1="98" x2="185" y2="98"/><path d="M120 98 A30 30 0 0 0 180 98"/><line x1="133" y1="14" x2="167" y2="14"/><circle cx="150" cy="22" r="6"/></g>'+dot(214,30,'I')+dot(120,70,'1')+dot(180,70,'2')+dot(120,125,'3')+dot(180,125,'4')+'</svg>';}

  /* ---------- data ---------- */
  var DOCS=[
    {id:'conduct',title:'Coach Code of Conduct',sub:'How we carry ourselves',text:[
      'As a Godspeed coach I represent Brotherhood, Habits, and Success on and off the court. I agree to:',
      'ul:Model respect for every player, parent, official, opponent, and facility, win or lose.',
      'Coach the whole child. I develop character, effort, and habits, not just wins.',
      'Give honest, constructive feedback. Playing time is earned through preparation, effort, and execution, never through politics or favoritism.',
      'Keep a positive, drug-free, alcohol-free, and tobacco-free environment at all team activities.',
      'Never use profanity, humiliation, physical punishment, or any form of abuse as a coaching tool.',
      'Communicate professionally with families and route concerns through the proper channels.',
      'Put player safety first: appropriate activities for age and ability, proper rest and hydration, and immediate care for injuries.',
      '/ul','I understand that failing to uphold this code may result in removal from the coaching staff.']},
    {id:'safety',title:'Confidentiality & Minor Safety',sub:'Protecting our players',text:[
      'Godspeed coaches work with minors. To keep every athlete safe I agree to:',
      'ul:Avoid one-on-one, unobserved situations with a player. Keep interactions observable and interruptible, and use group settings for meetings and messaging.',
      'Never share a private space, ride alone with a player who is not my own child without written parent permission, or contact players on private channels without a parent included.',
      'Treat all player and family information (health, contact, academic, and personal details) as strictly confidential and use it only for coaching purposes.',
      'Report any concern about the safety or wellbeing of a child immediately to the Program Director and, where required by law, to the appropriate authorities.',
      'Complete any required safety training the program assigns.',
      '/ul','I understand that mandatory reporting obligations exist under applicable law and that protecting children always comes before protecting the program or any individual.']},
    {id:'background',title:'Background Check Consent',sub:'Authorization to screen',text:[
      'To coach minors with Godspeed Basketball, I authorize the program to obtain a criminal background check and, where applicable, a sex-offender registry check and driving record.',
      'ul:I authorize Godspeed Basketball and its designated screening provider to request and receive these records for the purpose of evaluating my suitability to work with youth.',
      'I certify that the identifying information I provide for the check is true and accurate.',
      'I understand results are handled confidentially and used only for eligibility decisions.',
      'I understand that certain findings may disqualify me from coaching, and that the program may re-screen periodically.',
      '/ul','Note: this authorization becomes effective when I provide my identifying details directly to the program or its screening provider through a secure channel. Do not enter Social Security numbers or dates of birth on this page.']},
    {id:'volunteer',title:'Volunteer Coach Agreement',sub:'Role and commitment',text:[
      'I am joining the 5th Grade White coaching staff as a volunteer coach. I understand and agree that:',
      'ul:My role is to help run practices, develop players, coach games, and uphold the Godspeed standard, working under the Program Director and head coach.',
      'The expected commitment includes scheduled practice nights, games, and reasonable preparation time. I will communicate conflicts in advance.',
      'Spacing-first player development is our priority for this team. I will teach and reinforce it.',
      'This is a volunteer relationship, not employment. It carries no wage, and either party may end it at any time.',
      'I will follow all program policies, including the Code of Conduct and Minor Safety agreements.',
      '/ul','I am signing on because I believe in building complete players and a real brotherhood.']},
    {id:'nda',title:'Non-Disclosure Agreement',sub:'Protecting program information',text:[
      'In the course of coaching I may access confidential Godspeed information. I agree that:',
      'ul:Confidential information includes rosters and family contacts, player evaluations, medical and payment information, the playbook and development system, business plans, pricing, and any non-public program material.',
      'I will use confidential information only to perform my coaching role and will not share it with anyone outside the program without permission.',
      'I will not use confidential information to compete with Godspeed or to benefit another program.',
      'On leaving the staff, I will return or delete confidential materials in my possession.',
      'Player and family privacy obligations continue indefinitely.',
      '/ul','This protects our players, their families, and the program we are building together.']}
  ];
  var SPACING=[
    ['Space the floor to five spots','Two in the corners, two on the wings or slots, one at the top. Even, wide spacing forces the defense to guard the whole floor and opens driving lanes.'],
    ['One pass, one spot away','Cutters and screeners return to open space. Never let two players stand in the same area. Crowded offense is easy to guard.'],
    ['Fill behind the drive','When a teammate drives, everyone else relocates to keep the floor spaced. The Fill cut (in the System tab) is how we do it.'],
    ['Drive gaps, not bodies','Attack the space between two defenders. Good spacing creates gaps. If there is no gap, the spacing is wrong, fix it first.'],
    ['Spacing beats pressure','Against the press and the trap, spread out so traps have to travel and there is always an open outlet. Never put two players in one trap.'],
    ['Space is a habit, not a play','We coach spacing every drill, every scrimmage, every day. When in doubt at practice, fix the spacing before anything else.']
  ];
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
  var IQ=[
    {cat:'Defense',title:'6 Keys to Defense',source:'Kevin O\'Neill (USC)',body:'1. Transition D, get back before the ball.<br>2. No easy layups, ever.<br>3. No open 3s, contest every shot.<br>4. Contested 2s, make them shoot tough.<br>5. Enjoy contact, be physical, seek it.<br>6. Play as a group on defense, connected, communicating.<br><div class="gsob-iqquote">"If you give up easy baskets you won\'t win."</div>'},
    {cat:'Defense',title:'Defensive Positioning, 3 Places You Can Be',source:'Kevin O\'Neill (USC)',body:'You are either on the ball, on the middle help line, or on the bench. There is no fourth option. Play at the level of the ball. Shoulder to shoulder, close to touch. No middle stance. Be in air space. Physical presence. Front the post. No middle ball in the post.<br><div class="gsob-iqquote">"Want people to feel you on defense."</div>'},
    {cat:'Defense',title:'Help Defense Rule',source:'Kevin O\'Neill (USC)',body:'One guy always on the ball, four always in help. In transition, one man stops the ball, the other four are ready to help. Get the ball to one side of the court to be a functional group. Sprint your big to the nail to stop point guard penetration.<br><div class="gsob-iqquote">"3 on 2, 5 on 4 D must be great or you won\'t win."</div>'},
    {cat:'Defense',title:'Defending the Pick and Roll',source:'Kevin O\'Neill (USC)',body:'Hand on, go to the player, chest up. Two-hand tag with the help guy in the middle. Teaches players to always be in help position. The help defender must be ready before the screen arrives.'},
    {cat:'Defense',title:'Half Court Man to Man Principles',source:'Kevin O\'Neill (USC)',body:'Play at the level of the ball. Man to man, shoulder to shoulder. Close to touch. No middle stance. Be in air space. Physical presence. Make it look crowded. Front post. No middle ball in post. Arm bar, foot free.<br><div class="gsob-iqquote">"It\'s how you play after you get beat that decides how good you\'re going to be."</div>When beat: turn and run to paint.'},
    {cat:'Defense',title:'3 Things to Get on Players For',source:'Kevin O\'Neill (USC)',body:'In this order:<br>1. <strong>Effort</strong>, never negotiable<br>2. <strong>Coverage</strong>, are you in the right spot?<br>3. <strong>Play</strong>, did you make the right read?<br>Effort first, always. You can teach coverage and plays. You cannot teach effort.'},
    {cat:'Defense',title:'3 Aspects of Defense',source:'Kevin O\'Neill (USC)',body:'1. <strong>System</strong>, your base defense that everyone knows.<br>2. <strong>Adjustments</strong>, what you change per opponent.<br>3. <strong>Parachute</strong>, emergency defense when nothing else works.'},
    {cat:'Drills',title:'5 on 4 Scramble Drill',source:'Kevin O\'Neill (USC)',body:'5 on 4 scramble transitions into 5 on 5. Each team plays offense and defense once. Then 5 on 5 Switch and Change: Pull (back to half court), Change (run the other way), Switch (drop the ball, defend someone else). 3-minute games. Doubles as conditioning.'},
    {cat:'Offense',title:'5 Rules of Offense',source:'Bob McKillop (Davidson)',body:'1. <strong>Fight for Space</strong>, use pivots to create space.<br>2. <strong>Catch and See</strong>, opponent, teammates, teammates\' opponents.<br>3. <strong>Help Somebody</strong>, cheer the screener, sacrifice.<br>4. <strong>Finish Your Cut</strong>, top of key, slot, corner, low block, center of paint.<br>5. <strong>Dribble with a Purpose</strong>, attack somebody or help somebody.<br><div class="gsob-iqquote">"When you help somebody you help yourself."</div>'},
    {cat:'Offense',title:'Why We Run 4-Out-1-In Spacing',source:'Billy Donovan (Florida)',body:'Difficult to defend in transition. Forces a true 4-man to defend on the perimeter. Makes it hard to double the post with so much space. No 3s unless there is a post player in the paint to rebound.<br><div class="gsob-iqquote">"Don\'t ignore the numbers. Numbers are facts."</div>'},
    {cat:'Offense',title:'5 Ways to Get a 3-Point Shot',source:'Billy Donovan (Florida)',body:'1. Fast break.<br>2. Catch and shoot off dribble penetration.<br>3. Post catch, double team, kick.<br>4. Shots out of offense, screens and PnR.<br>5. Offensive rebound, clear to the 3pt line every time.'},
    {cat:'Offense',title:'Davidson Offensive Philosophy',source:'Bob McKillop (Davidson)',body:'Always make yourself better. Be a great copier. Keep it simple. Establish a system you believe in. Offense based on rhythm and flow. Run with discipline.<br><div class="gsob-iqquote">"The ball is like a spotlight, the longer you hold it, the hotter it gets."</div>'},
    {cat:'Shooting',title:'Shooting Practice Standards',source:'Billy Donovan (Florida)',body:'Chart everything. How many shots does your best player get in a 2-hour practice? Always do 20-30 minutes of individual work. Passers lead shooters, pass into the inside shoulder. Players must know how to shoot when tired.'},
    {cat:'Shooting',title:'Olympic Shooting Drill',source:'Billy Donovan (Florida)',body:'Loop and follow format. Time the weave so you run into the 3pt line. 3 minutes on the clock. 3pt = 3, 2pt = 2, layup = 1. Start at 120 points, go up 2 each time.'},
    {cat:'Post Play',title:'What Makes a Great Post Player',source:'Kevin Sutton (Montverde)',body:'Runs rim to rim. Legally physical. On balance. Good feet. Relentless rebounder. Good hands. Defends the position and controls the paint. Makes free throws. Vocal. Does not miss layups.<br><div class="gsob-iqquote">"When players hold each other accountable you have something special."</div>'},
    {cat:'Post Play',title:'Reading the Defender in the Post',source:'Kevin Sutton (Montverde)',body:'Feel a hand or forearm to know which way to go. <strong>Forearm</strong> = power game (drop step, go through them). <strong>Hand</strong> = face-up game (they are playing light, attack). Pivot even to even. Feet shoulder width. Look middle, doubles come from the high side.'},
    {cat:'Post Play',title:'Paint Ownership System',source:'Kevin Sutton (Montverde)',body:'<strong>Paint = Own. Outside the paint = Rent. 3-Point Line = Homeless.</strong> Do not miss layups. Always use the backboard.'},
    {cat:'IQ / Philosophy',title:'7 Fundamental Keys',source:'Bob McKillop (Davidson)',body:'1. See, games are like darting taxis. 2. Talk. 3. Have an Act, fake a cut. 4. Down and Balanced, be powerful. 5. Details, do the little things. 6. Flesh to Flesh Contact, take a charge. 7. Finish Everything, last play is the strongest.<br><div class="gsob-iqquote">"Coaching is not plays, it\'s playing."</div>'},
    {cat:'IQ / Philosophy',title:'4 Daily Objectives',source:'Bob McKillop (Davidson)',body:'Every meeting, practice, and game day: 1. Get Better. 2. Have Fun. 3. Make Every Play Count. 4. Play to Win.<br><div class="gsob-iqquote">"Players can never be afraid to lose or make a mistake."</div>'},
    {cat:'IQ / Philosophy',title:'Communication in Basketball',source:'Kevin Sutton (Montverde)',body:'1. Information given, you said it. 2. Information received, they heard it. 3. Information understood, they acted on it. Most teams stop at level 1. Elite teams operate at level 3.'},
    {cat:'Culture',title:'Culture Rules',source:'Kevin O\'Neill (USC)',body:'Always say "we." No out of bounds, no fouls in practice, it makes you play harder. Coaches stick up for other coaches. Respect the game. Develop your assistants. If someone is hurting the program, remove them.<br><div class="gsob-iqquote">"The players on your team are the most important part of the job."</div>'},
    {cat:'Culture',title:'The Penny Jar',source:'Bob McKillop (Davidson)',body:'Give a penny for every good thing and place it in a jar. The team visually watches their accomplishments grow across the season. Simple, visual, powerful. Find team building outside basketball too.'}
  ];
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

  /* ---------- signatures ---------- */
  function getEmail(){var e=el('gsob-email');return e?e.value.trim():(lsGet('gsob-email','')||'');}
  function saveEmail(){var e=el('gsob-email');if(e)lsSet('gsob-email',e.value.trim());}
  function postSignature(rec){
    return fetch(SB_URL+'/rest/v1/rpc/record_coach_signature',{
      method:'POST',
      headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({p_coach_name:rec.name,p_document_id:rec.id,p_document_title:rec.title,p_signature:rec.name,p_team:COACH_TEAM,p_coach_email:rec.email||null,p_user_agent:(navigator&&navigator.userAgent)||''})
    }).then(function(r){if(!r.ok)throw new Error('server '+r.status);return r.json();});
  }
  function docTextHtml(arr){var h='',inList=false;arr.forEach(function(line){if(line==='/ul'){if(inList){h+='</ul>';inList=false;}return;}if(line.indexOf('ul:')===0){if(!inList){h+='<ul>';inList=true;}h+='<li>'+esc(line.slice(3))+'</li>';return;}if(inList){h+='</ul>';inList=false;}h+='<p>'+esc(line)+'</p>';});if(inList)h+='</ul>';return h;}
  window.gsobToggleDoc=function(id){var b=el('gsob-body-'+id);if(b)b.classList.toggle('open');};
  window.gsobCheck=function(id){var n=el('gsob-name-'+id),a=el('gsob-agree-'+id),b=el('gsob-btn-'+id);if(n&&a&&b)b.disabled=!(n.value.trim().length>=2&&a.checked);};
  window.gsobSign=function(id){
    var nEl=el('gsob-name-'+id);if(!nEl)return;var n=nEl.value.trim();if(n.length<2)return;
    var doc=DOCS.filter(function(d){return d.id===id;})[0]||{title:id};var email=getEmail();
    var btn=el('gsob-btn-'+id);if(btn){btn.disabled=true;btn.textContent='Recording...';}
    var base={name:n,email:email,date:todayStr(),ts:new Date().toISOString(),synced:false,serverId:null};
    function persist(){var s=lsGet('gsob-signatures',{});s[id]=base;lsSet('gsob-signatures',s);renderDocs();var bb=el('gsob-body-'+id);if(bb)bb.classList.add('open');}
    postSignature({id:id,title:doc.title,name:n,email:email}).then(function(newId){base.synced=true;base.serverId=newId;persist();}).catch(function(){base.synced=false;persist();});
  };
  window.gsobSyncOne=function(id){
    var s=lsGet('gsob-signatures',{}),r=s[id];if(!r)return;var doc=DOCS.filter(function(d){return d.id===id;})[0]||{title:id};
    postSignature({id:id,title:doc.title,name:r.name,email:r.email}).then(function(newId){r.synced=true;r.serverId=newId;s[id]=r;lsSet('gsob-signatures',s);renderDocs();}).catch(function(){});
  };
  window.gsobDownloadRecord=function(){
    var signed=lsGet('gsob-signatures',{});
    var rows=DOCS.map(function(d){var s=signed[d.id];return '<tr><td>'+esc(d.title)+'</td><td>'+(s?esc(s.name):'not signed')+'</td><td>'+(s?esc(s.date):'')+'</td></tr>';}).join('');
    var html='<!DOCTYPE html><html><head><meta charset="utf-8"><title>Godspeed Coach Signature Record</title><style>body{font-family:-apple-system,Arial,sans-serif;color:#1d1d1f;max-width:640px;margin:40px auto;padding:0 20px;}h1{font-size:20px;}table{border-collapse:collapse;width:100%;font-size:14px;margin-top:16px;}td,th{text-align:left;padding:8px 12px;border-bottom:1px solid #eee;}th{color:#666;font-size:12px;text-transform:uppercase;}.tag{color:#999;font-size:11px;letter-spacing:.16em;margin-top:24px;}</style></head><body><h1>Godspeed Basketball, Coach Signature Record</h1><p>Team: 5th Grade White. Generated '+esc(todayStr())+'.</p><table><thead><tr><th>Document</th><th>Signed by</th><th>Date</th></tr></thead><tbody>'+rows+'</tbody></table><p class="tag">BROTHERHOOD. HABITS. SUCCESS.</p></body></html>';
    var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([html],{type:'text/html'}));a.download='Godspeed_Coach_Signature_Record.html';a.click();
  };

  /* ---------- renderers ---------- */
  function renderDocs(){
    var host=el('gsob-doc-list');if(!host)return;var signed=lsGet('gsob-signatures',{});var count=0;var h='';
    DOCS.forEach(function(d){
      var s=signed[d.id];if(s)count++;
      var badge=s?'<span class="gsob-badge signed">Signed</span>':'<span class="gsob-badge todo">To sign</span>';
      h+='<div class="gsob-card"><div class="gsob-dhead" onclick="gsobToggleDoc(\''+d.id+'\')"><div><div class="t">'+esc(d.title)+'</div><div class="s">'+esc(d.sub)+'</div></div>'+badge+'</div>';
      h+='<div class="gsob-dbody" id="gsob-body-'+d.id+'"><div class="gsob-dtext">'+docTextHtml(d.text)+'</div>';
      if(s){
        if(s.synced){h+='<div class="gsob-note">Signed by '+esc(s.name)+' on '+esc(s.date)+'. Recorded to Godspeed.</div>';}
        else{h+='<div class="gsob-note" style="color:var(--g-soft);">Signed by '+esc(s.name)+' on '+esc(s.date)+'. Saved on this device, not yet recorded. <button class="gsob-btn ghost" style="padding:5px 12px;font-size:12px;margin-left:6px;" onclick="gsobSyncOne(\''+d.id+'\')">Record now</button></div>';}
      } else {
        h+='<div class="gsob-signrow"><div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;">'
          +'<div class="gsob-field"><label>Type your full name to sign</label><input type="text" id="gsob-name-'+d.id+'" placeholder="Full legal name" oninput="gsobCheck(\''+d.id+'\')"></div>'
          +'<div class="gsob-field"><label>Date</label><input type="text" value="'+esc(todayStr())+'" readonly style="min-width:150px;background:var(--g-bg);color:var(--g-soft);"></div></div>'
          +'<label class="gsob-consent"><input type="checkbox" id="gsob-agree-'+d.id+'" onchange="gsobCheck(\''+d.id+'\')"><span>I have read this document and I agree to it. Typing my name is my electronic signature.</span></label>'
          +'<div style="margin-top:14px;"><button class="gsob-btn primary" id="gsob-btn-'+d.id+'" disabled onclick="gsobSign(\''+d.id+'\')">Sign this document</button></div></div>';
      }
      h+='</div></div>';
    });
    host.innerHTML=h;
    var c=el('gsob-doc-count');if(c)c.textContent=count+' of '+DOCS.length+' signed';
    var f=el('gsob-doc-fill');if(f)f.style.width=Math.round(count/DOCS.length*100)+'%';
    var rb=el('gsob-btn-record');if(rb)rb.style.display=count>0?'':'none';
    gsobUpdateLock();
  }
  function renderSpacing(){var h='<div class="gsob-spaceban"><div class="n1">1</div><div><div class="st">Why spacing is number one</div><div class="sd">Everything we run depends on the floor being spaced. Cuts, drives, and the Square offense only work with room to operate. Teach spacing first and the rest follows.</div></div></div>';SPACING.forEach(function(p){h+='<div class="gsob-principle"><h4>'+esc(p[0])+'</h4><p>'+esc(p[1])+'</p></div>';});return h;}
  function renderSystem(){
    var h='<div class="gsob-spaceban"><div class="n1">1</div><div><div class="st">Every piece below assumes good spacing.</div><div class="sd">The Square, the Fill cut, the press break, they all break down without it. Spacing is the thread through the whole system.</div></div></div>';
    SYS.forEach(function(s){
      h+='<div class="gsob-sys" id="gsob-sys-'+s.key+'"><div class="gsob-shead" onclick="document.getElementById(\'gsob-sys-'+s.key+'\').classList.toggle(\'open\')"><div class="gsob-sico"><svg viewBox="0 0 24 24">'+s.ico+'</svg></div><div><div class="gsob-sname">'+esc(s.name)+'</div><div class="gsob-smaps">'+esc(s.maps)+'</div></div><div class="gsob-chev">&rsaquo;</div></div>';
      h+='<div class="gsob-sbody"><div class="gsob-slayout">';
      if(s.svg){h+='<div class="gsob-diagram">'+s.svg()+'</div>';}
      h+='<div class="gsob-scontent"><div class="gsob-sintro">'+esc(s.intro)+'</div><div class="gsob-ssub first">Principles</div><ul class="gsob-slist">';
      s.principles.forEach(function(p){h+='<li>'+esc(p)+'</li>';});
      h+='</ul><div class="gsob-ssub">Setup</div>';
      s.setup.forEach(function(r){h+='<div class="gsob-srow"><div class="gsob-slbl">'+esc(r[0])+'</div><div class="gsob-stxt">'+esc(r[1])+'</div></div>';});
      h+='<div class="gsob-ssub">Rules</div><div>';
      s.rules.forEach(function(r){h+='<span class="gsob-ruletag">'+esc(r)+'</span>';});
      h+='</div></div></div></div></div>';
    });
    return h;
  }
  var iqFilter='All';
  function renderIQ(){
    var host=el('gsob-iq-list'),fhost=el('gsob-iq-filter');if(!host)return;
    var cats=['All'].concat(IQ.map(function(c){return c.cat;}).filter(function(v,i,a){return a.indexOf(v)===i;}));
    if(fhost){var fh='';cats.forEach(function(c){fh+='<button class="gsob-btn ghost'+(c===iqFilter?' active':'')+'" style="padding:7px 13px;font-size:12px;'+(c===iqFilter?'background:var(--g-accent);color:#fff;':'')+'" onclick="gsobSetIQ(\''+c.replace(/'/g,"\\'")+'\')">'+esc(c)+'</button>';});fhost.innerHTML=fh;}
    var items=IQ.filter(function(c){return iqFilter==='All'||c.cat===iqFilter;});
    var byCat={},order=[];items.forEach(function(c){if(!byCat[c.cat]){byCat[c.cat]=[];order.push(c.cat);}byCat[c.cat].push(c);});
    var h='';order.forEach(function(cat){h+='<div class="gsob-iqcat">'+esc(cat)+'</div>';byCat[cat].forEach(function(c){h+='<div class="gsob-iq" onclick="this.querySelector(\'.gsob-iqbody\').classList.toggle(\'open\')"><div class="gsob-iqtop"><span class="gsob-iqtitle">'+esc(c.title)+'</span><span class="gsob-iqsrc">'+esc(c.source)+'</span></div><div class="gsob-iqbody">'+c.body+'</div></div>';});});
    host.innerHTML=h;
  }
  window.gsobSetIQ=function(c){iqFilter=c;renderIQ();};
  function renderReading(){
    var host=el('gsob-reading-list');if(!host)return;var h='';
    BOOKS.forEach(function(cat){h+='<div class="gsob-iqcat">'+esc(cat.cat)+'</div>';cat.items.forEach(function(b){var links='';if(b.scribd)links+='<a href="'+esc(b.scribd)+'" target="_blank" rel="noopener" onclick="event.stopPropagation()">Scribd</a>';if(b.audible)links+='<a href="'+esc(b.audible)+'" target="_blank" rel="noopener" onclick="event.stopPropagation()">Audible</a>';h+='<div class="gsob-book" onclick="this.querySelector(\'.gsob-bwhy\').classList.toggle(\'open\')"><div class="gsob-btop"><span class="gsob-btitle">'+esc(b.title)+'</span><span class="gsob-bauthor">'+esc(b.author)+'</span></div><div class="gsob-bwhy">'+esc(b.why)+(links?'<div class="gsob-blinks">'+links+'</div>':'')+'</div></div>';});});
    host.innerHTML=h;
  }

  /* ---------- view scaffold ---------- */
  function panelHtml(){
    return ''
    + '<div class="gsob-spaceban"><div class="n1">1</div><div><div class="st">Spacing is our number one thing on 5th White.</div><div class="sd">Good spacing makes everything else work: cuts open up, drives have room, and defenses have to guard the whole floor. Fix the spacing first.</div></div></div>'
    + '<div class="gsob-subnav" id="gsob-subnav">'
    +   '<button class="active" data-p="sign">Sign Documents</button>'
    +   '<button data-p="spacing">Spacing First</button>'
    +   '<button data-p="system">System</button>'
    +   '<button data-p="iq">Coaching IQ</button>'
    +   '<button data-p="reading">Reading List</button>'
    + '</div>'
    + '<div class="gsob-panel active" id="gsob-p-sign">'
    +   '<div class="gsob-card"><div style="padding:16px 20px;"><div class="gsob-field" style="gap:6px;"><label>Your email (optional, ties your signatures to your record)</label><input type="text" id="gsob-email" placeholder="you@example.com" style="max-width:340px;" oninput="gsobSaveEmail()"></div></div></div>'
    +   '<div class="gsob-docprog"><div class="lbl" id="gsob-doc-count">0 of 5 signed</div><div class="bar"><div class="fill" id="gsob-doc-fill"></div></div><button class="gsob-btn ghost" id="gsob-btn-record" onclick="gsobDownloadRecord()" style="display:none;">Download record</button></div>'
    +   '<div id="gsob-doc-list"></div>'
    +   '<p class="gsob-legal">These are Godspeed program agreements, not legal advice. Have counsel review the Background Check Consent and NDA before treating them as binding. Signatures are recorded to the Godspeed coach records system.</p>'
    + '</div>'
    + '<div class="gsob-panel" id="gsob-p-spacing"></div>'
    + '<div class="gsob-panel" id="gsob-p-system"></div>'
    + '<div class="gsob-panel" id="gsob-p-iq"><div class="gsob-iqcat" style="color:var(--g-faint);">Filter</div><div class="gsob-subnav" id="gsob-iq-filter" style="margin-bottom:14px;"></div><div id="gsob-iq-list"></div></div>'
    + '<div class="gsob-panel" id="gsob-p-reading"><div id="gsob-reading-list"></div></div>'
    + '<div class="gsob-panel" id="gsob-p-locked"><div class="gsob-lockhero"><div class="gsob-lk"></div><h3>Playbook locked</h3><p id="gsob-locked-msg">Sign all documents to unlock the playbook, spacing, system, and reading list.</p><button class="gsob-btn primary" onclick="gsobGoSign()">Go to Documents</button></div></div>';
  }
  function gsobAllSigned(){var s=lsGet('gsob-signatures',{});return DOCS.every(function(d){return s[d.id];});}
  function gsobSignedCount(){var s=lsGet('gsob-signatures',{});return DOCS.filter(function(d){return s[d.id];}).length;}
  function gsobUpdateLock(){
    var locked=!gsobAllSigned();
    document.querySelectorAll('#gsob-subnav button').forEach(function(b){var p=b.getAttribute('data-p');if(['spacing','system','iq','reading'].indexOf(p)>=0)b.classList.toggle('locked',locked);});
    var lm=el('gsob-locked-msg');if(lm)lm.textContent='Sign all '+DOCS.length+' documents to unlock the playbook, spacing, system, and reading list. '+gsobSignedCount()+' of '+DOCS.length+' done.';
  }
  window.gsobGoSign=function(){var b=document.querySelector('#gsob-subnav [data-p=sign]');if(b)window.gsobSubTab('sign',b);};
  window.gsobSaveEmail=saveEmail;
  window.gsobSubTab=function(p,btn){
    document.querySelectorAll('#gsob-subnav button').forEach(function(b){b.classList.toggle('active',b===btn);});
    var locked=(['spacing','system','iq','reading'].indexOf(p)>=0 && !gsobAllSigned());
    document.querySelectorAll('#gsob-view .gsob-panel').forEach(function(x){x.classList.remove('active');});
    var target=el(locked?'gsob-p-locked':'gsob-p-'+p); if(target)target.classList.add('active');
    if(locked) gsobUpdateLock();
  };

  /* ---------- portal integration ---------- */
  var built=false, myBtn=null, myView=null;
  function showGsob(){
    // hide sibling portal views, show ours
    var parent=myView.parentNode;
    Array.prototype.forEach.call(parent.querySelectorAll('[id$="-view"]'),function(v){ if(v!==myView) v.style.display='none'; });
    myView.style.display='block';
    document.querySelectorAll('#view-tabs .segment-btn').forEach(function(b){b.classList.remove('active');});
    myBtn.classList.add('active');
  }
  function hideGsob(){ if(myView) myView.style.display='none'; if(myBtn) myBtn.classList.remove('active'); }

  function build(){
    if(built) return true;
    var tabs=el('view-tabs');
    var anchor=el('roster-view');
    if(!tabs || !anchor) return false; // portal dashboard not present yet (e.g. before login)

    // styles
    var st=document.createElement('style'); st.id='gsob-style'; st.textContent=CSS; document.head.appendChild(st);

    // tab button (native look)
    myBtn=document.createElement('button');
    myBtn.className='segment-btn'; myBtn.id='btn-view-gsob'; myBtn.textContent='Playbook';
    myBtn.addEventListener('click',showGsob);
    tabs.appendChild(myBtn);
    // widen the segmented grid to fit the extra tab
    try{ var cols=(tabs.querySelectorAll('.segment-btn')||[]).length; tabs.style.gridTemplateColumns='repeat('+cols+',1fr)'; tabs.style.maxWidth='980px'; }catch(e){}

    // view panel, sibling of roster-view
    myView=document.createElement('div'); myView.id='gsob-view'; myView.style.display='none';
    myView.innerHTML=panelHtml();
    anchor.parentNode.appendChild(myView);

    // when any other portal tab is clicked, hide ours
    tabs.addEventListener('click',function(e){ var b=e.target.closest('.segment-btn'); if(b && b!==myBtn) hideGsob(); });

    // sub-tab wiring
    var sub=el('gsob-subnav');
    if(sub){ sub.addEventListener('click',function(e){ var b=e.target.closest('button'); if(b) window.gsobSubTab(b.getAttribute('data-p'),b); }); }

    // fill panels
    el('gsob-p-spacing').innerHTML=renderSpacing();
    el('gsob-p-system').innerHTML=renderSystem();
    renderDocs(); renderIQ(); renderReading();
    var em=el('gsob-email'); if(em) em.value=lsGet('gsob-email','')||'';

    built=true;
    return true;
  }

  // The dashboard appears only after the coach logs in, so poll until it exists.
  function boot(){
    if(build()) return;
    var tries=0;
    var iv=setInterval(function(){ if(build() || ++tries>120) clearInterval(iv); }, 500);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();
