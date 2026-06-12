(function() {
  'use strict';

  document.addEventListener('DOMContentLoaded', function() {

    /* ── All selectors prefixed with #gs-shared-footer for specificity ── */
    var S = '#gs-shared-footer';

    var style = document.createElement('style');
    style.textContent = [

      /* ── Reset & base ── */
      S + ' { background:#0a0a0a; padding:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; color:#fff; }',
      S + ' *,' + S + ' *::before,' + S + ' *::after { box-sizing:border-box; margin:0; }',
      S + ' a { text-decoration:none; color:inherit; transition:color .2s ease; }',
      S + ' a:hover { color:#fff; }',

      /* ── Container ── */
      S + ' .gsf-inner { max-width:1200px; margin:0 auto; padding:0 2rem; }',

      /* ── Top section ── */
      S + ' .gsf-top { display:grid; grid-template-columns:1fr; gap:3rem; padding:4.5rem 0 3.5rem; border-bottom:1px solid rgba(255,255,255,.08); }',

      /* ── Brand ── */
      S + ' .gsf-brand-mark { font-size:1.125rem; font-weight:900; letter-spacing:.04em; color:#fff; margin-bottom:1.25rem; }',
      S + ' .gsf-brand-mark span { color:#2563eb; }',
      S + ' .gsf-brand-tagline { font-size:.6875rem; font-weight:600; letter-spacing:.14em; text-transform:uppercase; color:rgba(255,255,255,.35); margin-bottom:1.75rem; line-height:1.8; }',
      S + ' .gsf-brand-founder { font-size:.8125rem; font-weight:500; color:rgba(255,255,255,.45); margin-bottom:1.5rem; }',
      S + ' .gsf-brand-founder span { color:rgba(255,255,255,.25); }',
      S + ' .gsf-brand-location { display:flex; align-items:center; gap:.5rem; font-size:.8125rem; color:rgba(255,255,255,.4); }',
      S + ' .gsf-brand-location svg { width:14px; height:14px; flex-shrink:0; stroke:rgba(255,255,255,.4); fill:none; stroke-width:1.5; }',

      /* ── Nav columns ── */
      S + ' .gsf-nav { display:grid; grid-template-columns:repeat(2,1fr); gap:2.5rem 2rem; }',
      S + ' .gsf-col h4 { font-size:.6875rem; font-weight:700; text-transform:uppercase; letter-spacing:.1em; color:rgba(255,255,255,.35); margin-bottom:1.125rem; }',
      S + ' .gsf-col ul { list-style:none; display:flex; flex-direction:column; gap:.75rem; padding:0; }',
      S + ' .gsf-col ul li a { font-size:.875rem; font-weight:500; color:rgba(255,255,255,.6); transition:color .2s ease; }',
      S + ' .gsf-col ul li a:hover { color:#fff; }',

      /* ── Bottom bar ── */
      S + ' .gsf-bottom { padding:1.75rem 0; display:flex; flex-direction:column; align-items:center; gap:1.25rem; }',
      S + ' .gsf-bottom-left { display:flex; flex-direction:column; align-items:center; gap:.75rem; }',
      S + ' .gsf-copyright { font-size:.75rem; color:rgba(255,255,255,.25); font-weight:400; }',
      S + ' .gsf-legal { display:flex; gap:1.25rem; }',
      S + ' .gsf-legal a { font-size:.75rem; color:rgba(255,255,255,.25); font-weight:400; transition:color .2s ease; }',
      S + ' .gsf-legal a:hover { color:rgba(255,255,255,.5); }',

      /* ── Social icons ── */
      S + ' .gsf-social { display:flex; gap:1rem; align-items:center; }',
      S + ' .gsf-social a { display:flex; align-items:center; justify-content:center; width:36px; height:36px; border-radius:50%; background:rgba(255,255,255,.06); transition:background .2s ease; }',
      S + ' .gsf-social a:hover { background:rgba(255,255,255,.12); }',
      S + ' .gsf-social a svg { width:16px; height:16px; fill:rgba(255,255,255,.5); transition:fill .2s ease; }',
      S + ' .gsf-social a:hover svg { fill:#fff; }',

      /* ── Desktop (768px+) ── */
      '@media(min-width:768px){',
      '  ' + S + ' .gsf-top { grid-template-columns:280px 1fr; gap:5rem; }',
      '  ' + S + ' .gsf-nav { grid-template-columns:repeat(4,1fr); gap:1.5rem; }',
      '  ' + S + ' .gsf-bottom { flex-direction:row; justify-content:space-between; align-items:center; }',
      '  ' + S + ' .gsf-bottom-left { flex-direction:row; align-items:center; gap:1.5rem; }',
      '}',
    ].join('\n');
    document.head.appendChild(style);

    // ── SVG icons ──
    var pinSVG = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';

    var instagramSVG = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">'
      + '<rect x="2" y="2" width="20" height="20" rx="5" ry="5" fill="none" stroke="currentColor" stroke-width="1.5"/>'
      + '<circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/>'
      + '<circle cx="17.5" cy="6.5" r="1.2"/>'
      + '</svg>';

    // ── Footer HTML ──
    var footerHTML = ''
      + '<div class="gsf-inner">'

      +   '<div class="gsf-top">'
      +     '<div>'
      +       '<div class="gsf-brand-mark">GODSPEED<span>BASKETBALL</span></div>'
      +       '<p class="gsf-brand-tagline">Brotherhood. Habits. Success.</p>'
      +       '<p class="gsf-brand-founder">Coach Gene <span>Community Leader &amp; Founder</span></p>'
      +       '<div class="gsf-brand-location">'
      +         pinSVG
      +         '<span>Denver, Colorado</span>'
      +       '</div>'
      +     '</div>'

      +     '<div class="gsf-nav">'
      +       '<div class="gsf-col">'
      +         '<h4>Programs</h4>'
      +         '<ul>'
      +           '<li><a href="training.html">Training</a></li>'
      +           '<li><a href="aau.html">AAU Club</a></li>'
      +           '<li><a href="fundraise.html">Fundraise</a></li>'
      +         '</ul>'
      +       '</div>'
      +       '<div class="gsf-col">'
      +         '<h4>Athletes</h4>'
      +         '<ul>'
      +           '<li><a href="skill-audit.html">Skill Assessment</a></li>'
      +           '<li><a href="card-preview.html">Player Card</a></li>'
      +         '</ul>'
      +       '</div>'
      +       '<div class="gsf-col">'
      +         '<h4>Parents</h4>'
      +         '<ul>'
      +           '<li><a href="parent-portal.html">Parent Portal</a></li>'
      +           '<li><a href="about.html">About Us</a></li>'
      +           '<li><a href="contact.html">Contact</a></li>'
      +         '</ul>'
      +       '</div>'
      +       '<div class="gsf-col">'
      +         '<h4>Shop</h4>'
      +         '<ul>'
      +           '<li><a href="store.html?category=all">Apparel</a></li>'
      +           '<li><a href="store.html?category=performance">Footwear</a></li>'
      +           '<li><a href="store.html?category=accessories">Accessories</a></li>'
      +         '</ul>'
      +       '</div>'
      +     '</div>'
      +   '</div>'

      +   '<div class="gsf-bottom">'
      +     '<div class="gsf-bottom-left">'
      +       '<p class="gsf-copyright">&copy; 2026 Godspeed Basketball</p>'
      +       '<div class="gsf-legal">'
      +         '<a href="#">Privacy</a>'
      +         '<a href="#">Terms</a>'
      +       '</div>'
      +     '</div>'
      +     '<div class="gsf-social">'
      +       '<a href="https://www.instagram.com/godspeedbasketball" target="_blank" rel="noopener noreferrer" aria-label="Instagram">'
      +         instagramSVG
      +       '</a>'
      +     '</div>'
      +   '</div>'

      + '</div>';

    var footer = document.createElement('footer');
    footer.id = 'gs-shared-footer';
    footer.setAttribute('role', 'contentinfo');
    footer.innerHTML = footerHTML;

    var existing = document.querySelector('footer, [role="contentinfo"]');
    if (existing) {
      existing.parentNode.replaceChild(footer, existing);
    } else {
      var body = document.body;
      var firstScript = body.querySelector('script');
      if (firstScript) {
        body.insertBefore(footer, firstScript);
      } else {
        body.appendChild(footer);
      }
    }
  });
})();
