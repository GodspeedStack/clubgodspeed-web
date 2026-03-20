/**
 * Godspeed Quote Design System
 * Beautiful, personalized quotes that appear on scroll (web only)
 * Mobile: Reduced size, never over photos
 */

(function() {
    'use strict';

    // ============================================
    // User Profile Detection & Quote Selection
    // ============================================
    
    const UserProfiles = {
        COACH: {
            role: 'coach',
            needs: ['leadership', 'strategy', 'development', 'motivation'],
            context: 'coaching'
        },
        PARENT: {
            role: 'parent',
            needs: ['support', 'growth', 'encouragement', 'perspective'],
            context: 'parenting'
        },
        ATHLETE: {
            role: 'athlete',
            needs: ['discipline', 'perseverance', 'excellence', 'growth'],
            context: 'training'
        },
        ADMIN: {
            role: 'admin',
            needs: ['vision', 'leadership', 'excellence', 'impact'],
            context: 'management'
        },
        GUEST: {
            role: 'guest',
            needs: ['inspiration', 'motivation', 'excellence', 'growth'],
            context: 'general'
        }
    };

    /**
     * Detect user profile from authentication system
     */
    function detectUserProfile() {
        // Check security system first
        if (window.Security && window.Security.RBAC) {
            const role = window.Security.RBAC.getRole();
            const profile = Object.values(UserProfiles).find(p => p.role === role);
            if (profile) return profile;
        }
        
        // Check localStorage
        const storedRole = localStorage.getItem('gba_user_role');
        if (storedRole) {
            const profile = Object.values(UserProfiles).find(p => p.role === storedRole);
            if (profile) return profile;
        }
        
        // Check URL/path for context clues
        const path = window.location.pathname;
        if (path.includes('coach')) return UserProfiles.COACH;
        if (path.includes('parent')) return UserProfiles.PARENT;
        if (path.includes('training') || path.includes('aau')) return UserProfiles.ATHLETE;
        
        // Default to guest
        return UserProfiles.GUEST;
    }

    // ============================================
    // Quote Database (Personalized by Profile)
    // ============================================
    
    const QuoteDatabase = {
        coach: [
            {
                text: "Great coaches don't just teach plays. They build character.",
                author: "The Godspeed Way",
                theme: 'leadership'
            },
            {
                text: "Your impact isn't measured in wins. It's measured in lives changed.",
                author: "Legacy Building",
                theme: 'impact'
            },
            {
                text: "The best strategy is developing players who think for themselves.",
                author: "Player Development",
                theme: 'development'
            },
            {
                text: "Championship teams are built in practice, proven in games.",
                author: "Preparation",
                theme: 'strategy'
            }
        ],
        parent: [
            {
                text: "Your support is the foundation of their dreams.",
                author: "Parent Power",
                theme: 'support'
            },
            {
                text: "Every practice, every game. You're building more than an athlete.",
                author: "Character First",
                theme: 'growth'
            },
            {
                text: "The best investment you'll ever make is in your child's development.",
                author: "Long-Term Vision",
                theme: 'perspective'
            },
            {
                text: "Behind every great athlete is a parent who believed first.",
                author: "Belief",
                theme: 'encouragement'
            }
        ],
        athlete: [
            {
                text: "Excellence isn't a destination. It's a daily choice.",
                author: "The Grind",
                theme: 'discipline'
            },
            {
                text: "Every rep is an investment in who you're becoming.",
                author: "The Process",
                theme: 'perseverance'
            },
            {
                text: "Champions are made when no one is watching.",
                author: "The Work",
                theme: 'excellence'
            },
            {
                text: "Your only competition is the person you were yesterday.",
                author: "Self-Improvement",
                theme: 'growth'
            }
        ],
        admin: [
            {
                text: "Vision without execution is just a dream.",
                author: "Leadership",
                theme: 'vision'
            },
            {
                text: "Excellence in the details creates excellence in the whole.",
                author: "Systems Thinking",
                theme: 'excellence'
            }
        ],
        guest: [
            {
                text: "Built Different. Trained Different. Proven Different.",
                author: "Godspeed Basketball",
                theme: 'excellence'
            },
            {
                text: "The difference between good and great is in the details.",
                author: "The Process",
                theme: 'excellence'
            },
            {
                text: "Excellence is not a destination, it's a daily pursuit.",
                author: "The Godspeed Way",
                theme: 'motivation'
            },
            {
                text: "Champions aren't made in comfort zones.",
                author: "Built Different",
                theme: 'growth'
            }
        ]
    };

    /**
     * Get personalized quotes for user profile
     */
    function getQuotesForProfile(profile) {
        const roleQuotes = QuoteDatabase[profile.role] || QuoteDatabase.guest;
        const needs = profile.needs || [];
        
        // Filter quotes that match user needs
        const matchingQuotes = roleQuotes.filter(q => 
            needs.some(need => q.theme.includes(need) || q.text.toLowerCase().includes(need))
        );
        
        // Return matching quotes or all quotes if no matches
        return matchingQuotes.length > 0 ? matchingQuotes : roleQuotes;
    }

    // ============================================
    // Device Detection
    // ============================================
    
    function isMobile() {
        return window.innerWidth < 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    // ============================================
    // Quote Container Creation
    // ============================================
    
    const ColorThemes = {
        primary: {
            bg: 'rgba(37, 99, 235, 0.08)',
            border: 'rgba(37, 99, 235, 0.3)',
            accent: '#2563eb',
            text: '#1e293b'
        },
        success: {
            bg: 'rgba(16, 185, 129, 0.08)',
            border: 'rgba(16, 185, 129, 0.3)',
            accent: '#10b981',
            text: '#065f46'
        },
        warning: {
            bg: 'rgba(245, 158, 11, 0.08)',
            border: 'rgba(245, 158, 11, 0.3)',
            accent: '#f59e0b',
            text: '#92400e'
        },
        purple: {
            bg: 'rgba(139, 92, 246, 0.08)',
            border: 'rgba(139, 92, 246, 0.3)',
            accent: '#8b5cf6',
            text: '#5b21b6'
        },
        rose: {
            bg: 'rgba(244, 63, 94, 0.08)',
            border: 'rgba(244, 63, 94, 0.3)',
            accent: '#f43f5e',
            text: '#9f1239'
        }
    };

    /**
     * Get color theme based on context or random
     */
    function getColorTheme(index, context) {
        const themes = Object.values(ColorThemes);
        // Use context to determine theme, or cycle through themes
        if (context === 'coaching') return ColorThemes.primary;
        if (context === 'parenting') return ColorThemes.success;
        if (context === 'training') return ColorThemes.warning;
        return themes[index % themes.length];
    }

    /**
     * Create beautiful quote container
     */
    function createQuoteContainer(quote, index, theme, profile) {
        const container = document.createElement('div');
        container.className = 'godspeed-quote-container';
        container.setAttribute('data-theme', Object.keys(ColorThemes)[index % Object.keys(ColorThemes).length]);
        container.setAttribute('data-index', index);
        
        // Apply theme colors
        container.style.setProperty('--quote-bg', theme.bg);
        container.style.setProperty('--quote-border', theme.border);
        container.style.setProperty('--quote-accent', theme.accent);
        container.style.setProperty('--quote-text', theme.text);
        
        // Mobile class
        if (isMobile()) {
            container.classList.add('quote-mobile');
        }
        
        container.innerHTML = `
            <div class="quote-decoration">
                <svg class="quote-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"></path>
                    <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.75 4 2.5 5 1 .75 1 .75 1.75.75"></path>
                </svg>
            </div>
            <div class="quote-content">
                <p class="quote-text">${quote.text}</p>
                <span class="quote-author">${quote.author}</span>
            </div>
        `;
        
        return container;
    }

    // ============================================
    // Luminance & Image Detection Logic
    // ============================================

    function isDarkBackground(element) {
        let current = element;
        while (current && current !== document.body) {
            let style = window.getComputedStyle(current);
            let bgColor = style.backgroundColor;
            if (!bgColor) {
                current = current.parentElement;
                continue;
            }
            
            let rgbaMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
            if (rgbaMatch) {
                let r = parseInt(rgbaMatch[1], 10);
                let g = parseInt(rgbaMatch[2], 10);
                let b = parseInt(rgbaMatch[3], 10);
                let a = rgbaMatch.length > 4 ? parseFloat(rgbaMatch[4]) : 1;
                
                if (a === 0 || style.backgroundColor === 'transparent') {
                    current = current.parentElement;
                    continue;
                }
                
                // Rec. 709 luma components
                let luminance = (0.299 * r) + (0.587 * g) + (0.114 * b);
                return luminance < 128; // Threshold
            }
            current = current.parentElement;
        }
        return false;
    }

    /**
     * Check if element is an image or has background image
     */
    function isImageElement(element) {
        if (!element) return false;
        
        // Check if it's an img tag
        if (element.tagName === 'IMG') return true;
        
        // Check if it has background image
        const bgImage = window.getComputedStyle(element).backgroundImage;
        if (bgImage && bgImage !== 'none' && bgImage !== 'initial') {
            return true;
        }
        
        // Check if parent has background image (hero sections)
        const parent = element.parentElement;
        if (parent) {
            const parentBg = window.getComputedStyle(parent).backgroundImage;
            if (parentBg && parentBg !== 'none' && parentBg !== 'initial') {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Find safe placement for quote (not over images on initial load)
     */
    function findSafePlacement(element) {
        // On mobile, never place over images
        if (isMobile()) {
            // Find next non-image sibling or parent
            let current = element.nextElementSibling;
            while (current) {
                if (!isImageElement(current)) {
                    return current;
                }
                current = current.nextElementSibling;
            }
            // If no safe sibling, place after parent section
            return element.parentElement;
        }
        
        // On web, we'll use scroll-based reveal, so initial placement is fine
        return element;
    }

    // ============================================
    // Scroll-Based Reveal (Web Only)
    // ============================================
    
    function setupScrollReveal() {
        if (isMobile()) {
            // Mobile: Show immediately, no scroll reveal
            document.querySelectorAll('.godspeed-quote-container').forEach(quote => {
                quote.classList.add('quote-visible');
            });
            return;
        }
        
        // Web: Intersection Observer for scroll reveal
        const observerOptions = {
            threshold: 0.2,
            rootMargin: '0px 0px -50px 0px'
        };
        
        const quoteObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    // Check if we've scrolled past any images
                    const scrollY = window.scrollY;
                    const quoteTop = entry.boundingClientRect.top + scrollY;
                    
                    // Find images above this quote
                    const imagesAbove = Array.from(document.querySelectorAll('img, [style*="background-image"]'))
                        .filter(img => {
                            const rect = img.getBoundingClientRect();
                            const imgBottom = rect.bottom + scrollY;
                            return imgBottom < quoteTop;
                        });
                    
                    // Only reveal if we've scrolled past images or no images present
                    if (imagesAbove.length === 0 || scrollY > 100) {
                        entry.target.classList.add('quote-visible');
                        quoteObserver.unobserve(entry.target);
                    }
                }
            });
        }, observerOptions);
        
        // Observe all quotes
        document.querySelectorAll('.godspeed-quote-container').forEach(quote => {
            quoteObserver.observe(quote);
        });
    }

    // ============================================
    // Strategic Quote Placement
    // ============================================
    
    function placeQuotes(quotes, profile) {
        // Find strategic placement points
        const sections = document.querySelectorAll('section:not(.hero-section-light):not(.hero-section-aau)');
        const images = document.querySelectorAll('img, [class*="hero"], [style*="background-image"]');
        
        let quoteIndex = 0;
        const placedQuotes = [];
        
        // Place quotes after sections (not in hero sections)
        sections.forEach((section, index) => {
            if (quoteIndex >= quotes.length) return;
            
            // Skip if section contains images
            if (isImageElement(section)) return;
            
            // Place quote after every 2-3 sections
            if (index > 0 && index % 2 === 0) {
                const quote = quotes[quoteIndex];
                const theme = getColorTheme(quoteIndex, profile.context);
                const container = createQuoteContainer(quote, quoteIndex, theme, profile);
                
                // Find safe placement
                const placement = findSafePlacement(section);
                if (placement && placement.parentElement) {
                    placement.insertAdjacentElement('afterend', container);
                    placedQuotes.push(container);
                    quoteIndex++;

                    // Verify Background Context for visibility compliance
                    setTimeout(() => {
                        if (isDarkBackground(container.parentElement)) {
                            container.style.setProperty('--quote-text', '#ffffff');
                            container.style.setProperty('--quote-accent', '#ffffff');
                        } else {
                            container.style.setProperty('--quote-text', '#000000');
                        }
                    }, 100);
                }
            }
        });
        
        // Also place quotes in content areas (not over images)
        const contentAreas = document.querySelectorAll('.container, .content, article, .text-content');
        contentAreas.forEach((area, index) => {
            if (quoteIndex >= quotes.length) return;
            if (isImageElement(area)) return;
            
            if (index % 3 === 0 && index > 0) {
                const quote = quotes[quoteIndex];
                const theme = getColorTheme(quoteIndex, profile.context);
                const container = createQuoteContainer(quote, quoteIndex, theme, profile);
                
                area.insertAdjacentElement('beforeend', container);
                placedQuotes.push(container);
                quoteIndex++;

                // Verify Background Context for visibility compliance
                setTimeout(() => {
                    if (isDarkBackground(container.parentElement)) {
                        container.style.setProperty('--quote-text', '#ffffff');
                        container.style.setProperty('--quote-accent', '#ffffff');
                    } else {
                        container.style.setProperty('--quote-text', '#000000');
                    }
                }, 100);
            }
        });
        
        return placedQuotes;
    }

    // ============================================
    // Initialization
    // ============================================
    
    function init() {
        // Detect user profile
        const profile = detectUserProfile();
        
        // Get personalized quotes
        const quotes = getQuotesForProfile(profile);
        
        // Shuffle quotes for variety
        const shuffledQuotes = quotes.sort(() => Math.random() - 0.5).slice(0, 4);
        
        // Place quotes strategically
        const placedQuotes = placeQuotes(shuffledQuotes, profile);
        
        // Setup scroll reveal (web only)
        if (placedQuotes.length > 0) {
            setupScrollReveal();
        }
        
        // Log for debugging
        if (window.console && console.log) {
            console.log(`[Quote System] Profile: ${profile.role}, Quotes placed: ${placedQuotes.length}`);
        }
    }

    // ============================================
    // Run on DOM Ready
    // ============================================
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    // Re-initialize on dynamic content changes
    if (window.MutationObserver) {
        const mutationObserver = new MutationObserver(() => {
            const existingQuotes = document.querySelectorAll('.godspeed-quote-container');
            if (existingQuotes.length === 0) {
                // Re-initialize if quotes were removed
                setTimeout(init, 500);
            }
        });
        
        mutationObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
    
    // Export for external use
    window.GodspeedQuotes = {
        init,
        detectUserProfile,
        getQuotesForProfile
    };
})();
