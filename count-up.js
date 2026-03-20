/**
 * Count-Up Animation
 * Animates numbers from 0 to target value when element enters viewport
 * Uses spring physics for smooth animation
 */

(function() {
    'use strict';

    // Check for reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    if (prefersReducedMotion) {
        return; // Skip animations
    }

    // Animation options
    const observerOptions = {
        threshold: 0.5,
        rootMargin: '0px'
    };

    // Spring physics easing
    function springEase(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    // Animate number
    function animateCount(element, target, duration = 2000) {
        const start = 0;
        const startTime = performance.now();
        
        // Handle special cases
        if (target === 'Zero' || target === 'One') {
            // For text values, use fade-in with scale
            element.style.opacity = '0';
            element.style.transform = 'scale(0.8)';
            requestAnimationFrame(() => {
                element.style.transition = 'opacity 0.6s ease-out, transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';
                element.style.opacity = '1';
                element.style.transform = 'scale(1)';
            });
            return;
        }

        // Extract number from text (e.g., "100%" -> 100)
        const match = target.toString().match(/(\d+)/);
        if (!match) return;
        
        const targetNumber = parseInt(match[1]);
        const suffix = target.toString().replace(match[0], '');
        
        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = springEase(progress);
            const current = Math.floor(start + (targetNumber - start) * eased);
            
            element.textContent = current + suffix;
            
            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                element.textContent = target; // Ensure final value
            }
        }
        
        requestAnimationFrame(update);
    }

    // Intersection Observer
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !entry.target.dataset.counted) {
                const element = entry.target;
                const target = element.dataset.countTarget || element.textContent.trim();
                
                element.dataset.counted = 'true';
                animateCount(element, target);
                
                observer.unobserve(element);
            }
        });
    }, observerOptions);

    // Initialize
    function initCountUp() {
        const elements = document.querySelectorAll('.count-up');
        elements.forEach(el => {
            // Store original text if not set
            if (!el.dataset.countTarget) {
                el.dataset.countTarget = el.textContent.trim();
            }
            observer.observe(el);
        });
    }

    // Run on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initCountUp);
    } else {
        initCountUp();
    }

    // Re-observe dynamically added elements
    if (window.MutationObserver) {
        const mutationObserver = new MutationObserver(() => {
            const newElements = document.querySelectorAll('.count-up:not([data-counted])');
            newElements.forEach(el => {
                if (!el.dataset.countTarget) {
                    el.dataset.countTarget = el.textContent.trim();
                }
                observer.observe(el);
            });
        });
        
        mutationObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Export
    window.CountUp = {
        animate: (element, target) => {
            if (element) {
                animateCount(element, target);
            }
        }
    };
})();
