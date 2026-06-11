/**
 * Mobile Menu Handler
 * Handles hamburger menu functionality across all pages
 */

(function() {
    'use strict';

    function initMobileMenu() {
        // Find hamburger button
        const hamburgerBtn = document.querySelector('button[aria-label="Menu"], .mobile-menu-btn, button.md\\:hidden');
        
        if (!hamburgerBtn) return;

        // Create mobile menu overlay if it doesn't exist
        let mobileMenu = document.getElementById('mobile-menu-overlay');
        if (!mobileMenu) {
            mobileMenu = document.createElement('div');
            mobileMenu.id = 'mobile-menu-overlay';
            mobileMenu.className = 'mobile-menu-overlay';
            
            // Get navigation links from desktop nav
            const desktopNav = document.querySelector('.navbar .hidden.md\\:flex, .nav-links');
            const navLinks = [];
            
            if (desktopNav) {
                const links = desktopNav.querySelectorAll('a[href]');
                links.forEach(link => {
                    if (link.href && !link.href.includes('#')) {
                        navLinks.push({
                            text: link.textContent.trim(),
                            href: link.getAttribute('href')
                        });
                    }
                });
            }
            
            // Default navigation if not found
            if (navLinks.length === 0) {
                navLinks.push(
                    { text: 'Home', href: 'index.html' },
                    { text: 'Training', href: 'training.html' },
                    { text: 'AAU', href: 'aau.html' },
                    { text: 'Fundraise', href: 'fundraise.html' },
                    { text: 'Shop', href: 'store.html' },
                    { text: 'About', href: 'about.html' }
                );
            }
            
            // Build menu HTML
            let menuHTML = '<div class="mobile-menu-links">';
            navLinks.forEach(link => {
                menuHTML += `<a href="${link.href}">${link.text}</a>`;
            });
            
            // Add Member Access section
            menuHTML += `
            <div style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid rgba(255,255,255,0.1); width: 100%; display: flex; flex-direction: column; align-items: center; gap: 1rem;">
                <span style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(255,255,255,0.5);">Member Access</span>
                <a href="parent-portal.html" style="font-size: 1.25rem; font-weight: 600; text-transform: none; display: flex; align-items: center; gap: 8px;">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #0071e3;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                    Parents
                </a>
                <a href="coach-portal.html" style="font-size: 1.25rem; font-weight: 600; text-transform: none; display: flex; align-items: center; gap: 8px;">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #0071e3;"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
                    Coaches
                </a>
                <a href="parent-portal.html" onclick="setTimeout(() => { if(window.showSignupForm) window.showSignupForm(); }, 300);" style="font-size: 1.25rem; font-weight: 600; text-transform: none; margin-top: 0.5rem; color: #0071e3; display: flex; align-items: center; gap: 8px;">
                    Sign Up
                </a>
            </div>`;

            menuHTML += '<button class="mobile-menu-close" onclick="closeMobileMenu()" aria-label="Close menu">✕</button>';
            menuHTML += '</div>';
            
            mobileMenu.innerHTML = menuHTML;
            document.body.appendChild(mobileMenu);
        }

        // Add click handler to hamburger
        hamburgerBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            openMobileMenu();
        });

        // Close on overlay click
        mobileMenu.addEventListener('click', function(e) {
            if (e.target === mobileMenu) {
                closeMobileMenu();
            }
        });

        // Close on escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && mobileMenu.classList.contains('active')) {
                closeMobileMenu();
            }
        });
    }

    // Global functions
    window.openMobileMenu = function() {
        const menu = document.getElementById('mobile-menu-overlay');
        if (menu) {
            menu.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    };

    window.closeMobileMenu = function() {
        const menu = document.getElementById('mobile-menu-overlay');
        if (menu) {
            menu.classList.remove('active');
            document.body.style.overflow = '';
        }
    };

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMobileMenu);
    } else {
        initMobileMenu();
    }
})();
