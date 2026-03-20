/**
 * Inspirational Quotes System
 * Displays motivational quotes about triumph, hard work, overcoming, and sacrifice
 * Quotes appear on scroll with smooth animations
 */

(function() {
 'use strict';

 const quotes = [
 {
 text: "Excellence is not a destination, it's a daily pursuit. Every rep, every drill, every moment of discomfort is an investment in who you're becoming.",
 author: " The Godspeed Way"
 },
 {
 text: "Champions aren't made in comfort zones. They're forged in the fire of discipline, built through sacrifice, and proven in moments of adversity.",
 author: " Built Different"
 },
 {
 text: "The difference between good and great isn't talent it's the willingness to do what others won't. To show up when it's hard. To push when it hurts.",
 author: " Train Different"
 },
 {
 text: "Every setback is a setup for a comeback. Every failure is data. Every challenge is an opportunity to prove who you really are.",
 author: " Unbreakable Mindset"
 },
 {
 text: "Hard work beats talent when talent doesn't work hard. But when talent works hard? That's unstoppable. That's Godspeed.",
 author: " The Process"
 },
 {
 text: "Sacrifice today for tomorrow's victory. The pain of discipline is nothing compared to the pain of regret.",
 author: " Long-Term Vision"
 },
 {
 text: "You don't rise to the occasion you fall to the level of your training. That's why we train at game speed, with game intensity, every single day.",
 author: " Preparation Meets Opportunity"
 },
 {
 text: "The best players aren't born they're built. Through repetition. Through failure. Through the relentless pursuit of getting 1% better every day.",
 author: " The Grind"
 }
 ];

 // Check for reduced motion
 const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 if (prefersReducedMotion) {
 return;
 }

 // Create quote elements
 function createQuoteElement(quote, index) {
 const quoteDiv = document.createElement('div');
 quoteDiv.className = 'inspirational-quote';
 quoteDiv.innerHTML = `
 <blockquote>${quote.text}</blockquote>
 <cite>${quote.author}</cite>
 `;
 return quoteDiv;
 }

 // Check luminance to protect quote colors
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
 let luminance = (0.299 * r) + (0.587 * g) + (0.114 * b);
 return luminance < 128;
 }
 current = current.parentElement;
 }
 return false;
 }

 // Secure colors for high-contrast context
 function enforceLuminanceContrast(quoteElement) {
 setTimeout(() => {
 if (isDarkBackground(quoteElement.parentElement)) {
 // Background is dark, make text white
 const bq = quoteElement.querySelector('blockquote');
 const ct = quoteElement.querySelector('cite');
 if (bq) bq.style.setProperty('color', '#ffffff', 'important');
 if (ct) ct.style.setProperty('color', '#e2e8f0', 'important');
 quoteElement.style.borderLeftColor = '#ffffff';
 quoteElement.style.background = 'rgba(255, 255, 255, 0.05)';
 } else {
 // Background is light, ensure black/dark text
 const bq = quoteElement.querySelector('blockquote');
 const ct = quoteElement.querySelector('cite');
 if (bq) bq.style.setProperty('color', '#1a1a1a', 'important');
 if (ct) ct.style.setProperty('color', '#666666', 'important');
 }
 }, 100);
 }

 // Insert quotes at strategic points
 function insertQuotes() {
 // Find sections to insert quotes
 const sections = document.querySelectorAll('section');
 // Insert quotes after every 2-3 sections
 let quoteIndex = 0;
 sections.forEach((section, index) => {
 if (index > 0 && index % 3 === 0 && quoteIndex < quotes.length) {
 const quote = createQuoteElement(quotes[quoteIndex], quoteIndex);
 section.insertAdjacentElement('beforebegin', quote);
 enforceLuminanceContrast(quote);
 quoteIndex++;
 }
 });

 // Also add quotes to specific high-impact sections
 const heroSections = document.querySelectorAll('.hero-section-light, .hero-section-aau');
 heroSections.forEach(hero => {
 const quote = createQuoteElement(quotes[0], 0);
 const content = hero.querySelector('.hero-content, .relative.z-10');
 if (content) {
 content.insertAdjacentElement('afterend', quote);
 enforceLuminanceContrast(quote);
 }
 });
 }

 // Reveal quotes on scroll
 const observerOptions = {
 threshold: 0.3,
 rootMargin: '0px 0px -100px 0px'
 };

 const quoteObserver = new IntersectionObserver((entries) => {
 entries.forEach(entry => {
 if (entry.isIntersecting) {
 entry.target.classList.add('revealed');
 quoteObserver.unobserve(entry.target);
 }
 });
 }, observerOptions);

 // Initialize
 function init() {
 insertQuotes();
 // Observe all quotes
 const allQuotes = document.querySelectorAll('.inspirational-quote');
 allQuotes.forEach(quote => {
 quoteObserver.observe(quote);
 });
 }

 // Run on DOM ready
 if (document.readyState === 'loading') {
 document.addEventListener('DOMContentLoaded', init);
 } else {
 init();
 }

 // Re-observe dynamically added quotes
 if (window.MutationObserver) {
 const mutationObserver = new MutationObserver(() => {
 const newQuotes = document.querySelectorAll('.inspirational-quote:not(.revealed)');
 newQuotes.forEach(quote => {
 quoteObserver.observe(quote);
 });
 });
 mutationObserver.observe(document.body, {
 childList: true,
 subtree: true
 });
 }
})();
