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
                    { text: 'Shop', href: 'store.html' },
                    { text: 'About', href: 'about.html' }
                );
            }
            
            // Build menu HTML
            let menuHTML = '<div class="mobile-menu-links">';
            navLinks.forEach(link => {
                menuHTML += `<a href="${link.href}">${link.text}</a>`;
            });
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
