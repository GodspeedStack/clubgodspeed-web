/**
 * AI-Native Performance Optimization
 * GPU Management, Network Detection, and Hardware Adaptation
 */

(function() {
    'use strict';

    // Detect reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Network Detection
    const networkInfo = {
        effectiveType: '4g', // Default assumption
        downlink: 10, // Mbps
        saveData: false
    };

    // Detect network capabilities
    if ('connection' in navigator) {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (connection) {
            networkInfo.effectiveType = connection.effectiveType || '4g';
            networkInfo.downlink = connection.downlink || 10;
            networkInfo.saveData = connection.saveData || false;
            
            // Update on connection change
            connection.addEventListener('change', () => {
                networkInfo.effectiveType = connection.effectiveType || '4g';
                networkInfo.downlink = connection.downlink || 10;
                networkInfo.saveData = connection.saveData || false;
                adaptToNetwork();
            });
        }
    }

    // GPU Management: Pause animations when not visible
    const animationObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const element = entry.target;
            if (entry.isIntersecting) {
                // Resume animations
                element.classList.remove('pause-animation');
                if (element.style.animationPlayState) {
                    element.style.animationPlayState = 'running';
                }
            } else {
                // Pause animations to save GPU
                element.classList.add('pause-animation');
                if (element.style.animationPlayState !== undefined) {
                    element.style.animationPlayState = 'paused';
                }
            }
        });
    }, {
        rootMargin: '50px' // Start pausing slightly before leaving viewport
    });

    // Observe all elements with animations
    function observeAnimations() {
        const animatedElements = document.querySelectorAll('[class*="animate"], [class*="animation"], .stagger-item, .skeleton');
        animatedElements.forEach(el => {
            animationObserver.observe(el);
        });
    }

    // Adapt content based on network speed
    function adaptToNetwork() {
        const isSlowNetwork = networkInfo.effectiveType === 'slow-2g' || 
                             networkInfo.effectiveType === '2g' || 
                             networkInfo.downlink < 1.5;
        
        if (isSlowNetwork || networkInfo.saveData) {
            // Disable heavy animations
            document.documentElement.classList.add('slow-network');
            // Lazy load images more aggressively
            const images = document.querySelectorAll('img[data-src]');
            images.forEach(img => {
                if (img.dataset.src) {
                    img.src = img.dataset.src;
                }
            });
        } else {
            document.documentElement.classList.remove('slow-network');
        }
    }

    // iOS Input Optimization: Ensure 16px minimum font size
    function optimizeIOSInputs() {
        const inputs = document.querySelectorAll('input, textarea, select');
        inputs.forEach(input => {
            const computedStyle = window.getComputedStyle(input);
            const fontSize = parseFloat(computedStyle.fontSize);
            
            if (fontSize < 16) {
                input.style.fontSize = '16px';
            }
        });
    }

    // Detect device capabilities
    const deviceCapabilities = {
        hasGPU: false,
        isLowEnd: false,
        touchDevice: 'ontouchstart' in window || navigator.maxTouchPoints > 0
    };

    // Simple GPU detection
    function detectGPU() {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        
        if (gl) {
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
                const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                deviceCapabilities.hasGPU = !renderer.includes('Software') && !renderer.includes('SwiftShader');
            } else {
                deviceCapabilities.hasGPU = true; // Assume GPU if WebGL is available
            }
        }

        // Detect low-end devices (heuristic)
        const hardwareConcurrency = navigator.hardwareConcurrency || 4;
        const deviceMemory = navigator.deviceMemory || 4;
        deviceCapabilities.isLowEnd = hardwareConcurrency < 4 || deviceMemory < 4;
    }

    // Adapt animations based on device capabilities
    function adaptToDevice() {
        if (deviceCapabilities.isLowEnd || !deviceCapabilities.hasGPU) {
            document.documentElement.classList.add('low-end-device');
            // Disable complex animations
            const style = document.createElement('style');
            style.textContent = `
                .low-end-device * {
                    animation-duration: 0.01ms !important;
                    transition-duration: 0.01ms !important;
                }
            `;
            document.head.appendChild(style);
        }
    }

    // Lazy load images with Intersection Observer
    function lazyLoadImages() {
        if ('IntersectionObserver' in window) {
            const imageObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        if (img.dataset.src) {
                            img.src = img.dataset.src;
                            img.removeAttribute('data-src');
                            observer.unobserve(img);
                        }
                    }
                });
            }, {
                rootMargin: '50px'
            });

            const lazyImages = document.querySelectorAll('img[data-src]');
            lazyImages.forEach(img => imageObserver.observe(img));
        }
    }

    // Initialize on DOM ready
    function init() {
        detectGPU();
        adaptToDevice();
        adaptToNetwork();
        optimizeIOSInputs();
        observeAnimations();
        lazyLoadImages();

        // Re-observe animations when new content is added
        if (window.MutationObserver) {
            const mutationObserver = new MutationObserver(() => {
                observeAnimations();
            });
            mutationObserver.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Export for external use
    window.PerformanceOptimizer = {
        networkInfo,
        deviceCapabilities,
        prefersReducedMotion,
        adaptToNetwork,
        adaptToDevice
    };
})();
