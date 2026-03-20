console.log("AAU Elite Site Loaded");

// =========================================
// SHOP & PRODUCT DATA
// =========================================
const products = [
 {
 id: 'hoodie-built-different',
 title: '"Built Different" Hoodie',
 price: '$65.00',
 description: 'Heavyweight fleece hoodie designed for comfort and warmth. Features the signature Godspeed "Built Different" branding.',
 features: ['Premium cotton blend', 'Kangaroo pocket', 'Relaxed fit'],
 images: [''], // Use placeholder logic or default
 placeholderColor: '#111',
 tag: 'Best Seller'
 },
 {
 id: 'tee-performance',
 title: 'Godspeed Performance Tee',
 price: '$35.00',
 description: 'Lightweight, moisture-wicking fabric to keep you cool on the court. Essential for every practice.',
 features: ['Dri-Fit Material', 'Athletic Cut', 'Breathable'],
 images: [''],
 placeholderColor: '#333'
 },
 {
 id: 'shorts-essential',
 title: 'Essential Practice Shorts',
 price: '$45.00',
 description: 'Durable mesh shorts with deep pockets and a secure waistband. Built for the daily grind.',
 features: ['Double-layer mesh', 'Elastic waistband', 'Deep side pockets'],
 images: [''],
 placeholderColor: '#555'
 },
 {
 id: 'nike-ja-3',
 title: 'Nike Ja 3 "Day One"',
 price: '$120.00',
 description: 'The Ja 3 is built for the player who creates their own lane. Featuring Zoom Air cushioning and a lightweight, breathable upper for explosive speed.',
 features: ['Shown: White/Black/Gold', 'Style: JA-003-D1', 'Zoom Air unit'],
 images: [
 'assets/nike-ja-3.png',
 'assets/nike-ja-3.png', // Duplicate for demo
 'assets/nike-ja-3.png' // Duplicate for demo
 ],
 tag: 'Limited'
 },
 {
 id: 'anta-kai-1',
 title: 'Anta Kai 1 "Crown Jewel"',
 price: '$140.00',
 description: 'Kyrie Irvings signature shoe with Anta. Precision engineered for the best ball handlers in the world.',
 features: ['Nitrogen infused foam', 'Carbon fiber plate', 'High-traction outsole'],
 images: [
 'assets/anta-kai-1.png',
 'assets/anta-kai-1.png',
 'assets/anta-kai-1.png'
 ],
 tag: 'Import'
 },
 {
 id: 'nb-two-wxy-v5',
 title: 'New Balance TWO WXY v5',
 price: '$120.00',
 description: 'Positionless play requires a shoe that can do it all. The TWO WXY v5 offers stability and responsiveness for every move.',
 features: ['FuelCell foam', 'Kinetic Stitch construction', 'Mid-top support'],
 images: ['assets/nb-two-wxy.png']
 },
 {
 id: 'nb-550',
 title: 'New Balance 550',
 price: '$110.00',
 description: 'A timeless classic. The 550 tributes the 90s pro ballers and the streetwear generation that defined a hoops era.',
 features: ['Leather upper', 'Classic court design', 'Rubber outsole'],
 images: [''],
 placeholderColor: '#e5e5e5',
 tag: 'Lifestyle'
 }
];

// =========================================
// SHOP ACTIONS
// =========================================



function loadProductDetails() {
 // Only run on product.html
 if (!window.location.pathname.includes('product.html')) return;

 const urlParams = new URLSearchParams(window.location.search);
 const productId = urlParams.get('id');

 if (!productId) {
 // Default to first product or handle error if no ID
 // For now, we will just leave the static content if no ID is present, Or redirect? // Let's just return to avoid errors if testing static page
 return;
 }

 const product = products.find(p => p.id === productId);

 if (product) {
 // Update elements
 const titleEl = document.getElementById('pdpTitle');
 const priceEl = document.getElementById('pdpPrice');
 const descEl = document.getElementById('pdpDescription');
 const featuresEl = document.getElementById('pdpFeatures');
 const imgEl = document.getElementById('mainImage');
 const thumbnailGrid = document.getElementById('thumbnailGrid');

 if (titleEl) titleEl.innerText = product.title;
 if (priceEl) priceEl.innerText = product.price;
 if (descEl) descEl.innerText = product.description;

 // Image Handling
 const images = product.images && product.images.length > 0 && product.images[0] !== ''
 ? product.images
 : null;

 if (imgEl) {
 if (images) {
 imgEl.src = images[0];
 imgEl.style.display = 'block';
 imgEl.parentElement.style.background = 'transparent';

 // Generate Thumbnails
 if (thumbnailGrid) {
 thumbnailGrid.style.display = 'none'; // Hide grid
 }
 } else if (product.placeholderColor) {
 imgEl.style.display = 'none';
 if (imgEl.parentElement) {
 imgEl.parentElement.style.background = product.placeholderColor;
 }
 }
 }

 if (featuresEl && product.features) {
 featuresEl.innerHTML = product.features.map(f => `<li>${f}</li>`).join('');
 }
 }
}

// Mobile Menu Toggle
const mobileBtn = document.querySelector('.mobile-menu-btn');
const navLinks = document.querySelector('.nav-links');

if (mobileBtn && navLinks) {
 mobileBtn.addEventListener('click', () => {
 navLinks.classList.toggle('active');
 });
}

// Scroll Animations (Advanced Stagger)
// Use DOMContentLoaded to ensure elements differ
// Scroll Animations (Advanced Stagger)
document.addEventListener('DOMContentLoaded', () => {
 const observerOptions = {
 root: null,
 rootMargin: '0px 0px -50px 0px', // Trigger slightly before bottom
 threshold: 0.1
 };

 const fadeObserver = new IntersectionObserver((entries) => {
 entries.forEach(entry => {
 if (entry.isIntersecting) {
 entry.target.classList.add('visible');
 fadeObserver.unobserve(entry.target);
 }
 });
 }, observerOptions);

 const setupElements = () => {
 const selectors = [
 '.about-grid > *',
 '.teams-grid > *',
 '.shop-grid > *',
 '.programs-grid > *',
 '.section-title',
 '.feature-card:not(.fade-up-enter)'
 ];

 const elements = document.querySelectorAll(selectors.join(', '));

 elements.forEach((el, index) => {
 el.classList.add('fade-up-enter');

 // Assign stagger delay
 const delayClass = `stagger-${(index % 3) + 1}`;
 el.classList.add(delayClass);

 fadeObserver.observe(el);
 });

 // FAILSAFE: Force show after 2s if observer fails (e.g. fast scroll or browser issue)
 setTimeout(() => {
 elements.forEach(el => el.classList.add('visible'));
 }, 3000);
 };

 // Run immediately
 setupElements();
});

// Animate Standard Bars on Scroll
const standardBars = document.querySelectorAll('.standard-bar');
if (standardBars.length > 0) {
 const barObserver = new IntersectionObserver((entries) => {
 entries.forEach(entry => {
 if (entry.isIntersecting) {
 const bar = entry.target;
 const fill = bar.querySelector('.bar-fill');
 const value = bar.querySelector('.bar-value').innerText;

 let width = value;
 if (value === '1') width = '100%';

 // Animate immediately when visible
 fill.style.width = width;

 barObserver.unobserve(bar);
 }
 });
 }, { threshold: 0.2 }); // Trigger when 20% visible

 standardBars.forEach(bar => barObserver.observe(bar));
}

// Card Expansion Logic
const featureCards = document.querySelectorAll('.feature-card, .stagger-item'); // Target ALL feature cards (philosophy + club)
const backdrop = document.createElement('div');
backdrop.className = 'card-backdrop';
document.body.appendChild(backdrop);

featureCards.forEach(card => {
 // Only add expansion logic if the card actually has details to show
 if (!card.querySelector('.card-details-expanded')) return;

 card.addEventListener('click', (e) => {
 // Prevent closing immediately if clicking inside expanded card
 if (card.classList.contains('expanded')) return;

 // Close any other expanded cards
 featureCards.forEach(c => c.classList.remove('expanded'));

 card.classList.add('expanded');
 backdrop.classList.add('active');
 e.stopPropagation(); // Prevent document click from closing immediately
 });
});

// Close on backdrop click
backdrop.addEventListener('click', () => {
 featureCards.forEach(c => c.classList.remove('expanded'));
 backdrop.classList.remove('active');
});

// Close on escape key
document.addEventListener('keydown', (e) => {
 if (e.key === 'Escape') {
 featureCards.forEach(c => c.classList.remove('expanded'));
 backdrop.classList.remove('active');
 }
});

// Custom iOS Alert Logic
function showIOSAlert(title, message, buttonText = "OK") {
 let overlay = document.getElementById('ios-alert-overlay');

 // Create if not exists
 if (!overlay) {
 overlay = document.createElement('div');
 overlay.id = 'ios-alert-overlay';
 overlay.className = 'ios-alert-overlay';
 overlay.innerHTML = `
 <div class="ios-alert-box">
 <div class="ios-alert-content">
 <div id="ios-alert-title" class="ios-alert-title"></div>
 <div id="ios-alert-message" class="ios-alert-message"></div>
 </div>
 <div class="ios-alert-actions">
 <button id="ios-alert-btn" class="ios-alert-btn bold"></button>
 </div>
 </div>
 `;
 document.body.appendChild(overlay);

 // Close handler
 const btn = overlay.querySelector('#ios-alert-btn');
 btn.addEventListener('click', () => {
 overlay.classList.remove('active');
 setTimeout(() => {
 // Optional: remove from DOM or just hide
 // overlay.style.display = 'none'; // logic via css opacity
 }, 200);
 });
 }

 // Set Content
 document.getElementById('ios-alert-title').innerText = title;
 document.getElementById('ios-alert-message').innerText = message;
 document.getElementById('ios-alert-btn').innerText = buttonText;

 // Show
 // Force reflow
 void overlay.offsetWidth;
 overlay.classList.add('active');
}

// Form Handling
const signupForm = document.getElementById('signup-form');
if (signupForm) {
 // Disable default browser validation to use our custom styles
 signupForm.setAttribute('novalidate', true);

 signupForm.addEventListener('submit', (e) => {
 e.preventDefault();

 let isValid = true;
 const requiredInputs = signupForm.querySelectorAll('input[required], select[required], textarea[required]');

 // Clear previous errors first? Or just re-validate.
 // Let's validate each
 requiredInputs.forEach(input => {
 if (!validateInput(input)) {
 isValid = false;
 }
 });

 if (isValid) {
 // Simulate form submission
 const formData = new FormData(signupForm);
 const parentName = formData.get('parent-name');

 showIOSAlert(
 "Request Received",
 `Thanks ${parentName}! We've received your registration request. We'll be in touch shortly.`,
 "OK"
 );
 signupForm.reset();
 // Remove checkmarks/valid states if any
 requiredInputs.forEach(input => clearError(input));
 } else {
 // Optional: Shake animation or scroll to first error
 const firstError = signupForm.querySelector('.nike-input.error');
 if (firstError) {
 firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
 firstError.focus();
 }
 }
 });

 // Real-time Validation (Clear error on type)
 signupForm.addEventListener('input', (e) => {
 if (e.target.classList.contains('nike-input')) {
 clearError(e.target);
 }
 });
}

function validateInput(input) {
 const value = input.value.trim();
 let errorMessage = '';

 // Context-aware Conversational Checks
 if (!value) {
 switch (input.id) {
 case 'parent-name':
 errorMessage = "Who should we ask for?";
 break;
 case 'player-name':
 errorMessage = "Who is the athlete?";
 break;
 case 'email':
 errorMessage = "Where do we send the invite?";
 break;
 case 'phone':
 errorMessage = "How can we reach you?";
 break;
 case 'grade':
 errorMessage = "Select a grade level.";
 break;
 default:
 errorMessage = "We need this info.";
 }
 }
 // Email Check
 else if (input.type === 'email') {
 const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
 if (!emailRegex.test(value)) {
 errorMessage = "Check the email format.";
 }
 }
 // Phone Check (Basic length)
 else if (input.type === 'tel') {
 if (value.length < 10) {
 errorMessage = "Number looks too short.";
 }
 }

 if (errorMessage) {
 showError(input, errorMessage);
 return false;
 }

 clearError(input);
 return true;
}

function showError(input, message) {
 input.classList.add('error');

 // Check if helper text exists
 let helper = input.nextElementSibling;
 if (!helper || !helper.classList.contains('error-helper-text')) {
 helper = document.createElement('div');
 helper.className = 'error-helper-text';
 input.parentNode.insertBefore(helper, input.nextSibling);
 }
 helper.innerText = message;
}

function clearError(input) {
 input.classList.remove('error');
 const helper = input.nextElementSibling;
 if (helper && helper.classList.contains('error-helper-text')) {
 helper.remove();
 }
}

// Program Selection Handling
// Program Selection Handling (Disabled in favor of enrollment.js)
/*
document.querySelectorAll('.select-program-btn, .program-select-btn').forEach(btn => {
 btn.addEventListener('click', (e) => {
 // ... (Disabled to prevent conflict)
 });
});
*/

/* =========================================
 PARENT PORTAL LOGIC (MOCK)
 ========================================= */

// Mock Data Store
const mockParentData = {
 parentName: "Michael Jordan",
 athleteName: "Marcus Jordan",
 team: "16U Elite",
 messages: [
 {
 id: 1,
 sender: "Coach Scott",
 date: "Dec 2, 2024",
 subject: "Tournament Schedule Update",
 body: "The weekend schedule has been finalized. We play at 9AM and 2PM on Saturday. Please arrive 45 mins early.",
 read: false
 },
 {
 id: 2,
 sender: "Coach Scott",
 date: "Nov 28, 2024",
 subject: "Practice Focus: Defense",
 body: "Great work yesterday. Marcus showed excellent hustle. We will continue focusing on help-side defense this week.",
 read: true
 }
 ],
 gameGrades: [
 { date: "Dec 1", opponent: "West Coast Elite", grade: "B+", notes: "Great shooting, needs better spacing." },
 { date: "Nov 24", opponent: "Compton Magic", grade: "A", notes: "Dominant performance. 12 assists." },
 { date: "Nov 17", opponent: "Oakland Soldiers", grade: "C", notes: "Low energy. Missed defensive assignments." }
 ],
 practiceGrades: [
 { date: "Nov 30", focus: "Shooting", effort: "A" },
 { date: "Nov 27", focus: "Conditioning", effort: "B" },
 { date: "Nov 25", focus: "Defense", effort: "A-" }
 ]
};

// DOM Elements
const loginForm = document.getElementById('login-form');
const loginSection = document.getElementById('login-section');
const dashboardSection = document.getElementById('dashboard-section');
const logoutBtn = document.getElementById('logout-btn');

// Login Handler
if (loginForm) {
 loginForm.addEventListener('submit', (e) => {
 e.preventDefault();

 // Simulate API Call / Login Delay
 const btn = loginForm.querySelector('button');
 const originalText = btn.innerText;
 btn.innerText = "Logging in...";

 setTimeout(() => {
 // "Login" Success
 loginSection.style.display = 'none';
 dashboardSection.style.display = 'block';

 // Populate Dashboard
 document.getElementById('parent-name-display').innerText = mockParentData.parentName;
 document.getElementById('athlete-name-display').innerText = mockParentData.athleteName;
 document.getElementById('athlete-team-display').innerText = mockParentData.team;

 renderMessages();
 renderGrades();

 btn.innerText = originalText;
 }, 800);
 });
}

// Logout Handler
if (logoutBtn) {
 logoutBtn.addEventListener('click', () => {
 dashboardSection.style.display = 'none';
 loginSection.style.display = 'flex';
 loginForm.reset();
 });
}

// Render Messages
function renderMessages() {
 const container = document.getElementById('messages-container');
 container.innerHTML = '';

 mockParentData.messages.forEach(msg => {
 const card = document.createElement('div');
 card.className = `message-card ${msg.read ? '' : 'unread'}`;

 card.innerHTML = `
 <div class="message-header">
 <span>${msg.sender} &bull; ${msg.date}</span>
 ${msg.read ? '<span style="color: green;">✓ Read</span>' : '<button class="mark-read-btn" onclick="markAsRead(' + msg.id + ')">Mark as Read</button>'}
 </div>
 <div style="font-weight: 700; margin-bottom: 0.5rem;">${msg.subject}</div>
 <div class="message-body">${msg.body}</div>
 `;

 container.appendChild(card);
 });
}

// Mark as Read Action
window.markAsRead = function (id) {
 const msg = mockParentData.messages.find(m => m.id === id);
 if (msg) {
 msg.read = true;
 renderMessages(); // Re-render to show updated state
 }
};

// Render Grades
function renderGrades() {
 // Game Grades
 const gameBody = document.getElementById('game-grades-body');
 gameBody.innerHTML = '';
 mockParentData.gameGrades.forEach(g => {
 const row = document.createElement('tr');
 row.innerHTML = `
 <td>${g.date}</td>
 <td>${g.opponent}</td>
 <td><span class="grade-badge grade-${g.grade.charAt(0)}">${g.grade}</span></td>
 <td>${g.notes}</td>
 `;
 gameBody.appendChild(row);
 });

 // Practice Grades
 const practiceBody = document.getElementById('practice-grades-body');
 practiceBody.innerHTML = '';
 mockParentData.practiceGrades.forEach(p => {
 const row = document.createElement('tr');
 row.innerHTML = `
 <td>${p.date}</td>
 <td>${p.focus}</td>
 <td><span class="grade-badge grade-${p.effort.charAt(0)}">${p.effort}</span></td>
 `;
 practiceBody.appendChild(row);
 });
}


// Handle URL parameters for form pre-selection
document.addEventListener('DOMContentLoaded', () => {
 // Load Product Details if on product page
 loadProductDetails();

 const urlParams = new URLSearchParams(window.location.search);
 const interest = urlParams.get('interest');

 if (interest) {
 // Find the checkbox with the matching value
 const checkbox = document.querySelector(`input[name="program"][value="${interest}"]`);
 if (checkbox) {
 checkbox.checked = true;

 // Scroll to form if hash is present (handled by browser usually, but good to ensure)
 if (window.location.hash === '#signup') {
 const signupSection = document.getElementById('signup');
 if (signupSection) {
 signupSection.scrollIntoView({ behavior: 'smooth' });
 }
 }
 }
 }
});

// =========================================
// SHOPPING CART IMPLEMENTATION
// =========================================

class ShoppingCart {
 constructor() {
 this.items = JSON.parse(localStorage.getItem('godspeed_cart')) || [];
 this.init();
 }

 init() {
 this.renderCartCount();
 this.setupEventListeners();
 }

 addItem(product) {
 // limit to 1 of each program for now if needed, or allow multiples?
 // User request doesn't specify logic, but for "Programs" usually you buy one?
 // Let's allow multiples for now (maybe for siblings).

 const existingItem = this.items.find(item => item.id === product.id);
 if (existingItem) {
 existingItem.quantity += 1;
 } else {
 this.items.push({ ...product, quantity: 1 });
 }

 this.save();
 this.renderCartCount();
 this.renderCartItems();
 this.openCart();

 // Visual feedback
 // alert(`Added ${product.name} to cart!`); // Removed alert for smoother UI
 }

 removeItem(productId) {
 const itemIndex = this.items.findIndex(item => item.id === productId);
 if (itemIndex > -1) {
 if (this.items[itemIndex].quantity > 1) {
 this.items[itemIndex].quantity -= 1;
 } else {
 this.items.splice(itemIndex, 1);
 }
 this.save();
 this.renderCartCount();
 this.renderCartItems();
 }
 }

 save() {
 localStorage.setItem('godspeed_cart', JSON.stringify(this.items));
 }

 getTotal() {
 return this.items.reduce((total, item) => total + (item.price * item.quantity), 0);
 }

 renderCartCount() {
 const cartBtn = document.getElementById('cart-btn');
 if (cartBtn) {
 const count = this.items.reduce((acc, item) => acc + item.quantity, 0);

 // Try to find the badge
 let badge = cartBtn.querySelector('.cart-badge');

 // If badge doesn't exist (legacy text mode or not init yet), we might need to handle it.
 // But assuming we updated HTML, it should be there. // If we want to be backward compatible or fail gracefully:
 if (badge) {
 badge.innerText = count;
 if (count > 0) {
 badge.classList.add('visible');
 } else {
 badge.classList.remove('visible');
 }
 } else {
 // Fallback for pages not yet updated
 cartBtn.innerText = `Cart (${count})`;
 }
 }
 }

 renderCartItems() {
 const cartItemsContainer = document.getElementById('cart-items');
 const cartTotalContainer = document.getElementById('cart-total-price');
 if (!cartItemsContainer) return;

 if (this.items.length === 0) {
 cartItemsContainer.innerHTML = '<p class="empty-cart-msg">Your cart is empty.</p>';
 if (cartTotalContainer) cartTotalContainer.innerText = '$0.00';
 return;
 }

 cartItemsContainer.innerHTML = this.items.map(item => `
 <div class="cart-item">
 <div class="cart-item-info">
 <div class="cart-item-title">${item.name}</div>
 <div class="cart-item-price">$${item.price} x ${item.quantity}</div>
 <button class="remove-item-btn" onclick="shoppingCart.removeItem('${item.id}')">Remove</button>
 </div>
 <div style="font-weight: 600; color: white;">$${item.price * item.quantity}</div>
 </div>
 `).join('');

 if (cartTotalContainer) {
 cartTotalContainer.innerText = `$${this.getTotal().toFixed(2)}`;
 }
 }

 openCart() {
 const overlay = document.getElementById('cart-overlay');
 if (overlay) {
 overlay.classList.add('active');
 this.renderCartItems();
 document.body.style.overflow = 'hidden';
 }
 }

 closeCart() {
 const overlay = document.getElementById('cart-overlay');
 if (overlay) {
 overlay.classList.remove('active');
 document.body.style.overflow = '';
 }
 }

 setupEventListeners() {
 // 1. Direct Listeners for static buttons (Robustness)
 // 1. Direct Listeners for static buttons (Robustness)
 document.querySelectorAll('.add-to-cart-btn').forEach(btn => {
 btn.addEventListener('click', (e) => {
 // If it's a program button (has data-interest or handled by enrollment.js), SKIP cart logic
 // Programs use 'data-interest' or appear in the programs section.
 if (btn.dataset.interest || btn.closest('#training')) return;

 e.preventDefault();
 e.stopPropagation(); // Critical: Stop bubbling to card container

 const product = {
 id: btn.dataset.id,
 name: btn.dataset.name,
 price: parseFloat(btn.dataset.price)
 };

 this.addItem(product);
 });
 });

 // 2. Global Delegation (Backups & Dynamic content)
 document.addEventListener('click', (e) => {
 // Close Cart
 if (e.target.closest('#close-cart') || e.target.id === 'cart-overlay') {
 this.closeCart();
 }

 // Open Cart
 if (e.target.closest('#cart-btn')) {
 e.preventDefault();
 this.openCart();
 }

 // Note: Delegation for add-to-cart is kept as backup, // but direct listeners above handle the main cases.
 });
 }
}

// Initialize Cart
const shoppingCart = new ShoppingCart();
