/**
 * Branded Modal System for Godspeed Basketball
 * Replaces all browser alert(), confirm(), and prompt() dialogs
 * with branded Godspeed modals matching the design system
 */

(function() {
 'use strict';

 // Create modal container if it doesn't exist
 function createModalContainer() {
 if (document.getElementById('godspeed-modal-overlay')) {
 return;
 }

 const overlay = document.createElement('div');
 overlay.id = 'godspeed-modal-overlay';
 overlay.className = 'godspeed-modal-overlay';
 overlay.innerHTML = `
 <div class="godspeed-modal">
 <div class="godspeed-modal-header">
 <div class="godspeed-modal-logo">
 <span class="godspeed-logo-text">GODSPEED</span><span class="godspeed-logo-accent">BASKETBALL</span>
 </div>
 <button class="godspeed-modal-close" aria-label="Close">×</button>
 </div>
 <div class="godspeed-modal-body">
 <h3 class="godspeed-modal-title" id="godspeed-modal-title"></h3>
 <p class="godspeed-modal-message" id="godspeed-modal-message"></p>
 <div class="godspeed-modal-input-container" id="godspeed-modal-input-container" style="display: none;">
 <input type="text" id="godspeed-modal-input" class="godspeed-modal-input" placeholder="">
 </div>
 </div>
 <div class="godspeed-modal-footer" id="godspeed-modal-footer">
 <!-- Buttons injected here -->
 </div>
 </div>
 `;
 document.body.appendChild(overlay);

 // Close handlers
 overlay.querySelector('.godspeed-modal-close').addEventListener('click', closeModal);
 overlay.addEventListener('click', (e) => {
 if (e.target === overlay) {
 closeModal();
 }
 });

 // Escape key
 document.addEventListener('keydown', (e) => {
 if (e.key === 'Escape' && overlay.classList.contains('active')) {
 closeModal();
 }
 });
 }

 // Show modal
 function showModal(title, message, type = 'alert', options = {}) {
 createModalContainer();
 const overlay = document.getElementById('godspeed-modal-overlay');
 const titleEl = document.getElementById('godspeed-modal-title');
 const messageEl = document.getElementById('godspeed-modal-message');
 const footerEl = document.getElementById('godspeed-modal-footer');
 const inputContainer = document.getElementById('godspeed-modal-input-container');
 const inputEl = document.getElementById('godspeed-modal-input');

 // Set content
 titleEl.textContent = title;
 messageEl.textContent = message;

 // Hide input by default
 inputContainer.style.display = 'none';
 inputEl.value = '';

 // Configure buttons based on type
 footerEl.innerHTML = '';

 if (type === 'alert') {
 const btn = document.createElement('button');
 btn.className = 'godspeed-modal-btn godspeed-modal-btn-primary';
 btn.textContent = options.buttonText || 'OK';
 btn.onclick = () => {
 closeModal();
 if (options.onConfirm) options.onConfirm();
 };
 footerEl.appendChild(btn);
 } else if (type === 'confirm') {
 const cancelBtn = document.createElement('button');
 cancelBtn.className = 'godspeed-modal-btn godspeed-modal-btn-secondary';
 cancelBtn.textContent = options.cancelText || 'Cancel';
 cancelBtn.onclick = () => {
 closeModal();
 if (options.onCancel) options.onCancel();
 };
 footerEl.appendChild(cancelBtn);

 const confirmBtn = document.createElement('button');
 confirmBtn.className = 'godspeed-modal-btn godspeed-modal-btn-primary';
 confirmBtn.textContent = options.confirmText || 'Confirm';
 confirmBtn.onclick = () => {
 closeModal();
 if (options.onConfirm) options.onConfirm();
 };
 footerEl.appendChild(confirmBtn);
 } else if (type === 'prompt') {
 inputContainer.style.display = 'block';
 inputEl.placeholder = options.placeholder || 'Enter value';
 inputEl.value = options.defaultValue || '';
 inputEl.focus();

 const cancelBtn = document.createElement('button');
 cancelBtn.className = 'godspeed-modal-btn godspeed-modal-btn-secondary';
 cancelBtn.textContent = options.cancelText || 'Cancel';
 cancelBtn.onclick = () => {
 closeModal();
 if (options.onCancel) options.onCancel(null);
 };
 footerEl.appendChild(cancelBtn);

 const confirmBtn = document.createElement('button');
 confirmBtn.className = 'godspeed-modal-btn godspeed-modal-btn-primary';
 confirmBtn.textContent = options.confirmText || 'OK';
 confirmBtn.onclick = () => {
 const value = inputEl.value;
 closeModal();
 if (options.onConfirm) options.onConfirm(value);
 };
 footerEl.appendChild(confirmBtn);

 // Enter key submits
 inputEl.onkeydown = (e) => {
 if (e.key === 'Enter') {
 confirmBtn.click();
 }
 };
 }

 // Show modal
 overlay.classList.add('active');
 document.body.style.overflow = 'hidden';
 }

 // Close modal
 function closeModal() {
 const overlay = document.getElementById('godspeed-modal-overlay');
 if (overlay) {
 overlay.classList.remove('active');
 document.body.style.overflow = '';
 }
 }

 // Branded alert (replaces alert())
 window.godspeedAlert = function(message, title = 'GODSPEED BASKETBALL', buttonText = 'OK') {
 return new Promise((resolve) => {
 showModal(title, message, 'alert', {
 buttonText: buttonText,
 onConfirm: () => resolve(true)
 });
 });
 };

 // Branded confirm (replaces confirm())
 window.godspeedConfirm = function(message, title = 'GODSPEED BASKETBALL', confirmText = 'Confirm', cancelText = 'Cancel') {
 return new Promise((resolve) => {
 showModal(title, message, 'confirm', {
 confirmText: confirmText,
 cancelText: cancelText,
 onConfirm: () => resolve(true),
 onCancel: () => resolve(false)
 });
 });
 };

 // Branded prompt (replaces prompt())
 window.godspeedPrompt = function(message, title = 'GODSPEED BASKETBALL', defaultValue = '', placeholder = '') {
 return new Promise((resolve) => {
 showModal(title, message, 'prompt', {
 defaultValue: defaultValue,
 placeholder: placeholder,
 confirmText: 'OK',
 cancelText: 'Cancel',
 onConfirm: (value) => resolve(value),
 onCancel: () => resolve(null)
 });
 });
 };

 // Override native alerts (optional - can be enabled/disabled)
 if (window.ENABLE_BRANDED_ALERTS !== false) {
 // Store original functions
 window._nativeAlert = window.alert;
 window._nativeConfirm = window.confirm;
 window._nativePrompt = window.prompt;

 // Override (can be toggled)
 window.alert = function(message) {
 return godspeedAlert(message);
 };

 window.confirm = function(message) {
 return godspeedConfirm(message);
 };

 window.prompt = function(message, defaultValue) {
 return godspeedPrompt(message, 'GODSPEED BASKETBALL', defaultValue || '');
 };
 }

 // Export for manual use
 window.showGodspeedModal = showModal;
 window.closeGodspeedModal = closeModal;
})();
