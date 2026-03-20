/**
 * Button State Management
 * Disable buttons immediately after submission to prevent duplicate requests
 */

(function() {
 'use strict';

 // Handle form submissions
 document.addEventListener('submit', function(e) {
 const form = e.target;
 const submitButton = form.querySelector('button[type="submit"], input[type="submit"]');
 if (submitButton && !submitButton.disabled) {
 // Disable immediately
 submitButton.disabled = true;
 submitButton.classList.add('button-loading');
 // Re-enable on error (after 2 seconds as fallback)
 setTimeout(() => {
 if (submitButton.disabled) {
 submitButton.disabled = false;
 submitButton.classList.remove('button-loading');
 }
 }, 2000);
 }
 });

 // Handle button clicks that trigger async actions
 document.addEventListener('click', function(e) {
 const button = e.target.closest('button[data-async], a[data-async]');
 if (button && !button.disabled && !button.classList.contains('button-loading')) {
 const originalText = button.textContent;
 button.classList.add('button-loading');
 button.disabled = true;
 // Store original state for potential rollback
 button.dataset.originalText = originalText;
 }
 });

 // Utility function to reset button state
 window.resetButtonState = function(button) {
 if (button) {
 button.disabled = false;
 button.classList.remove('button-loading');
 if (button.dataset.originalText) {
 button.textContent = button.dataset.originalText;
 delete button.dataset.originalText;
 }
 }
 };

 // Utility function to set button loading
 window.setButtonLoading = function(button, loadingText) {
 if (button) {
 button.disabled = true;
 button.classList.add('button-loading');
 if (loadingText) {
 button.dataset.originalText = button.textContent;
 button.textContent = loadingText;
 }
 }
 };
})();
