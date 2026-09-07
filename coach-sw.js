/**
 * GODSPEED BASKETBALL. Coach Portal offline worker.
 *
 * Scope: /coach-portal.html only (registered by coach-player-dev.js). Keeps the
 * portal page and the files it loads (scripts, styles, fonts, the chart and
 * Supabase libraries) so the page opens without a connection. Never touches
 * Supabase API calls: anything on *.supabase.co, anything that is not a GET,
 * and anything with an Authorization header goes straight to the network.
 *
 * Page: network first, cache fallback (so a deploy shows up on the next open).
 * Assets: cache first, refreshed in the background (fast, and never stale for
 * more than one open). Bump VERSION to drop old caches.
 */
var VERSION = 'coach-portal-v2';
var API_HOSTS = /supabase\.co$|supabase\.in$/i;

self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});

function decide(req) {
  if (req.method !== 'GET') return 'network';
  var u = new URL(req.url);
  if (API_HOSTS.test(u.hostname)) return 'network';
  if (req.headers && req.headers.get && req.headers.get('authorization')) return 'network';
  if (u.protocol !== 'https:' && u.hostname !== 'localhost') return 'network';
  if (req.mode === 'navigate' || u.pathname === '/coach-portal.html') return 'page';
  return 'asset';
}

self.addEventListener('fetch', function (e) {
  var how = decide(e.request);
  if (how === 'network') return;
  if (how === 'page') {
    e.respondWith(fetch(e.request).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(e.request, copy); }); }
      return res;
    }).catch(function () { return caches.match(e.request, { ignoreSearch: true }).then(function (hit) { return hit || caches.match('/coach-portal.html'); }); }));
    return;
  }
  e.respondWith(caches.open(VERSION).then(function (c) {
    return c.match(e.request).then(function (hit) {
      var refresh = fetch(e.request).then(function (res) { if (res && (res.ok || res.type === 'opaque')) c.put(e.request, res.clone()); return res; }).catch(function () { return hit; });
      return hit || refresh;
    });
  }));
});

if (typeof module !== 'undefined') module.exports = { decide: decide };
