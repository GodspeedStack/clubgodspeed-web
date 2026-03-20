/**
 * Easter Eggs System
 * Hidden interactive elements throughout the site that unlock special content
 * Rewards exploration and discovery
 */

(function() {
 'use strict';

 // Track discovered easter eggs
 const discoveredEggs = JSON.parse(localStorage.getItem('godspeedEasterEggs') || '[]');
 // Easter egg definitions
 const easterEggs = [
 {
 id: 'logo-secret',
 trigger: 'click',
 selector: '.logo',
 clicks: 5,
 timeout: 3000,
 message: 'You found the secret! 🏀',
 reward: {
 title: 'Built Different',
 content: 'You\'ve unlocked exclusive training content. Check your email for early access to our advanced movement science curriculum.',
 action: 'Claim Reward',
 actionUrl: '#'
 }
 },
 {
 id: 'konami-code',
 trigger: 'keyboard',
 sequence: ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'],
 message: 'Konami Code Activated! 🎮',
 reward: {
 title: 'Elite Access Unlocked',
 content: 'You\'ve discovered the secret code! Get 10% off your first training session. Use code: ELITE10',
 action: 'Apply Code',
 actionUrl: 'training.html#signup'
 }
 },
 {
 id: 'triple-click-title',
 trigger: 'click',
 selector: 'h1',
 clicks: 3,
 timeout: 2000,
 message: 'Triple tap discovered! 💪',
 reward: {
 title: 'Hidden Training Tip',
 content: 'The best players don\'t practice until they get it right. They practice until they can\'t get it wrong. - Coach True',
 action: 'View More Tips',
 actionUrl: 'about.html'
 }
 },
 {
 id: 'cart-secret',
 trigger: 'click',
 selector: '#cart-btn',
 clicks: 10,
 timeout: 5000,
 message: 'Cart master! 🛒',
 reward: {
 title: 'Loyalty Reward',
 content: 'You\'re clearly committed! Get a free Godspeed t-shirt with your next purchase.',
 action: 'Shop Now',
 actionUrl: 'store.html'
 }
 },
 {
 id: 'footer-secret',
 trigger: 'click',
 selector: 'footer',
 clicks: 7,
 timeout: 4000,
 message: 'Footer explorer! 🔍',
 reward: {
 title: 'Behind the Scenes',
 content: 'You found our hidden content! Get exclusive access to player development videos and training breakdowns.',
 action: 'Watch Videos',
 actionUrl: '#'
 }
 },
 {
 id: 'image-sequence',
 trigger: 'click',
 selector: '.stagger-item img',
 sequence: [0, 1, 2], // Click first 3 images in order
 timeout: 10000,
 message: 'Pattern master! 🎯',
 reward: {
 title: 'IQ School Bonus',
 content: 'You think like a player! Unlock our advanced decision-making course for free.',
 action: 'Start Course',
 actionUrl: 'training.html'
 }
 },
 {
 id: 'keyboard-shortcut-g',
 trigger: 'keyboard',
 key: 'KeyG',
 ctrlKey: true,
 message: 'Godspeed shortcut! ⚡',
 reward: {
 title: 'Quick Access',
 content: 'You found the shortcut! Bookmark this: Press Ctrl+G anytime to access your player portal.',
 action: 'Go to Portal',
 actionUrl: 'parent-portal.html'
 }
 },
 {
 id: 'hover-master',
 trigger: 'hover',
 selector: '.feature-card',
 duration: 5000, // Hover for 5 seconds
 message: 'Hover champion! 🏆',
 reward: {
 title: 'Attention to Detail',
 content: 'Your focus is elite! Get a personalized training assessment from our coaches.',
 action: 'Book Assessment',
 actionUrl: 'training.html#signup'
 }
 },
 {
 id: 'scroll-master',
 trigger: 'scroll',
 scrolls: 10,
 timeout: 3000,
 message: 'Scroll warrior! 📜',
 reward: {
 title: 'Dedication Rewarded',
 content: 'You\'ve scrolled through everything! Here\'s a special message from Coach Gene: "The journey is the destination."',
 action: 'Read More',
 actionUrl: 'about.html'
 }
 },
 {
 id: 'double-tap-mobile',
 trigger: 'touch',
 selector: '.hero-section-light, .hero-section-aau',
 taps: 2,
 timeout: 500,
 message: 'Mobile master! 📱',
 reward: {
 title: 'Mobile Exclusive',
 content: 'You found the mobile secret! Get our mobile training app early access.',
 action: 'Get App',
 actionUrl: '#'
 }
 }
 ];

 // Easter egg modal
 function showEasterEggModal(egg) {
 // Check if already discovered
 if (discoveredEggs.includes(egg.id)) {
 return; // Don't show again
 }

 // Mark as discovered
 discoveredEggs.push(egg.id);
 localStorage.setItem('godspeedEasterEggs', JSON.stringify(discoveredEggs));

 // Create modal
 const modal = document.createElement('div');
 modal.className = 'easter-egg-modal';
 modal.innerHTML = `
 <div class="easter-egg-content">
 <div class="easter-egg-close" onclick="this.closest('.easter-egg-modal').remove()">×</div>
 <div class="easter-egg-icon">🎉</div>
 <div class="easter-egg-message">${egg.message}</div>
 <h3 class="easter-egg-title">${egg.reward.title}</h3>
 <p class="easter-egg-text">${egg.reward.content}</p>
 <a href="${egg.reward.actionUrl}" class="easter-egg-button">${egg.reward.action}</a>
 <div class="easter-egg-badge">Easter Egg #${discoveredEggs.length}</div>
 </div>
 `;
 document.body.appendChild(modal);

 // Animate in
 setTimeout(() => modal.classList.add('show'), 10);

 // Auto-remove after 10 seconds
 setTimeout(() => {
 modal.classList.remove('show');
 setTimeout(() => modal.remove(), 300);
 }, 10000);
 }

 // Track clicks
 let clickCounts = {};
 let clickTimers = {};

 function handleClickEgg(egg) {
 const key = egg.id;
 if (!clickCounts[key]) clickCounts[key] = 0;
 clickCounts[key]++;
 // Reset timer
 clearTimeout(clickTimers[key]);
 clickTimers[key] = setTimeout(() => {
 clickCounts[key] = 0;
 }, egg.timeout || 3000);

 if (clickCounts[key] >= egg.clicks) {
 showEasterEggModal(egg);
 clickCounts[key] = 0;
 }
 }

 // Track keyboard sequences
 let keySequence = [];
 let sequenceTimers = {};

 function handleKeyboardEgg(egg) {
 if (egg.sequence) {
 // Konami code style
 const key = event.code;
 keySequence.push(key);
 // Keep only last N keys
 if (keySequence.length > egg.sequence.length) {
 keySequence.shift();
 }

 // Check if sequence matches
 if (keySequence.length === egg.sequence.length) {
 const matches = egg.sequence.every((k, i) => keySequence[i] === k);
 if (matches) {
 showEasterEggModal(egg);
 keySequence = [];
 }
 }

 // Reset after timeout
 clearTimeout(sequenceTimers[egg.id]);
 sequenceTimers[egg.id] = setTimeout(() => {
 keySequence = [];
 }, 3000);
 } else if (egg.key) {
 // Single key shortcut
 if (event.code === egg.key && (!egg.ctrlKey || event.ctrlKey)) {
 event.preventDefault();
 showEasterEggModal(egg);
 }
 }
 }

 // Track hover duration
 let hoverTimers = {};

 function handleHoverEgg(egg) {
 const element = document.querySelector(egg.selector);
 if (!element) return;

 element.addEventListener('mouseenter', () => {
 hoverTimers[egg.id] = setTimeout(() => {
 showEasterEggModal(egg);
 }, egg.duration);
 });

 element.addEventListener('mouseleave', () => {
 clearTimeout(hoverTimers[egg.id]);
 });
 }

 // Track scroll
 let scrollCount = 0;
 let scrollTimer;

 function handleScrollEgg(egg) {
 window.addEventListener('scroll', () => {
 scrollCount++;
 clearTimeout(scrollTimer);
 scrollTimer = setTimeout(() => {
 if (scrollCount >= egg.scrolls) {
 showEasterEggModal(egg);
 scrollCount = 0;
 } else {
 scrollCount = 0;
 }
 }, egg.timeout || 3000);
 });
 }

 // Track touch events
 let touchCounts = {};
 let touchTimers = {};

 function handleTouchEgg(egg) {
 const element = document.querySelector(egg.selector);
 if (!element) return;

 element.addEventListener('touchend', (e) => {
 const key = egg.id;
 if (!touchCounts[key]) touchCounts[key] = 0;
 touchCounts[key]++;
 clearTimeout(touchTimers[key]);
 touchTimers[key] = setTimeout(() => {
 if (touchCounts[key] >= egg.taps) {
 showEasterEggModal(egg);
 touchCounts[key] = 0;
 } else {
 touchCounts[key] = 0;
 }
 }, egg.timeout || 500);
 });
 }

 // Track image sequence clicks
 let imageSequence = [];
 let imageSequenceTimer;

 function handleImageSequenceEgg(egg) {
 const images = document.querySelectorAll(egg.selector);
 images.forEach((img, index) => {
 img.addEventListener('click', () => {
 imageSequence.push(index);
 // Keep only last N
 if (imageSequence.length > egg.sequence.length) {
 imageSequence.shift();
 }

 // Check sequence
 if (imageSequence.length === egg.sequence.length) {
 const matches = egg.sequence.every((i, idx) => imageSequence[idx] === i);
 if (matches) {
 showEasterEggModal(egg);
 imageSequence = [];
 }
 }

 // Reset after timeout
 clearTimeout(imageSequenceTimer);
 imageSequenceTimer = setTimeout(() => {
 imageSequence = [];
 }, egg.timeout || 10000);
 });
 });
 }

 // Initialize all easter eggs
 function init() {
 easterEggs.forEach(egg => {
 if (discoveredEggs.includes(egg.id)) return; // Skip if already discovered

 switch(egg.trigger) {
 case 'click':
 if (egg.sequence) {
 handleImageSequenceEgg(egg);
 } else {
 const element = document.querySelector(egg.selector);
 if (element) {
 element.addEventListener('click', () => handleClickEgg(egg));
 }
 }
 break;
 case 'keyboard':
 document.addEventListener('keydown', (e) => handleKeyboardEgg(egg));
 break;
 case 'hover':
 handleHoverEgg(egg);
 break;
 case 'scroll':
 handleScrollEgg(egg);
 break;
 case 'touch':
 handleTouchEgg(egg);
 break;
 }
 });
 }

 // Run on DOM ready
 if (document.readyState === 'loading') {
 document.addEventListener('DOMContentLoaded', init);
 } else {
 init();
 }

 // Show discovery count in console (for developers)
 console.log(`%c🏀 Godspeed Basketball`, 'font-size: 20px; font-weight: bold; color: #2563eb;');
 console.log(`%cEaster Eggs Discovered: ${discoveredEggs.length}/${easterEggs.length}`, 'font-size: 12px; color: #666;');
 if (discoveredEggs.length > 0) {
 console.log(`%cKeep exploring! There's more to discover.`, 'font-size: 11px; color: #999; font-style: italic;');
 }
})();
