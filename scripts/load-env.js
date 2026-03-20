/**
 * Load Environment Variables for Static HTML Files
 * This script reads .env file and exposes variables to window object
 * For development use only - in production, use a build process
 */

(function() {
 'use strict';
 // Try to load from .env file (requires Node.js/backend)
 // For static HTML, we'll use a fallback approach
 // Check if running in Vite dev server (import.meta.env available)
 if (typeof import !== 'undefined' && import.meta && import.meta.env) {
 window.VITE_RESEND_API_KEY = import.meta.env.VITE_RESEND_API_KEY || window.VITE_RESEND_API_KEY || '';
 window.VITE_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || window.VITE_SUPABASE_URL || '';
 window.VITE_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || window.VITE_SUPABASE_ANON_KEY || '';
 }
 // Fallback: Check if already set in window
 if (!window.VITE_RESEND_API_KEY) {
 window.VITE_RESEND_API_KEY = window.VITE_RESEND_API_KEY || '';
 }
 // Log status (remove in production)
 if (window.VITE_RESEND_API_KEY) {
 console.log('✅ Resend API key loaded');
 } else {
 console.warn('⚠️ Resend API key not found. Add VITE_RESEND_API_KEY to .env and use a dev server.');
 }
})();
