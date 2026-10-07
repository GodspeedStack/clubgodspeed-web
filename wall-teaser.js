/**
 * The Wall entry points inside the parent portal.
 *
 * 1. "Latest on The Wall" strip at the top of the portal's first screen:
 *    the 3 newest posts as square thumbnails, each opening the Wall.
 * 2. A dot on the sidebar "The Wall" item when something was posted since
 *    this parent last opened the Wall (community-wall.js writes the
 *    timestamp below every time the feed loads).
 *
 * Reads only through the wall_feed RPC (members only, RLS deny-all on the
 * tables) and short-lived signed URLs from the private bucket. Anything that
 * fails leaves the portal exactly as it was: no strip, no dot, no error.
 */
(function () {
  'use strict';

  var SEEN_KEY = 'gs_wall_seen_at';
  var BUCKET = 'community-wall';
  var started = false;

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'class') n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  // Coaches show by first name only (matches the Wall).
  function authorName(a) {
    if (!a || !a.name) return 'a Godspeed family';
    return a.is_staff ? a.name.split(' ')[0] : a.name;
  }

  function seenAt() {
    try { return localStorage.getItem(SEEN_KEY) || ''; } catch (e) { return ''; }
  }

  function setDot(on) {
    var dot = document.getElementById('nav-wall-dot');
    if (dot) dot.style.display = on ? 'block' : 'none';
    var link = document.getElementById('nav-wall');
    if (link) link.setAttribute('aria-label', on ? 'The Wall, new posts' : 'The Wall');
  }

  function strip(posts, urls) {
    var old = document.getElementById('wall-teaser');
    if (old) old.remove();
    var host = document.getElementById('view-documents');
    if (!host) return;

    var head = el('div', { class: 'wt-head' }, [
      el('h2', { class: 'wt-title', text: 'Latest on The Wall' }),
      el('a', { class: 'wt-all', href: 'community-wall.html', text: posts.length ? 'See all' : 'Open' })
    ]);
    var body;
    if (!posts.length) {
      body = el('p', { class: 'wt-empty' }, [
        document.createTextNode('No photos yet this season. '),
        el('a', { href: 'community-wall.html', text: 'Post the first one' })
      ]);
    } else {
      body = el('div', { class: 'wt-grid' });
      posts.forEach(function (p) {
        var m = p.media[0];
        var src = urls[m.kind === 'video' ? m.poster : m.path];
        var a = el('a', { class: 'wt-tile', href: 'community-wall.html',
                          'aria-label': (m.kind === 'video' ? 'Video' : 'Photo') + ' from ' + authorName(p.author) });
        if (src) a.appendChild(el('img', { src: src, alt: '', loading: 'lazy', decoding: 'async' }));
        if (m.kind === 'video') {
          var play = el('span', { class: 'wt-play', 'aria-hidden': 'true' });
          play.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
          a.appendChild(play);
        }
        body.appendChild(a);
      });
    }
    var card = el('section', { id: 'wall-teaser', class: 'wt-card', 'aria-label': 'Latest on The Wall' }, [head, body]);
    var welcome = document.getElementById('dashboard-welcome');
    if (welcome && welcome.parentNode === host) host.insertBefore(card, welcome.nextSibling);
    else host.insertBefore(card, host.firstChild);
  }

  async function run() {
    if (started) return;
    var dash = document.getElementById('portal-dashboard');
    if (!dash || dash.style.display === 'none') return;
    if (!window.auth || typeof window.auth.getSupabaseClient !== 'function') return;
    started = true;
    try {
      if (typeof window.auth.ensureClient === 'function') await window.auth.ensureClient();
      var sb = window.auth.getSupabaseClient();
      if (!sb) { started = false; return; }
      var res = await sb.rpc('wall_feed', { p_team_id: null, p_filter: 'all', p_cursor_ts: null, p_cursor_id: null, p_limit: 3 });
      if (res.error || !res.data) return; // not a member yet, or offline: leave the portal untouched
      var all = (res.data.pinned || []).concat(res.data.posts || []);
      var newest = all.reduce(function (m, p) { return p.published_at > m ? p.published_at : m; }, '');
      var seen = seenAt();
      setDot(!!newest && (!seen || newest > seen));

      var posts = (res.data.posts || []).filter(function (p) { return p.media && p.media.length; }).slice(0, 3);
      var paths = posts.map(function (p) { var m = p.media[0]; return m.kind === 'video' ? m.poster : m.path; }).filter(Boolean);
      var urls = {};
      if (paths.length) {
        var signed = await sb.storage.from(BUCKET).createSignedUrls(paths, 3600);
        (signed.data || []).forEach(function (s) { if (s.signedUrl) urls[s.path] = s.signedUrl; });
      }
      strip(posts, urls);
    } catch (e) {
      /* the strip is optional; never break the portal over it */
    }
  }

  window.addEventListener('gba:authStateChanged', function () { setTimeout(run, 300); });
  document.addEventListener('DOMContentLoaded', function () {
    var tries = 0;
    var t = setInterval(function () { tries += 1; run(); if (started || tries > 40) clearInterval(t); }, 500);
  });
})();
