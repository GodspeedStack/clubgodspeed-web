/**
 * MobileBottomNav - Modern Bottom Tab Bar for Mobile
 * 
 * Features:
 * - Fixed bottom position on mobile only
 * - 5 core navigation icons (Home, Store, Schedule, Messages, Profile)
 * - Active state with solid white icons
 * - Hidden on tablet/desktop (≥768px)
 * - Auth-aware (hides Calendar if not logged in)
 * - Godspeed black aesthetic
 */

// Check if user is authenticated
function checkUserAuth() {
    // Check localStorage for auth token
    const authToken = localStorage.getItem('authToken');
    if (authToken) return true;

    // Check sessionStorage
    const sessionAuth = sessionStorage.getItem('userAuthenticated');
    if (sessionAuth === 'true') return true;

    // Check for Supabase session
    const supabaseSession = localStorage.getItem('supabase.auth.token');
    if (supabaseSession) return true;

    // Default: not authenticated
    return false;
}

// Get current page to determine active tab
function getCurrentPage() {
    const path = window.location.pathname;
    if (path.includes('index.html') || path === '/') return 'home';
    if (path.includes('store') || path.includes('shop')) return 'store';
    if (path.includes('calendar')) return 'schedule';
    if (path.includes('parent-portal') || path.includes('inbox') || path.includes('messages')) return 'messages';
    if (path.includes('about') || path.includes('profile')) return 'profile';
    return 'home';
}

function MobileBottomNav() {
    const currentPage = getCurrentPage();
    const isAuthenticated = checkUserAuth();

    const navItems = [
        {
            id: 'home',
            label: 'Home',
            href: 'index.html',
            icon: {
                outline: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
                solid: 'M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z'
            }
        },
        {
            id: 'store',
            label: 'Store',
            href: 'store.html',
            icon: {
                outline: 'M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z',
                solid: 'M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1H14a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3zM16 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM6.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z'
            }
        },
        {
            id: 'schedule',
            label: 'Schedule',
            href: 'calendar-preview.html',
            requiresAuth: true, // Hide if not authenticated
            icon: {
                outline: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
                solid: 'M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z'
            }
        },
        {
            id: 'messages',
            label: 'Messages',
            href: 'parent-portal.html',
            icon: {
                outline: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
                solid: 'M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z'
            }
        },
        {
            id: 'profile',
            label: 'Profile',
            href: 'about.html',
            icon: {
                outline: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
                solid: 'M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z'
            }
        }
    ];

    // Filter out auth-required items if not authenticated
    const visibleItems = navItems.filter(item => {
        if (item.requiresAuth && !isAuthenticated) {
            return false;
        }
        return true;
    });

    const html = `
        <nav class="mobile-bottom-nav" style="
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            width: 100%;
            background: #000000;
            border-top: 1px solid #1c1c1e;
            z-index: 50;
            display: flex;
            justify-content: space-around;
            align-items: center;
            padding: 8px 0 calc(8px + env(safe-area-inset-bottom));
            height: calc(60px + env(safe-area-inset-bottom));
            box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.3);
        ">
            ${visibleItems.map(item => {
        const isActive = currentPage === item.id;
        const iconPath = isActive ? item.icon.solid : item.icon.outline;
        const color = isActive ? '#FFFFFF' : '#666666';
        const fill = isActive ? 'currentColor' : 'none';

        return `
                    <a href="${item.href}" 
                       class="bottom-nav-item"
                       style="
                           display: flex;
                           flex-direction: column;
                           align-items: center;
                           justify-content: center;
                           gap: 4px;
                           flex: 1;
                           padding: 8px;
                           text-decoration: none;
                           color: ${color};
                           transition: all 0.2s ease;
                           -webkit-tap-highlight-color: transparent;
                       "
                       ontouchstart="this.style.transform='scale(0.95)'"
                       ontouchend="this.style.transform='scale(1)'">
                        <svg 
                            width="24" 
                            height="24" 
                            viewBox="0 0 24 24" 
                            fill="${fill}"
                            stroke="currentColor" 
                            stroke-width="${isActive ? '0' : '2'}"
                            stroke-linecap="round" 
                            stroke-linejoin="round"
                            style="transition: all 0.2s ease;">
                            <path d="${iconPath}"></path>
                        </svg>
                        <span style="
                            font-size: 10px;
                            font-weight: ${isActive ? '700' : '500'};
                            text-transform: uppercase;
                            letter-spacing: 0.05em;
                            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                        ">${item.label}</span>
                    </a>
                `;
    }).join('')}
        </nav>

        <style>
            /* Hide bottom nav on tablet and desktop */
            @media (min-width: 768px) {
                .mobile-bottom-nav {
                    display: none !important;
                }
            }

            /* Add padding to body on mobile to prevent content being hidden */
            @media (max-width: 767px) {
                body {
                    padding-bottom: calc(70px + env(safe-area-inset-bottom)) !important;
                }
            }

            /* Hover effect for desktop (if somehow visible) */
            .bottom-nav-item:hover {
                opacity: 0.8;
            }

            /* Active state animation */
            .bottom-nav-item svg {
                transform-origin: center;
            }
        </style>
    `;

    return html;
}

// Auto-inject bottom nav on page load
document.addEventListener('DOMContentLoaded', () => {
    // Only inject if not already present
    if (!document.querySelector('.mobile-bottom-nav')) {
        const bottomNav = document.createElement('div');
        bottomNav.innerHTML = MobileBottomNav();
        document.body.appendChild(bottomNav.firstElementChild);
    }
});

// Export for manual use if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MobileBottomNav, checkUserAuth };
}
