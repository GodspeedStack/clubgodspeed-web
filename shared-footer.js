(function() {
  'use strict';

  document.addEventListener('DOMContentLoaded', function() {

    // ── Embedded styles (no Tailwind dependency) ──
    var style = document.createElement('style');
    style.textContent = [
      '#gs-shared-footer { background: #f9fafb; border-top: 1px solid #f3f4f6; padding: 5rem 0 4rem; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }',
      '#gs-shared-footer *, #gs-shared-footer *::before, #gs-shared-footer *::after { box-sizing: border-box; margin: 0; padding: 0; }',
      '#gs-shared-footer a { text-decoration: none; color: inherit; transition: color 0.15s ease; }',
      '#gs-shared-footer a:hover { color: #2563eb; }',
      '.gsf-wrap { max-width: 1280px; margin: 0 auto; padding: 0 1.5rem; }',
      '.gsf-top { display: grid; grid-template-columns: 1fr; gap: 3rem; }',
      '.gsf-brand-name { font-size: 1.5rem; font-weight: 900; letter-spacing: -0.03em; color: #111; margin-bottom: 1.5rem; }',
      '.gsf-brand-name span { color: #2563eb; }',
      '.gsf-brand-tagline { color: #6b7280; font-size: 0.875rem; line-height: 1.7; max-width: 20rem; }',
      '.gsf-links { display: grid; grid-template-columns: repeat(2, 1fr); gap: 2rem; }',
      '.gsf-col h4 { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #111; margin-bottom: 1.25rem; }',
      '.gsf-col ul { list-style: none; display: flex; flex-direction: column; gap: 0.875rem; }',
      '.gsf-col ul li a { font-size: 0.875rem; font-weight: 500; color: #6b7280; }',
      '.gsf-bottom { border-top: 1px solid #e5e7eb; margin-top: 3rem; padding-top: 2rem; }',
      '.gsf-bottom-inner { display: flex; flex-direction: column; align-items: center; gap: 1rem; }',
      '.gsf-copyright { font-size: 0.8rem; color: #9ca3af; }',
      '.gsf-legal { display: flex; gap: 1.5rem; }',
      '.gsf-legal a { font-size: 0.8rem; color: #9ca3af; }',
      '@media (min-width: 768px) {',
      '  .gsf-top { grid-template-columns: 1fr 2fr; gap: 4rem; }',
      '  .gsf-links { grid-template-columns: repeat(5, 1fr); gap: 1.5rem; }',
      '  .gsf-bottom-inner { flex-direction: row; justify-content: space-between; align-items: center; }',
      '}'
    ].join('\n');
    document.head.appendChild(style);

    // ── Footer HTML ──
    var footerHTML = ''
      + '<div class="gsf-wrap">'
      +   '<div class="gsf-top">'
      +     '<div>'
      +       '<div class="gsf-brand-name">GODSPEED<span>BASKETBALL</span></div>'
      +       '<p class="gsf-brand-tagline">'
      +         'Building the future of Denver basketball.<br>'
      +         'Character. Discipline. Excellence.'
      +       '</p>'
      +     '</div>'
      +     '<div class="gsf-links">'
      +       '<div class="gsf-col">'
      +         '<h4>Programs</h4>'
      +         '<ul>'
      +           '<li><a href="training.html">Training</a></li>'
      +           '<li><a href="aau.html">AAU Club</a></li>'
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
      +         '<h4>Shop</h4>'
      +         '<ul>'
      +           '<li><a href="store.html?category=all">Apparel</a></li>'
      +           '<li><a href="store.html?category=performance">Footwear</a></li>'
      +           '<li><a href="store.html?category=accessories">Accessories</a></li>'
      +         '</ul>'
      +       '</div>'
      +       '<div class="gsf-col">'
      +         '<h4>Parents</h4>'
      +         '<ul>'
      +           '<li><a href="parent-audit.html">Parent Assessment</a></li>'
      +           '<li><a href="parent-portal.html">Parent Portal</a></li>'
      +         '</ul>'
      +       '</div>'
      +       '<div class="gsf-col">'
      +         '<h4>Company</h4>'
      +         '<ul>'
      +           '<li><a href="about.html">About Us</a></li>'
      +           '<li><a href="contact.html">Contact</a></li>'
      +           '<li><a href="coach-portal.html">Coach Portal</a></li>'
      +           '<li><a href="admin-os.html">Director Login</a></li>'
      +         '</ul>'
      +       '</div>'
      +     '</div>'
      +   '</div>'
      +   '<div class="gsf-bottom">'
      +     '<div class="gsf-wrap gsf-bottom-inner">'
      +       '<p class="gsf-copyright">Copyright &copy; 2026 Godspeed Basketball. All rights reserved.</p>'
      +       '<div class="gsf-legal">'
      +         '<a href="#">Privacy Policy</a>'
      +         '<a href="#">Terms of Use</a>'
      +       '</div>'
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
