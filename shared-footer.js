(function() {
  'use strict';

  document.addEventListener('DOMContentLoaded', function() {
    var footerHTML = ''
      + '<div class="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-12 gap-12">'
      +   '<div class="md:col-span-4">'
      +     '<div class="text-2xl font-black tracking-tighter mb-6">'
      +       'GODSPEED<span class="text-blue-600">BASKETBALL</span>'
      +     '</div>'
      +     '<p class="text-gray-500 leading-relaxed max-w-sm text-sm">'
      +       'Building the future of Denver basketball.<br>'
      +       'Character. Discipline. Excellence.'
      +     '</p>'
      +   '</div>'
      +   '<div class="md:col-span-8 grid grid-cols-2 md:grid-cols-5 gap-8">'
      +     '<div>'
      +       '<h4 class="font-bold text-black uppercase tracking-wide text-xs mb-6">Programs</h4>'
      +       '<ul class="space-y-4 text-sm text-gray-600 font-medium">'
      +         '<li><a href="training.html" class="hover:text-blue-600 transition">Training</a></li>'
      +         '<li><a href="aau.html" class="hover:text-blue-600 transition">AAU Club</a></li>'
      +       '</ul>'
      +     '</div>'
      +     '<div>'
      +       '<h4 class="font-bold text-black uppercase tracking-wide text-xs mb-6">Athletes</h4>'
      +       '<ul class="space-y-4 text-sm text-gray-600 font-medium">'
      +         '<li><a href="skill-audit.html" class="hover:text-blue-600 transition">Skill Assessment</a></li>'
      +         '<li><a href="card-preview.html" class="hover:text-blue-600 transition">Player Card</a></li>'
      +       '</ul>'
      +     '</div>'
      +     '<div>'
      +       '<h4 class="font-bold text-black uppercase tracking-wide text-xs mb-6">Shop</h4>'
      +       '<ul class="space-y-4 text-sm text-gray-600 font-medium">'
      +         '<li><a href="store.html?category=all" class="hover:text-blue-600 transition">Apparel</a></li>'
      +         '<li><a href="store.html?category=performance" class="hover:text-blue-600 transition">Footwear</a></li>'
      +         '<li><a href="store.html?category=accessories" class="hover:text-blue-600 transition">Accessories</a></li>'
      +       '</ul>'
      +     '</div>'
      +     '<div>'
      +       '<h4 class="font-bold text-black uppercase tracking-wide text-xs mb-6">Parents</h4>'
      +       '<ul class="space-y-4 text-sm text-gray-600 font-medium">'
      +         '<li><a href="parent-audit.html" class="hover:text-blue-600 transition">Parent Assessment</a></li>'
      +         '<li><a href="parent-portal.html" class="hover:text-blue-600 transition">Parent Portal</a></li>'
      +       '</ul>'
      +     '</div>'
      +     '<div>'
      +       '<h4 class="font-bold text-black uppercase tracking-wide text-xs mb-6">Company</h4>'
      +       '<ul class="space-y-4 text-sm text-gray-600 font-medium">'
      +         '<li><a href="about.html" class="hover:text-blue-600 transition">About Us</a></li>'
      +         '<li><a href="contact.html" class="hover:text-blue-600 transition">Contact</a></li>'
      +         '<li><a href="coach-portal.html" class="hover:text-blue-600 transition">Coach Portal</a></li>'
      +         '<li><a href="admin-os.html" class="hover:text-blue-600 transition">Director Login</a></li>'
      +       '</ul>'
      +     '</div>'
      +   '</div>'
      + '</div>'
      + '<div class="pt-8 border-t border-gray-200 mt-12">'
      +   '<div class="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">'
      +     '<p class="text-sm text-gray-500">Copyright &copy; 2026 Godspeed Basketball. All rights reserved.</p>'
      +     '<div class="flex flex-wrap gap-6 text-sm text-gray-500">'
      +       '<a href="#" data-placeholder="true" class="hover:text-blue-600 transition">Privacy Policy</a>'
      +       '<a href="#" data-placeholder="true" class="hover:text-blue-600 transition">Terms of Use</a>'
      +     '</div>'
      +   '</div>'
      + '</div>';

    var footer = document.createElement('footer');
    footer.className = 'bg-gray-50 pt-20 pb-16 border-t border-gray-100';
    footer.setAttribute('role', 'contentinfo');
    footer.id = 'gs-shared-footer';
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
