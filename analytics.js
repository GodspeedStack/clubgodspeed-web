/**
 * Godspeed Analytics Engine Native Client
 * Binds globally to the DOM to track page views, clicks, and session lengths.
 */
(function() {
 'use strict';

 // Verify Crypto UUID support natively
 const SESSION_ID = ("crypto" in window && "randomUUID" in crypto) ? crypto.randomUUID() : 'session_' + Date.now() + Math.random().toString(36).substring(2);
 let pageEntryTime = Date.now();
 let currentPage = null;
 let scrollDepthFired = new Set();
 window.analytics = {
 /**
 * Core Event Transmitter
 */
 track: async function(eventType, payload = {}) {
 // Bypass tracking if supabase architecture is missing
 const supabase = window.auth?.getSupabaseClient ? window.auth.getSupabaseClient() : null;
 if (!supabase) return;
 try {
 // Determine user identity natively
 const { data: { user } } = await supabase.auth.getUser();

 const event = {
 user_id: user?.id ?? null,
 session_id: SESSION_ID,
 event_type: eventType,
 page: currentPage ?? window.location.pathname,
 ...payload
 };

 const { error } = await supabase
 .from('analytics_events')
 .insert(event);

 if (error) console.warn('[analytics] Insert failed:', error.message);
 } catch (err) {
 console.error('[analytics] Exception while tracking:', err);
 }
 },

 /**
 * Fire a page transition mapping chronological exit duration limits
 */
 trackPageView: function(pageName) {
 // Track the exit time mapping to the PREVIOUS page state
 if (currentPage) {
 this.track('page_exit', {
 page: currentPage,
 duration_ms: Date.now() - pageEntryTime
 });
 }

 // Sync structural pointer to the absolute new target
 currentPage = pageName;
 pageEntryTime = Date.now();
 scrollDepthFired.clear();

 this.track('page_view', { page: pageName });
 },

 trackClick: function(elementLabel, metadata = {}) {
 this.track('click', { element_label: elementLabel, metadata });
 },

 initScrollTracking: function() {
 const thresholds = [25, 50, 75, 100];

 window.addEventListener('scroll', () => {
 const scrollHeight = document.body.scrollHeight - window.innerHeight;
 if (scrollHeight <= 0) return;

 const scrolled = Math.round((window.scrollY / scrollHeight) * 100);

 thresholds.forEach(threshold => {
 if (scrolled >= threshold && !scrollDepthFired.has(threshold)) {
 scrollDepthFired.add(threshold);
 this.track('scroll_depth', { scroll_pct: threshold });
 }
 });
 }, { passive: true });
 },

 trackError: function(errorMessage, metadata = {}) {
 this.track('error_encountered', { element_label: errorMessage, metadata });
 },

 trackFeature: function(featureName, metadata = {}) {
 this.track('feature_used', { element_label: featureName, metadata });
 },

 trackDownload: function(fileName) {
 this.track('download', { element_label: fileName });
 }
 };

 /**
 * Absolute fail-safe beacon to transmit exit state when the browser tab is natively killed
 */
 window.addEventListener('visibilitychange', () => {
 if (document.visibilityState === 'hidden' && currentPage) {
 const SUPABASE_URL = window.SUPABASE_CONFIG?.url || window.VITE_SUPABASE_URL || '';
 const ANON_KEY = window.SUPABASE_CONFIG?.anonKey || window.VITE_SUPABASE_ANON_KEY || '';
 if (!SUPABASE_URL || !ANON_KEY) return;

 const payload = JSON.stringify({
 user_id: null, // Hard fallback because we can't cleanly await async functions at process exit
 session_id: SESSION_ID,
 event_type: 'page_exit',
 page: currentPage,
 duration_ms: Date.now() - pageEntryTime
 });

 // Native beacon to survive the DOM thread block
 navigator.sendBeacon(
 `${SUPABASE_URL}/rest/v1/analytics_events`,
 new Blob([payload], { type: 'application/json' })
 );
 }
 });

})();
