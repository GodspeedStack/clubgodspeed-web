/**
 * Scroll Reveal Animation System
 * Uses Intersection Observer for scroll-triggered animations
 * Respects prefers-reduced-motion
 */

(function() {
 'use strict';

 // Check for reduced motion preference
 const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 if (prefersReducedMotion) {
 // Skip animations if user prefers reduced motion
 return;
 }

 // Animation options
 const defaultOptions = {
 threshold: 0.1,
 rootMargin: '0px 0px -50px 0px'
 };

 // Animation variants
 const animationVariants = {
 'scroll-reveal': 'fade-in-up',
 'scroll-reveal-up': 'fade-in-up',
 'scroll-reveal-left': 'slide-in-left',
 'scroll-reveal-right': 'slide-in-right',
 'scroll-reveal-scale': 'scale-in',
 'scroll-reveal-fade': 'fade-in',
 'scroll-reveal-parallax': 'parallax-fade',
 'scroll-reveal-stagger': 'slide-up-stagger',
 'scroll-reveal-rotate': 'scale-in-rotate'
 };

 // Create Intersection Observer
 const observer = new IntersectionObserver((entries) => {
 entries.forEach(entry => {
 if (entry.isIntersecting) {
 const element = entry.target;
 const classes = element.className.split(' ');
 // Find which animation variant to use
 let animationType = 'fade-in-up'; // default
 for (const className of classes) {
 if (animationVariants[className]) {
 animationType = animationVariants[className];
 break;
 }
 }

 // Add animation class
 element.classList.add(`animate-${animationType}`);
 element.classList.add('scroll-revealed');
 // Safely remove inline opacity so the CSS takes over or falls back securely
 element.style.opacity = '';
 // Unobserve after animation
 observer.unobserve(element);
 }
 });
 }, defaultOptions);

 // Handle stagger children
 function handleStaggerChildren() {
 const staggerParents = document.querySelectorAll('.stagger-children');
 const staggerObserver = new IntersectionObserver((entries) => {
 entries.forEach(entry => {
 if (entry.isIntersecting) {
 entry.target.classList.add('revealed');
 // Also clear child opacities for stagger elements
 Array.from(entry.target.children).forEach(child => {
 child.style.opacity = '';
 });
 staggerObserver.unobserve(entry.target);
 }
 });
 }, defaultOptions);

 staggerParents.forEach(parent => {
 staggerObserver.observe(parent);
 });
 }

 // Observe all elements with scroll-reveal classes
 function initScrollReveal() {
 const elements = document.querySelectorAll('[class*="scroll-reveal"]');
 elements.forEach(el => {
 // Add initial hidden state
 el.style.opacity = '0';
 observer.observe(el);
 });
 // Handle stagger children
 handleStaggerChildren();
 }

 // Initialize on DOM ready
 if (document.readyState === 'loading') {
 document.addEventListener('DOMContentLoaded', initScrollReveal);
 } else {
 initScrollReveal();
 }

 // Re-observe dynamically added elements
 if (window.MutationObserver) {
 const mutationObserver = new MutationObserver(() => {
 const newElements = document.querySelectorAll('[class*="scroll-reveal"]:not(.scroll-revealed)');
 newElements.forEach(el => {
 el.style.opacity = '0';
 observer.observe(el);
 });
 });
 mutationObserver.observe(document.body, {
 childList: true,
 subtree: true
 });
 }

 // Export for external use
 window.ScrollReveal = {
 observe: (element) => {
 if (element) {
 element.style.opacity = '0';
 observer.observe(element);
 }
 },
 unobserve: (element) => {
 if (element) {
 observer.unobserve(element);
 }
 }
 };
})();
