/**
 * Security Utilities for Godspeed Basketball
 * Provides functions for input sanitization and XSS prevention
 */

/**
 * Sanitize a string to prevent XSS attacks
 * Escapes HTML special characters
 * @param {string} str - String to sanitize
 * @returns {string} - Sanitized string safe for textContent
 */
export function sanitizeText(str) {
 if (typeof str !== 'string') return '';
 const div = document.createElement('div');
 div.textContent = str;
 return div.innerHTML;
}

/**
 * Sanitize HTML content (for use with innerHTML when necessary)
 * Removes script tags and dangerous attributes
 * @param {string} html - HTML string to sanitize
 * @returns {string} - Sanitized HTML
 */
export function sanitizeHTML(html) {
 if (typeof html !== 'string') return '';
 const div = document.createElement('div');
 div.textContent = html; // This escapes all HTML
 return div.innerHTML;
}

/**
 * Escape HTML entities
 * @param {string} str - String to escape
 * @returns {string} - Escaped string
 */
export function escapeHTML(str) {
 if (typeof str !== 'string') return '';
 const map = {
 '&': '&amp;',
 '<': '&lt;',
 '>': '&gt;',
 '"': '&quot;',
 "'": '&#039;'
 };
 return str.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Validate and sanitize email address
 * @param {string} email - Email to validate
 * @returns {string|null} - Sanitized email or null if invalid
 */
export function validateEmail(email) {
 if (typeof email !== 'string') return null;
 const trimmed = email.trim().toLowerCase();
 const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
 if (!emailRegex.test(trimmed)) return null;
 return escapeHTML(trimmed);
}

/**
 * Validate URL to prevent javascript: and data: protocols
 * @param {string} url - URL to validate
 * @returns {string|null} - Sanitized URL or null if invalid
 */
export function validateURL(url) {
 if (typeof url !== 'string') return null;
 const trimmed = url.trim();
 // Block javascript: and data: protocols
 if (trimmed.toLowerCase().startsWith('javascript:') || trimmed.toLowerCase().startsWith('data:')) {
 return null;
 }
 // Allow http, https, mailto, tel, and relative URLs
 if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('mailto:') || trimmed.startsWith('tel:') || trimmed.startsWith('/') || trimmed.startsWith('#')) {
 return escapeHTML(trimmed);
 }
 return null;
}

/**
 * Safe way to set text content (prevents XSS)
 * @param {HTMLElement} element - Element to set text on
 * @param {string} text - Text to set
 */
export function setSafeText(element, text) {
 if (!element) return;
 element.textContent = typeof text === 'string' ? text : String(text || '');
}

/**
 * Create a safe HTML element with text content
 * @param {string} tag - HTML tag name
 * @param {string} text - Text content
 * @param {Object} attributes - HTML attributes (will be escaped)
 * @returns {HTMLElement} - Created element
 */
export function createSafeElement(tag, text, attributes = {}) {
 const element = document.createElement(tag);
 setSafeText(element, text);
 Object.entries(attributes).forEach(([key, value]) => {
 if (key === 'href' || key === 'src') {
 const safeURL = validateURL(value);
 if (safeURL) element.setAttribute(key, safeURL);
 } else {
 element.setAttribute(key, escapeHTML(String(value)));
 }
 });
 return element;
}
