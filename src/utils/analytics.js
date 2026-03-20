// src/utils/analytics.js

import { supabase } from '../lib/supabaseClient.js'

// Session ID persists for the browser tab lifetime utilizing native Crypto API
const SESSION_ID = crypto.randomUUID()

// Page entry time for duration calculation
let pageEntryTime = Date.now()
let currentPage = null
let scrollDepthFired = new Set()

// ─── Core track function ──────────────────────────────────────────────────────
export async function track(eventType, payload = {}) {
  const { data: { user } } = await supabase.auth.getUser()

  const event = {
    user_id: user?.id ?? null,
    session_id: SESSION_ID,
    event_type: eventType,
    page: currentPage ?? window.location.pathname,
    ...payload
  }

  const { error } = await supabase
    .from('analytics_events')
    .insert(event)

  if (error) console.warn('[analytics] insert failed:', error.message)
}

// ─── Page view ────────────────────────────────────────────────────────────────
export function trackPageView(pageName) {
  // Fire exit event for previous page
  if (currentPage) {
    track('page_exit', {
      page: currentPage,
      duration_ms: Date.now() - pageEntryTime
    })
  }

  currentPage = pageName
  pageEntryTime = Date.now()
  scrollDepthFired.clear()

  track('page_view', { page: pageName })
}

// ─── Click tracking ───────────────────────────────────────────────────────────
export function trackClick(elementLabel, metadata = {}) {
  track('click', { element_label: elementLabel, metadata })
}

// ─── Scroll depth ─────────────────────────────────────────────────────────────
export function initScrollTracking() {
  const thresholds = [25, 50, 75, 100]

  window.addEventListener('scroll', () => {
    const scrolled = Math.round(
      (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100
    )

    thresholds.forEach(threshold => {
      if (scrolled >= threshold && !scrollDepthFired.has(threshold)) {
        scrollDepthFired.add(threshold)
        track('scroll_depth', { scroll_pct: threshold })
      }
    })
  }, { passive: true })
}

// ─── Error tracking ───────────────────────────────────────────────────────────
export function trackError(errorMessage, metadata = {}) {
  track('error_encountered', {
    element_label: errorMessage,
    metadata
  })
}

// ─── Feature tracking ─────────────────────────────────────────────────────────
export function trackFeature(featureName, metadata = {}) {
  track('feature_used', {
    element_label: featureName,
    metadata
  })
}

// ─── Download tracking ────────────────────────────────────────────────────────
export function trackDownload(fileName) {
  track('download', { element_label: fileName })
}

// ─── Page exit on tab close ───────────────────────────────────────────────────
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && currentPage) {
    // Use sendBeacon so the request survives tab close
    const payload = JSON.stringify({
      user_id: null, // can't await auth here
      session_id: SESSION_ID,
      event_type: 'page_exit',
      page: currentPage,
      duration_ms: Date.now() - pageEntryTime
    })

    navigator.sendBeacon(
      `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/analytics_events`,
      new Blob([payload], { type: 'application/json' })
    )
  }
})
