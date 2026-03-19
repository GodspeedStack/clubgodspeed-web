import os
import re

html_files = [f for f in os.listdir('.') if f.endswith('.html') and not f.startswith('_')]
html_files = [f for f in html_files if os.path.isfile(f)]

unified_nav_base = """    <nav class="navbar">
        <div class="logo">GODSPEED<span style="color: #2563eb;">BASKETBALL</span></div>
        <div class="nav-desktop-unified">
            <div class="nav-links-unified">
                <a href="index.html"__ACTIVE_HOME__>Home</a>
                <a href="training.html"__ACTIVE_TRAINING__>Training</a>
                <a href="aau.html"__ACTIVE_AAU__>AAU</a>
                <a href="calendar-preview.html"__ACTIVE_CAL__>Calendar</a>
                <div style="position: relative; opacity: 0.5; cursor: not-allowed; display: flex; align-items: center;">
                    <span>Academy</span>
                    <span style="position: absolute; top: -12px; right: -24px; font-size: 9px; background: #f3f4f6; color: #6b7280; padding: 2px 4px; border-radius: 4px; border: 1px solid #e5e7eb;">SOON</span>
                </div>
                <a href="store.html"__ACTIVE_SHOP__>Shop</a>
                <a href="about.html"__ACTIVE_ABOUT__>About</a>
            </div>
            <!-- Right Side Icons -->
            <div class="nav-right-unified">
                <!-- Cart Icon -->
                <a href="#" id="cart-btn" class="nav-cart-btn" aria-label="Cart">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width:24px;height:24px;">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                    </svg>
                    <span class="cart-badge badge-bounce" style="position: absolute; top: -4px; right: -4px; background: #ef4444; color: white; font-size: 10px; font-weight: bold; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; border-radius: 50%;">0</span>
                </a>
                <!-- Member Login Dropdown -->
                <div class="nav-login-wrapper" style="position: relative; z-index: 50;">
                    <a href="#" class="nav-cart-btn" aria-label="Sign In">
                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width:24px;height:24px;">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 4 0 00-7 7h14a7 4 0 00-7-7z" />
                        </svg>
                    </a>
                    <div class="login-dropdown">
                        <div style="padding: 8px 16px 4px; font-size: 11px; text-transform: uppercase; color: #86868b; font-weight: 600; letter-spacing: 0.05em;">Member Access</div>
                        <a href="parent-portal.html" class="login-option">
                            <span style="display: flex; align-items: center; gap: 10px;">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #2563eb;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                                Parents
                            </span>
                            <span class="login-arrow">›</span>
                        </a>
                        <a href="coach-portal.html" class="login-option">
                            <span style="display: flex; align-items: center; gap: 10px;">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #2563eb;"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
                                Coaches
                            </span>
                            <span class="login-arrow">›</span>
                        </a>
                    </div>
                </div>
                <a href="training.html#signup" class="btn-unified-train">TRAIN WITH US</a>
            </div>
        </div>
        <button class="mobile-menu-btn" aria-label="Menu" onclick="openMobileMenu()" style="background:none; border:none; font-size:24px; cursor:pointer;">☰</button>
    </nav>"""

for file in html_files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Check if there is a navbar to replace
    if 'class="navbar' not in content and 'nav-unified.css' not in content:
        continue
        
    mapped_nav = unified_nav_base
    mapped_nav = mapped_nav.replace('__ACTIVE_HOME__', ' style="color: #2563eb;"' if file == 'index.html' else '')
    mapped_nav = mapped_nav.replace('__ACTIVE_TRAINING__', ' style="color: #2563eb;"' if file == 'training.html' else '')
    mapped_nav = mapped_nav.replace('__ACTIVE_AAU__', ' style="color: #2563eb;"' if file == 'aau.html' else '')
    mapped_nav = mapped_nav.replace('__ACTIVE_CAL__', ' style="color: #2563eb;"' if file == 'calendar-preview.html' else '')
    mapped_nav = mapped_nav.replace('__ACTIVE_SHOP__', ' style="color: #2563eb;"' if file == 'store.html' or file == 'shop.html' else '')
    mapped_nav = mapped_nav.replace('__ACTIVE_ABOUT__', ' style="color: #2563eb;"' if file == 'about.html' else '')
    
    # Clean up empty markers
    mapped_nav = mapped_nav.replace('__ACTIVE_HOME__', '').replace('__ACTIVE_TRAINING__', '').replace('__ACTIVE_AAU__', '').replace('__ACTIVE_CAL__', '').replace('__ACTIVE_SHOP__', '').replace('__ACTIVE_ABOUT__', '')

    # Regex to replace existing navbar. 
    # Use robust dotall search
    new_content = re.sub(r'<nav\b[^>]*class="[^"]*navbar[^"]*"[^>]*>.*?</nav>', mapped_nav, content, flags=re.DOTALL)
    
    # Insert CSS link if missing
    if 'nav-unified.css' not in new_content and '</head>' in new_content:
        new_content = new_content.replace('</head>', '    <link rel="stylesheet" href="nav-unified.css">\n</head>')
        
    with open(file, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"Updated {file}")
