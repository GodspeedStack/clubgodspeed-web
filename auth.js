
/**
 * Global Authentication Manager for Godspeed Basketball
 * Handles visibility of restricted content (Calendar, Parent Portal Links).
 * Uses Supabase Auth when available, falls back to localStorage mock.
 */

(function () {
 const AUTH_KEY = 'gba_parent_auth_token';
 const LOGGED_IN_CLASS = 'logged-in';

 // Check if Supabase auth is available (loaded via auth-supabase.js)
 const useSupabase = typeof window.auth !== 'undefined' && window.auth.isSupabaseAvailable && window.auth.isSupabaseAvailable();

 // Expose Auth API globally (only if auth-supabase.js hasn't already defined it)
 if (!window.auth || !window.auth.isSupabaseAvailable || !window.auth.isSupabaseAvailable()) {
 // Store reference to original auth if it exists
 const originalAuth = window.auth;
 window.auth = window.auth || {
 login: async function (email, password) {
 // If Supabase auth is available, use it
 if (originalAuth && originalAuth.login && typeof originalAuth.login === 'function') {
 try {
 return await originalAuth.login(email, password);
 } catch (error) {
 console.error('Supabase login failed, using fallback');
 // Fall through to fallback
 }
 }
 // Fallback: localStorage mock (for development/testing)
 localStorage.setItem(AUTH_KEY, 'valid_token_' + Date.now());
 localStorage.setItem('gba_user_email', email);
 updateUI(true);
 return true;
 },

 logout: async function () {
 // If Supabase auth is available, use it
 if (originalAuth && originalAuth.logout && typeof originalAuth.logout === 'function') {
 await originalAuth.logout();
 return;
 }
 localStorage.removeItem(AUTH_KEY);
 localStorage.removeItem('gba_user_email');
 localStorage.removeItem('gba_user_id');
 updateUI(false);
 window.location.href = 'index.html';
 },

 isLoggedIn: function () {
 // If Supabase auth is available, use it
 if (originalAuth && originalAuth.isLoggedIn && typeof originalAuth.isLoggedIn === 'function') {
 return originalAuth.isLoggedIn();
 }
 return !!localStorage.getItem(AUTH_KEY);
 },

 init: async function () {
 // If Supabase auth is available, use it
 if (originalAuth && originalAuth.init && typeof originalAuth.init === 'function') {
 await originalAuth.init();
 return;
 }
 const isLoggedIn = !!localStorage.getItem(AUTH_KEY);
 updateUI(isLoggedIn);
 }
 };
 }

 function updateUI(isLoggedIn) {
 if (isLoggedIn) {
 document.body.classList.add(LOGGED_IN_CLASS);
 } else {
 document.body.classList.remove(LOGGED_IN_CLASS);
 }

 // Dropdown Update
 const dropdown = document.querySelector('.login-dropdown');
 if (dropdown) {
 // Remove old logout if exists
 const oldLogout = dropdown.querySelector('.logout-option');
 if (oldLogout) oldLogout.remove();

 if (isLoggedIn) {
 // Add Logout
 const logoutLink = document.createElement('a');
 logoutLink.href = "#";
 logoutLink.className = "login-option logout-option";
 logoutLink.style.borderTop = "1px solid #eee";
 logoutLink.innerHTML = `
 <span style="display: flex; align-items: center; gap: 10px; color: #ff3b30;">
 <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
 Sign Out
 </span>
 `;
 logoutLink.onclick = (e) => {
 e.preventDefault();
 window.auth.logout();
 };
 dropdown.appendChild(logoutLink);
 }
 }
 }

 // Auto-init on load (wait for auth-supabase.js if it exists)
 if (document.readyState === 'loading') {
 document.addEventListener('DOMContentLoaded', () => {
 setTimeout(() => window.auth.init(), 100); // Small delay to allow auth-supabase.js to load
 });
 } else {
 setTimeout(() => window.auth.init(), 100);
 }

})();
