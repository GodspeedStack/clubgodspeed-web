/* ==========================================================================
   The Wall -- community photo and video wall for Godspeed families.

   Data contract: every read and write goes through the wall_* RPCs in
   supabase/migrations/20261002180000_community_wall.sql. Tables are deny-all.
   Media lives in the private `community-wall` bucket and is read through
   short-lived signed URLs; there are no public links.

   Posting is two-phase and idempotent:
     1. wall_create_post(client_id, ...) reserves the post and storage paths
     2. files upload to exactly those paths (storage RLS enforces it)
     3. wall_publish_post verifies every object landed, then goes live
   Retrying with the same client_id never duplicates a post.

   Privacy: photos are re-encoded in the browser (strips EXIF, including GPS).
   Video GPS strings in the moov atom are zeroed before upload (best effort).
   ========================================================================== */
(function () {
  'use strict';

  // ------------------------------------------------------------------ config
  var CFG = {
    url: 'https://nnqokhqennuxalamnvps.supabase.co',
    // Publishable anon key (same value as order-uniform.html). Safe in client code:
    // every wall_* function is revoked from anon, and tables are deny-all.
    anon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ucW9raHFlbm51eGFsYW1udnBzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MzcwMDYsImV4cCI6MjA4MjAxMzAwNn0.hH9XR_tgi4Xl8nS__iHwiSkwjHUvwF88491q4O27cis',
    bucket: 'community-wall',
    pageSize: 12,
    signTtl: 3600,
    maxFiles: 10,
    maxImageEdge: 2048,
    maxImageBytes: 10 * 1024 * 1024,
    maxVideoMs: 60500,
    captionMax: 500,
    pollMs: 60000
  };

  var sb = window.supabase.createClient(CFG.url, CFG.anon);

  // ------------------------------------------------------------------- icons
  var I = {
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8 3.6 4.5 7.2 4.5c2 0 3.5 1.1 4.8 2.8 1.3-1.7 2.8-2.8 4.8-2.8 3.6 0 5.7 3.5 4.5 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"/></svg>',
    comment: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 11.5a8.5 8.5 0 0 1-12.4 7.6L3.5 20.5l1.4-4.4A8.5 8.5 0 1 1 20.5 11.5z"/></svg>',
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    grid: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
    list: '<path d="M4 5h16v10H4zM4 19h16"/>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>',
    stack: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h13v13H7z" fill="currentColor" stroke="none"/><path d="M4 16V4h12"/></svg>',
    soundOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4zM16 9l5 6M21 9l-5 6"/></svg>',
    soundOn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6l-1 6 4 4H6l4-4zM12 14v7"/></svg>',
    download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14"/></svg>',
    flag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4h11l-1.5 4L16 12H5"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
    tagOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4 4-6 8-6s7.2 2 8 6M3 3l18 18"/></svg>',
    person: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4 4-6 8-6s7.2 2 8 6"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    photo: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-8 8"/></svg>',
    chevL: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    chevR: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    restore: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4"/></svg>'
  };
  var HEART_FILLED = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8 3.6 4.5 7.2 4.5c2 0 3.5 1.1 4.8 2.8 1.3-1.7 2.8-2.8 4.8-2.8 3.6 0 5.7 3.5 4.5 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"/></svg>';

  var REPORT_REASONS = [
    ['privacy', 'My child is in this and I want it down'],
    ['inappropriate', 'Inappropriate or unkind'],
    ['not_our_program', 'Not about Godspeed'],
    ['spam', 'Spam or selling'],
    ['other', 'Something else']
  ];

  // ----------------------------------------------------------------- helpers
  function $(id) { return document.getElementById(id); }
  function h(tag, attrs, html) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') el.textContent = attrs[k];
      else if (k === 'class') el.className = attrs[k];
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) el.setAttribute(k, attrs[k]);
    });
    if (html !== undefined) el.innerHTML = html;
    return el;
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var x = Array.prototype.map.call(b, function (n) { return (n + 256).toString(16).slice(1); }).join('');
    return x.slice(0, 8) + '-' + x.slice(8, 12) + '-' + x.slice(12, 16) + '-' + x.slice(16, 20) + '-' + x.slice(20);
  }
  // Coaches show by first name with a plain "Coach" tag (Scott, 2026-10-07):
  // never a last initial, never a profile title like "Founder & Director".
  function shownName(a) {
    if (!a) return '';
    var n = a.name || '';
    return a.is_staff ? n.split(' ')[0] : n;
  }
  function initials(name) {
    var p = String(name || '').replace(/\./g, '').trim().split(/\s+/);
    return ((p[0] || '')[0] || 'G').toUpperCase() + ((p[1] || '')[0] || '').toUpperCase();
  }
  function teamShort(name) { return String(name || '').replace(/^Godspeed\s+/i, ''); }
  function ago(iso) {
    if (!iso) return 'Just now';
    var s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'Just now';
    if (s < 3600) return Math.floor(s / 60) + 'm';
    if (s < 86400) return Math.floor(s / 3600) + 'h';
    if (s < 7 * 86400) return Math.floor(s / 86400) + 'd';
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  }
  function dur(ms) {
    var s = Math.round((ms || 0) / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function store(k, v) {
    try { if (v === undefined) return localStorage.getItem('cw.' + k); localStorage.setItem('cw.' + k, v); } catch (e) { return null; }
  }
  var toastTimer;
  function toast(msg) {
    var t = $('cwToast');
    t.textContent = msg; t.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('is-on'); }, 2600);
  }
  function haptic() { try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) { /* no-op */ } }

  // Normalised errors: { code, message, details } (architecture contract 4)
  var MESSAGES = {
    NOT_MEMBER: 'The Wall is for current Godspeed families.',
    RATE_LIMITED: null, BAD_TEAM: null, BAD_MEDIA: null, FILE_TOO_LARGE: null, VIDEO_TOO_LONG: null,
    MEDIA_RELEASE_MISSING: null, UPLOAD_INCOMPLETE: 'Some files did not finish uploading. Tap Share to retry.',
    NOT_FOUND: 'That post is no longer on the wall.', OWN_CONTENT: null, FORBIDDEN: null,
    NETWORK: 'You look offline. Check your connection and try again.'
  };
  function normErr(e) {
    if (!e) return { code: 'UNKNOWN', message: 'Something went wrong.', details: null };
    var code = (String(e.message || '').match(/^[A-Z_]{4,}$/) || [])[0];
    if (!code && /fetch|network|Failed to fetch|Load failed/i.test(String(e.message))) code = 'NETWORK';
    code = code || 'UNKNOWN';
    var msg = MESSAGES[code] || e.details || e.message || 'Something went wrong.';
    if (code === 'UNKNOWN') msg = 'Something went wrong. Please try again.';
    return { code: code, message: msg, details: e.details || null };
  }
  function rpc(fn, args) {
    return sb.rpc(fn, args || {}).then(function (r) {
      if (r.error) throw normErr(r.error);
      return r.data;
    }, function (e) { throw normErr(e); });
  }

  var api = {
    context: function () { return rpc('wall_context'); },
    feed: function (o) {
      return rpc('wall_feed', { p_team_id: o.team || null, p_filter: o.filter || 'all',
        p_cursor_ts: o.cursor ? o.cursor.ts : null, p_cursor_id: o.cursor ? o.cursor.id : null, p_limit: o.limit || CFG.pageSize });
    },
    createPost: function (a) { return rpc('wall_create_post', a); },
    publish: function (id) { return rpc('wall_publish_post', { p_post_id: id }); },
    like: function (id, on) { return rpc('wall_set_like', { p_post_id: id, p_liked: on }); },
    comments: function (id) { return rpc('wall_list_comments', { p_post_id: id, p_limit: 200 }); },
    addComment: function (id, cid, body) { return rpc('wall_add_comment', { p_post_id: id, p_client_id: cid, p_body: body }); },
    delComment: function (id) { return rpc('wall_delete_comment', { p_comment_id: id }); },
    delPost: function (id) { return rpc('wall_delete_post', { p_post_id: id }); },
    report: function (a) { return rpc('wall_report', a); },
    untag: function (pid, aid) { return rpc('wall_untag_my_player', { p_post_id: pid, p_athlete_id: aid }); },
    moderate: function (action, pid, cid) { return rpc('wall_moderate', { p_action: action, p_post_id: pid || null, p_comment_id: cid || null }); },
    queue: function () { return rpc('wall_review_queue'); }
  };

  // ------------------------------------------------------- signed URL cache
  var signCache = new Map();   // path -> { url, exp }
  var signWaiters = new Map(); // path -> [resolve]
  var signQueue = new Set();
  var signTimer = null;
  function signed(path) {
    if (!path) return Promise.resolve(null);
    var c = signCache.get(path);
    if (c && c.exp > Date.now() + 60000) return Promise.resolve(c.url);
    return new Promise(function (res) {
      if (!signWaiters.has(path)) signWaiters.set(path, []);
      signWaiters.get(path).push(res);
      signQueue.add(path);
      if (!signTimer) signTimer = setTimeout(flushSign, 16);   // batch one frame of requests
    });
  }
  function flushSign() {
    signTimer = null;
    var paths = Array.from(signQueue); signQueue.clear();
    for (var i = 0; i < paths.length; i += 100) signBatch(paths.slice(i, i + 100));
  }
  function signBatch(paths) {
    sb.storage.from(CFG.bucket).createSignedUrls(paths, CFG.signTtl).then(function (r) {
      var byPath = {};
      (r.data || []).forEach(function (d) { if (d && d.path) byPath[d.path] = d.signedUrl || d.signedURL || null; });
      paths.forEach(function (p) {
        var url = byPath[p] || null;
        if (url) signCache.set(p, { url: url, exp: Date.now() + CFG.signTtl * 1000 });
        (signWaiters.get(p) || []).forEach(function (fn) { fn(url); });
        signWaiters.delete(p);
      });
    }, function () {
      paths.forEach(function (p) { (signWaiters.get(p) || []).forEach(function (fn) { fn(null); }); signWaiters.delete(p); });
    });
  }

  // ------------------------------------------------------------------- state
  var S = {
    session: null, ctx: null,
    filter: 'all', team: null,
    view: store('view') === 'grid' ? 'grid' : 'feed',
    posts: [], pinned: [], byId: new Map(),
    cursor: null, done: false, loading: false, newestTs: null,
    reviewOpen: false
  };

  // Read deep-link filters (?team=...&filter=...)
  (function () {
    var q = new URLSearchParams(location.search);
    if (/^[0-9a-f-]{36}$/i.test(q.get('team') || '')) S.team = q.get('team');
    if (['all', 'my_players', 'mine'].indexOf(q.get('filter')) >= 0) S.filter = q.get('filter');
  })();
  function syncUrl() {
    var q = new URLSearchParams();
    if (S.team) q.set('team', S.team);
    if (S.filter !== 'all') q.set('filter', S.filter);
    try { history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '')); } catch (e) { /* no-op */ }
  }

  // ------------------------------------------------------------- state views
  function showState(kind) {
    var el = $('cwState');
    $('cwFeed').setAttribute('aria-busy', 'false');
    if (!kind) { el.innerHTML = ''; return; }
    var m = {
      signin: [I.lock, 'Sign in to see The Wall', 'Photos and videos here are only for Godspeed families.', '<a class="cw-btn" href="parent-portal.html?next=wall">Sign in</a>'],
      member: [I.lock, 'Almost there', 'The Wall opens once your player is on a current Godspeed roster. Reach out to your coach if that looks wrong.', '<a class="cw-btn" href="parent-portal.html">Back to portal</a>'],
      empty: [I.photo, 'No posts yet', S.filter === 'my_players' ? 'Nobody has tagged your player yet.' : S.filter === 'mine' ? 'You have not posted yet.' : 'Be the first to share a moment from practice or game day.', '<button class="cw-btn" type="button" data-act="compose">Share a moment</button>'],
      error: [I.photo, 'Could not load The Wall', 'Check your connection and try again.', '<button class="cw-btn" type="button" data-act="retry">Try again</button>']
    }[kind];
    el.innerHTML = m[0] + '<h2></h2><p></p>' + m[3];
    el.querySelector('h2').textContent = m[1];
    el.querySelector('p').textContent = m[2];
    var c = el.querySelector('[data-act="compose"]'); if (c) c.onclick = openComposer;
    var r = el.querySelector('[data-act="retry"]'); if (r) r.onclick = function () { reload(); };
  }
  function skeletons(n) {
    var f = $('cwFeed');
    for (var i = 0; i < n; i++) {
      f.appendChild(h('div', { class: 'cw-skel', 'aria-hidden': 'true' },
        '<div class="cw-skel__row"><div class="cw-skel__c sh"></div><div style="flex:1"><div class="cw-skel__l sh" style="width:40%"></div><div class="cw-skel__l sh" style="width:24%;margin-top:6px"></div></div></div>' +
        '<div class="cw-skel__m sh"></div><div class="cw-skel__row"><div class="cw-skel__l sh" style="width:60%"></div></div>'));
    }
  }

  // ------------------------------------------------------------------ filters
  function renderFilters() {
    var row = $('cwFilterRow'); row.innerHTML = '';
    var items = [{ key: 'all', label: 'All' }, { key: 'my_players', label: 'My players' }, { key: 'mine', label: 'My posts' }];
    (S.ctx.teams || []).forEach(function (t) { items.push({ key: 'team:' + t.id, label: teamShort(t.name) }); });
    items.forEach(function (it) {
      var on = it.key.indexOf('team:') === 0 ? (S.team === it.key.slice(5) && S.filter === 'all') : (!S.team && S.filter === it.key);
      row.appendChild(h('button', {
        class: 'cw-chip', type: 'button', role: 'tab', 'aria-selected': on ? 'true' : 'false', text: it.label,
        onclick: function () {
          if (it.key.indexOf('team:') === 0) { S.team = it.key.slice(5); S.filter = 'all'; }
          else { S.team = null; S.filter = it.key; }
          syncUrl(); renderFilters(); reload();
        }
      }));
    });
    $('cwFilters').classList.remove('cw-hide');
  }

  function setView(v) {
    S.view = v; store('view', v);
    var grid = v === 'grid';
    $('cwViewIcon').innerHTML = grid ? I.list : I.grid;
    $('cwViewBtn').setAttribute('aria-label', grid ? 'Switch to feed view' : 'Switch to grid view');
    $('cwViewBtn').setAttribute('aria-pressed', grid ? 'true' : 'false');
    $('cwFeed').classList.toggle('is-grid', grid);
    $('cw-main').classList.toggle('is-grid', grid);
    document.body.classList.toggle('cw-grid', grid);
    renderAll();
  }

  // ------------------------------------------------------------- feed paging
  function reload() {
    S.posts = []; S.pinned = []; S.byId.clear(); S.cursor = null; S.done = false;
    $('cwFeed').innerHTML = ''; $('cwEnd').classList.add('cw-hide'); $('cwNewPill').classList.add('cw-hide');
    showState(null);
    skeletons(2);
    $('cwFeed').setAttribute('aria-busy', 'true');
    return loadMore(true);
  }
  function loadMore(first) {
    if (S.loading || S.done) return Promise.resolve();
    S.loading = true;
    return api.feed({ team: S.team, filter: S.filter, cursor: S.cursor }).then(function (r) {
      if (first) { $('cwFeed').innerHTML = ''; S.pinned = r.pinned || []; S.pinned.forEach(index); }
      (r.posts || []).forEach(function (p) { index(p); S.posts.push(p); });
      S.cursor = r.next; S.done = !r.next;
      var top = S.pinned.concat(S.posts)[0];
      if (first && top) S.newestTs = maxTs();
      if (first) renderAll(); else appendPosts(r.posts || []);
      if (!S.pinned.length && !S.posts.length) showState('empty'); else showState(null);
      $('cwEnd').classList.toggle('cw-hide', !S.done || !S.posts.length);
      $('cwFeed').setAttribute('aria-busy', 'false');
    }).catch(function (e) {
      if (first) { $('cwFeed').innerHTML = ''; showState(e.code === 'NOT_MEMBER' ? 'member' : 'error'); }
      else toast(e.message);
    }).then(function () { S.loading = false; });
  }
  function index(p) { S.byId.set(p.id, p); }
  function maxTs() {
    return S.pinned.concat(S.posts).reduce(function (m, p) { return p.published_at && p.published_at > (m || '') ? p.published_at : m; }, null);
  }
  function allPosts() { return S.pinned.concat(S.posts); }

  function renderAll() {
    var f = $('cwFeed'); f.innerHTML = '';
    if (S.reviewOpen) return;
    allPosts().forEach(function (p) { f.appendChild(S.view === 'grid' ? tile(p) : card(p)); });
    observeVideos();
  }
  function appendPosts(list) {
    var f = $('cwFeed');
    list.forEach(function (p) { f.appendChild(S.view === 'grid' ? tile(p) : card(p)); });
    observeVideos();
  }
  function replacePost(p) {
    index(p);
    ['pinned', 'posts'].forEach(function (k) { S[k] = S[k].map(function (x) { return x.id === p.id ? p : x; }); });
    var old = document.querySelector('[data-post="' + p.id + '"]');
    if (old) { var n = S.view === 'grid' ? tile(p) : card(p); old.replaceWith(n); observeVideos(); }
  }
  function dropPost(id) {
    S.byId.delete(id);
    S.pinned = S.pinned.filter(function (x) { return x.id !== id; });
    S.posts = S.posts.filter(function (x) { return x.id !== id; });
    var el = document.querySelector('[data-post="' + id + '"]'); if (el) el.remove();
    if (!allPosts().length) showState('empty');
  }

  // -------------------------------------------------------------- feed card
  function authorHead(p, withMore) {
    var a = p.author || {};
    var head = h('div', { class: 'cw-post__head' });
    head.appendChild(h('span', { class: 'cw-avatar' + (a.is_staff ? ' cw-avatar--staff' : ''), 'aria-hidden': 'true', text: initials(shownName(a)) }));
    var who = h('div', { class: 'cw-post__who' });
    var name = h('div', { class: 'cw-post__name' });
    name.appendChild(h('span', { text: shownName(a) || 'Godspeed Family' }));
    if (a.is_staff) name.appendChild(h('span', { class: 'cw-badge cw-badge--ink', text: 'Coach' }));
    who.appendChild(name);
    var meta = [p.team ? teamShort(p.team.name) : 'All Godspeed', ago(p.published_at)].join(' · ');
    who.appendChild(h('div', { class: 'cw-post__meta', text: meta }));
    head.appendChild(who);
    if (withMore) head.appendChild(h('button', { class: 'cw-icon-btn', type: 'button', 'aria-label': 'More options', onclick: function () { openMenu(p); } }, I.more));
    return head;
  }

  function card(p) {
    var el = h('article', { class: 'cw-post', 'data-post': p.id, 'aria-label': 'Post by ' + ((p.author || {}).name || 'a Godspeed family') });
    if (p.pinned) el.appendChild(h('div', { class: 'cw-pinned' }, I.pin + '<span>Pinned by coaches</span>'));
    el.appendChild(authorHead(p, true));
    if (p.status === 'hidden') el.appendChild(h('div', { class: 'cw-flag', text: 'Under review. Only you can see this until a coach checks it.' }));
    el.appendChild(carousel(p));

    var actions = h('div', { class: 'cw-actions' });
    var likeBtn = h('button', { class: 'cw-icon-btn cw-like' + (p.liked ? ' is-on' : ''), type: 'button',
      'aria-label': p.liked ? 'Unlike' : 'Like', 'aria-pressed': p.liked ? 'true' : 'false',
      disabled: p.status !== 'live' ? 'disabled' : null, onclick: function () { toggleLike(p.id); } }, p.liked ? HEART_FILLED : I.heart);
    actions.appendChild(likeBtn);
    actions.appendChild(h('button', { class: 'cw-icon-btn', type: 'button', 'aria-label': 'Comments', disabled: p.status !== 'live' ? 'disabled' : null,
      onclick: function () { openComments(p.id); } }, I.comment));
    actions.appendChild(h('button', { class: 'cw-icon-btn', type: 'button', 'aria-label': 'Share or save', onclick: function () { openShare(p, 0); } }, I.share));
    actions.appendChild(h('span', { class: 'cw-spacer' }));
    if (p.media.length > 1) {
      var dots = h('div', { class: 'cw-dots', 'aria-hidden': 'true' });
      p.media.forEach(function (_, i) { dots.appendChild(h('i', { class: i === 0 ? 'is-on' : '' })); });
      dots.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);padding:0';
      actions.style.position = 'relative';
      actions.appendChild(dots);
    }
    el.appendChild(actions);

    var body = h('div', { class: 'cw-post__body' });
    if (p.like_count > 0) body.appendChild(h('div', { class: 'cw-likes', text: plural(p.like_count, 'like', 'likes') }));
    if (p.caption) {
      var cap = h('p', { class: 'cw-caption' });
      cap.appendChild(h('b', { text: (p.author || {}).name || '' }));
      cap.appendChild(document.createTextNode(p.caption));
      body.appendChild(cap);
      if (p.caption.length > 140 || (p.caption.match(/\n/g) || []).length > 2) {
        cap.classList.add('is-clamped');
        var more = h('button', { class: 'cw-more-text', type: 'button', text: 'more', onclick: function () { cap.classList.remove('is-clamped'); more.remove(); } });
        body.appendChild(more);
      }
    }
    if (p.tags && p.tags.length) {
      var tags = h('div', { class: 'cw-tags', 'aria-label': 'Tagged players' });
      p.tags.forEach(function (t) { tags.appendChild(h('span', { class: 'cw-tag' }, I.person + '<span></span>')).lastChild.textContent = t.name; });
      body.appendChild(tags);
    }
    if (p.comment_count > 0) {
      body.appendChild(h('button', { class: 'cw-viewcomments', type: 'button',
        text: p.comment_count === 1 ? 'View 1 comment' : 'View all ' + p.comment_count + ' comments',
        onclick: function () { openComments(p.id); } }));
    }
    el.appendChild(body);
    return el;
  }

  function carousel(p) {
    var wrap = h('div', { class: 'cw-media' });
    var track = h('div', { class: 'cw-media__track', role: 'group', 'aria-roledescription': 'carousel',
      'aria-label': plural(p.media.length, 'item', 'items') });
    var first = p.media[0] || {};
    var ar = first.width && first.height ? Math.max(0.8, Math.min(1.91, first.width / first.height)) : 0.8;
    p.media.forEach(function (m, i) {
      var slide = h('div', { class: 'cw-slide is-loading', 'aria-label': (m.kind === 'video' ? 'Video ' : 'Photo ') + (i + 1) + ' of ' + p.media.length });
      slide.style.setProperty('--ar', String(ar));
      if (m.kind === 'video') {
        var v = h('video', { muted: '', playsinline: '', loop: '', preload: 'none', 'data-path': m.path, 'aria-label': 'Video, ' + dur(m.duration_ms) });
        v.muted = true;
        signed(m.poster).then(function (u) { if (u) v.poster = u; slide.classList.remove('is-loading'); });
        slide.appendChild(v);
        var snd = h('button', { class: 'cw-sound', type: 'button', 'aria-label': 'Turn sound on' }, I.soundOff);
        snd.onclick = function (e) {
          e.stopPropagation();
          v.muted = !v.muted;
          snd.innerHTML = v.muted ? I.soundOff : I.soundOn;
          snd.setAttribute('aria-label', v.muted ? 'Turn sound on' : 'Turn sound off');
          if (!v.muted) ensureVideoSrc(v).then(function () { v.play().catch(function () {}); });
        };
        slide.appendChild(snd);
        watchPlayable(v, slide, p, i, m);
      } else {
        var img = h('img', { alt: p.caption ? 'Photo: ' + p.caption.slice(0, 80) : 'Photo from ' + ((p.author || {}).name || 'a Godspeed family'), decoding: 'async', loading: i === 0 ? 'eager' : 'lazy', draggable: 'false' });
        img.onload = function () { slide.classList.remove('is-loading'); };
        signed(m.path).then(function (u) { if (u) img.src = u; else slide.classList.remove('is-loading'); });
        slide.appendChild(img);
      }
      track.appendChild(slide);
    });
    wrap.appendChild(track);
    var burst = h('div', { class: 'cw-burst', 'aria-hidden': 'true' }, HEART_FILLED);
    wrap.appendChild(burst);
    if (p.media.length > 1) {
      var counter = h('div', { class: 'cw-media__counter', text: '1/' + p.media.length });
      wrap.appendChild(counter);
      track.addEventListener('scroll', function () {
        var i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
        counter.textContent = (i + 1) + '/' + p.media.length;
        var card = wrap.parentNode, dots = card && card.querySelectorAll('.cw-dots i');
        if (dots) Array.prototype.forEach.call(dots, function (d, j) { d.classList.toggle('is-on', j === i); });
      }, { passive: true });
    }
    // Single tap opens the viewer; double tap likes.
    var lastTap = 0, tapTimer = null;
    track.addEventListener('click', function (e) {
      var now = Date.now();
      if (now - lastTap < 280) {
        clearTimeout(tapTimer); lastTap = 0;
        if (p.status !== 'live') return;
        burst.classList.remove('is-on'); void burst.offsetWidth; burst.classList.add('is-on');
        haptic();
        if (!S.byId.get(p.id).liked) toggleLike(p.id);
        return;
      }
      lastTap = now;
      tapTimer = setTimeout(function () {
        var i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
        openViewer(p.id, i);
      }, 280);
      e.preventDefault();
    });
    return wrap;
  }

  function tile(p) {
    var m = p.media[0] || {};
    var t = h('button', { class: 'cw-tile', type: 'button', 'data-post': p.id,
      'aria-label': (m.kind === 'video' ? 'Video' : 'Photo') + ' by ' + ((p.author || {}).name || 'a family') + (p.media.length > 1 ? ', ' + p.media.length + ' items' : ''),
      onclick: function () { openViewer(p.id, 0); } });
    var img = h('img', { alt: '', loading: 'lazy', decoding: 'async' });
    signed(m.kind === 'video' ? m.poster : m.path).then(function (u) { if (u) img.src = u; });
    t.appendChild(img);
    if (p.media.length > 1) t.appendChild(h('span', { class: 'cw-tile__icon' }, I.stack));
    else if (m.kind === 'video') t.appendChild(h('span', { class: 'cw-tile__icon' }, I.play));
    if (m.kind === 'video') t.appendChild(h('span', { class: 'cw-tile__dur', text: dur(m.duration_ms) }));
    if (p.pinned) t.appendChild(h('span', { class: 'cw-tile__pin' }, I.pin));
    return t;
  }

  // ------------------------------------------------- unplayable-video fallback
  // A clip the uploader's phone could not convert (rare: old phones) may use a
  // codec this browser cannot play. Show the poster with a clear way to save it
  // instead of a black box.
  function canPlayCodec(codec) { return !window.CWVideo || window.CWVideo.canPlay(codec); }
  function watchPlayable(v, slide, p, i, m) {
    function show() {
      if (slide.querySelector('.cw-noplay')) return;
      v.removeAttribute('src'); v.setAttribute('data-noplay', '1'); v.controls = false;
      var box = h('div', { class: 'cw-noplay' }, I.play + '<p></p>');
      box.querySelector('p').textContent = "This video can't play in this browser.";
      box.appendChild(h('button', { class: 'cw-noplay__btn', type: 'button', text: 'Save to watch',
        onclick: function (e) { e.stopPropagation(); openShare(S.byId.get(p.id) || p, i); } }));
      slide.appendChild(box);
      var snd = slide.querySelector('.cw-sound'); if (snd) snd.remove();
    }
    if (!canPlayCodec(m.codec)) { show(); return; }
    v.addEventListener('error', function () { if (v.error && (v.error.code === 3 || v.error.code === 4)) show(); });
  }

  // ------------------------------------------------------- video autoplay
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var saveData = navigator.connection && navigator.connection.saveData;
  function ensureVideoSrc(v) {
    if (v.src || v.getAttribute('data-noplay')) return Promise.resolve();
    return signed(v.getAttribute('data-path')).then(function (u) { if (u) { v.src = u; v.preload = 'metadata'; } });
  }
  var vio = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      var v = en.target;
      if (en.isIntersecting && en.intersectionRatio >= 0.6) {
        if (reduceMotion || saveData) return;
        ensureVideoSrc(v).then(function () { if (v.src) v.play().catch(function () {}); });
      } else if (!v.paused) v.pause();
    });
  }, { threshold: [0, 0.6] }) : null;
  function observeVideos() {
    if (!vio) return;
    document.querySelectorAll('.cw-feed video:not([data-obs])').forEach(function (v) { v.setAttribute('data-obs', '1'); vio.observe(v); });
  }

  // ------------------------------------------------------------------ likes
  var likeInflight = new Map();
  function toggleLike(id) {
    var p = S.byId.get(id); if (!p || p.status !== 'live') return;
    var want = !p.liked;
    var next = Object.assign({}, p, { liked: want, like_count: Math.max(0, p.like_count + (want ? 1 : -1)) });
    replacePost(next);
    var btn = document.querySelector('[data-post="' + id + '"] .cw-like');
    if (btn && want) { btn.classList.add('is-pop'); haptic(); }
    syncViewerLike(next);
    // Serialise per post; the server call is a set (idempotent), so the last intent wins.
    var prev = likeInflight.get(id) || Promise.resolve();
    var run = prev.then(function () {
      return api.like(id, want).then(function (r) {
        var cur = S.byId.get(id);
        if (cur && cur.liked === r.liked) { var fixed = Object.assign({}, cur, { like_count: r.like_count }); replacePost(fixed); syncViewerLike(fixed); }
      }).catch(function (e) {
        var cur = S.byId.get(id);
        if (cur) { var back = Object.assign({}, cur, { liked: !want, like_count: Math.max(0, cur.like_count + (want ? -1 : 1)) }); replacePost(back); syncViewerLike(back); }
        toast(e.message);
      });
    });
    likeInflight.set(id, run);
  }

  // ------------------------------------------------------------ dialog base
  var layerStack = [];
  function openLayer(node, opts) {
    opts = opts || {};
    var prevFocus = document.activeElement;
    $('cwLayer').appendChild(node);
    document.body.classList.add('cw-locked');
    var entry = { node: node, prevFocus: prevFocus, onClose: opts.onClose };
    layerStack.push(entry);
    var focusEl = node.querySelector('[autofocus]') || node.querySelector('[role="dialog"]') || node;
    setTimeout(function () { try { focusEl.focus({ preventScroll: true }); } catch (e) { /* no-op */ } }, 30);
    if (opts.scrimClose !== false) node.addEventListener('click', function (e) { if (e.target === node) closeLayer(); });
    return entry;
  }
  function closeLayer() {
    var e = layerStack.pop(); if (!e) return;
    if (e.onClose && e.onClose() === false) { layerStack.push(e); return; }
    e.node.remove();
    if (!layerStack.length) document.body.classList.remove('cw-locked');
    try { if (e.prevFocus) e.prevFocus.focus({ preventScroll: true }); } catch (x) { /* no-op */ }
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && layerStack.length) { e.preventDefault(); closeLayer(); }
    if (e.key === 'Tab' && layerStack.length) {
      var root = layerStack[layerStack.length - 1].node;
      var f = Array.prototype.filter.call(root.querySelectorAll('button,[href],input,textarea,select,[tabindex]:not([tabindex="-1"])'),
        function (x) { return !x.disabled && x.offsetParent !== null; });
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });
  function sheet(title, opts) {
    opts = opts || {};
    var scrim = h('div', { class: 'cw-scrim' + (opts.cls ? ' ' + opts.cls : '') });
    var s = h('div', { class: 'cw-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, tabindex: '-1' });
    s.appendChild(h('div', { class: 'cw-grabber', 'aria-hidden': 'true' }));
    if (opts.head !== false) {
      var head = h('div', { class: 'cw-sheet__head' });
      head.appendChild(opts.left || h('span'));
      head.appendChild(h('h2', { text: title }));
      head.appendChild(opts.right || h('button', { class: 'cw-icon-btn', type: 'button', 'aria-label': 'Close', onclick: closeLayer }, I.close));
      s.appendChild(head);
    }
    var body = h('div', { class: 'cw-sheet__body' });
    s.appendChild(body);
    scrim.appendChild(s);
    return { scrim: scrim, sheet: s, body: body };
  }

  // ------------------------------------------------------------- more menu
  function openMenu(p) {
    var x = sheet('Post options', { head: false });
    var ul = h('ul', { class: 'cw-menu' });
    function item(icon, label, fn, danger) {
      var li = h('li');
      li.appendChild(h('button', { type: 'button', class: danger ? 'is-danger' : '', onclick: function () { closeLayer(); fn(); } }, icon + '<span></span>'));
      li.firstChild.lastChild.textContent = label;
      ul.appendChild(li);
    }
    item(I.share, 'Share or save', function () { openShare(p, 0); });
    (p.tags || []).filter(function (t) { return t.mine; }).forEach(function (t) {
      item(I.tagOff, 'Remove ' + t.name + "'s tag", function () {
        api.untag(p.id, t.athlete_id).then(function () {
          replacePost(Object.assign({}, p, { tags: p.tags.filter(function (x) { return x.athlete_id !== t.athlete_id; }) }));
          toast('Tag removed');
        }).catch(function (e) { toast(e.message); });
      });
    });
    if (p.can_moderate && p.status === 'live') {
      item(I.pin, p.pinned ? 'Unpin' : 'Pin to top', function () {
        api.moderate(p.pinned ? 'unpin' : 'pin', p.id).then(function () { toast(p.pinned ? 'Unpinned' : 'Pinned'); reload(); })
          .catch(function (e) { toast(e.message); });
      });
    }
    if (p.is_mine) item(I.trash, 'Delete post', function () { confirmDelete(p); }, true);
    else if (p.can_moderate) item(I.trash, 'Remove from The Wall', function () { confirmDelete(p); }, true);
    if (!p.is_mine) item(I.flag, 'Report', function () { openReport({ post: p }); }, true);
    x.body.appendChild(ul);
    x.body.appendChild(h('div', { style: 'padding:0 12px 10px' })).appendChild(
      h('button', { class: 'cw-btn', type: 'button', style: 'width:100%;background:var(--gs-bg);color:var(--gs-ink)', text: 'Cancel', onclick: closeLayer }));
    openLayer(x.scrim);
  }

  function confirmDelete(p) {
    var mine = p.is_mine;
    var x = sheet(mine ? 'Delete this post?' : 'Remove this post?', { head: false });
    x.body.appendChild(h('div', { style: 'padding:20px 20px 4px;text-align:center' },
      '<h2 style="margin:0 0 6px;font-size:18px"></h2><p style="margin:0;color:var(--gs-ink-soft)"></p>'));
    x.body.querySelector('h2').textContent = mine ? 'Delete this post?' : 'Remove this post?';
    x.body.querySelector('p').textContent = mine ? 'It comes off The Wall for everyone, along with its likes and comments.' : 'Families will no longer see it. The author is not notified.';
    var row = h('div', { style: 'display:flex;flex-direction:column;gap:8px;padding:16px' });
    var go = h('button', { class: 'cw-btn', type: 'button', style: 'background:var(--gs-danger)', text: mine ? 'Delete' : 'Remove' });
    go.onclick = function () {
      go.disabled = true;
      api.delPost(p.id).then(function (r) {
        closeLayer(); closeViewerIfShowing(p.id); dropPost(p.id); toast(mine ? 'Post deleted' : 'Post removed');
        if (r && r.paths && r.paths.length) sb.storage.from(CFG.bucket).remove(r.paths).catch(function () { /* cleanup job covers it */ });
      }).catch(function (e) { go.disabled = false; toast(e.message); });
    };
    row.appendChild(go);
    row.appendChild(h('button', { class: 'cw-btn', type: 'button', style: 'background:var(--gs-bg);color:var(--gs-ink)', text: 'Cancel', onclick: closeLayer }));
    x.body.appendChild(row);
    openLayer(x.scrim);
  }

  // -------------------------------------------------------------- reporting
  function openReport(target) {
    var x = sheet(target.comment ? 'Report comment' : 'Report post');
    var form = h('form');
    form.appendChild(h('p', { class: 'cw-menu__note', style: 'padding-top:14px', text: 'It will be hidden right away while a coach takes a look. The poster is not told who reported it.' }));
    REPORT_REASONS.forEach(function (r, i) {
      var lab = h('label', { class: 'cw-radio' });
      lab.appendChild(h('input', { type: 'radio', name: 'reason', value: r[0], checked: i === 0 ? 'checked' : null }));
      lab.appendChild(h('span', { text: r[1] }));
      form.appendChild(lab);
    });
    var note = h('textarea', { class: 'cw-textarea cw-report-note', maxlength: '300', placeholder: 'Anything a coach should know (optional)', 'aria-label': 'Note for coaches' });
    var wrap = h('div', { style: 'padding:0 20px' }); wrap.appendChild(note); form.appendChild(wrap);
    var btn = h('button', { class: 'cw-btn', type: 'submit', style: 'width:calc(100% - 40px);margin:16px 20px', text: 'Report' });
    form.appendChild(btn);
    form.onsubmit = function (e) {
      e.preventDefault(); btn.disabled = true;
      var reason = form.querySelector('input[name="reason"]:checked').value;
      api.report({ p_post_id: target.post ? target.post.id : null, p_comment_id: target.comment ? target.comment.id : null, p_reason: reason, p_note: note.value || null })
        .then(function () {
          closeLayer();
          if (target.post) { closeViewerIfShowing(target.post.id); dropPost(target.post.id); }
          if (target.onDone) target.onDone();
          toast('Thanks. A coach will review it.');
        }).catch(function (e) { btn.disabled = false; toast(e.message); });
    };
    x.body.appendChild(form);
    openLayer(x.scrim);
  }

  // ------------------------------------------------------------- comments
  function openComments(postId) {
    var p = S.byId.get(postId); if (!p) return;
    var x = sheet('Comments');
    var list = h('ul', { class: 'cw-comments', 'aria-live': 'polite' });
    x.body.appendChild(list);
    list.appendChild(h('li', { class: 'cw-menu__note', style: 'padding:24px;text-align:center', text: 'Loading comments' }));

    var foot = h('div', { class: 'cw-sheet__foot' });
    var line = h('form', { class: 'cw-compose-line' });
    var ta = h('textarea', { rows: '1', maxlength: '500', placeholder: 'Add a comment', 'aria-label': 'Add a comment', autofocus: matchMedia('(hover: hover)').matches ? 'autofocus' : null });
    var send = h('button', { class: 'cw-link', type: 'submit', text: 'Post', disabled: 'disabled' });
    line.appendChild(ta); line.appendChild(send); foot.appendChild(line); x.sheet.appendChild(foot);
    ta.addEventListener('input', function () {
      send.disabled = !ta.value.trim();
      ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px';
    });
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!send.disabled) line.requestSubmit(); } });

    var clientId = uuid();
    line.onsubmit = function (e) {
      e.preventDefault();
      var body = ta.value.trim(); if (!body) return;
      var pending = commentRow({ id: 'pending', body: body, created_at: null, is_mine: true, author: { name: (S.ctx.me || {}).name, is_staff: S.ctx.is_staff } }, p, true);
      list.appendChild(pending); pending.scrollIntoView({ block: 'end' });
      if (list.firstChild && list.firstChild.classList.contains('cw-menu__note')) list.firstChild.remove();
      send.disabled = true; ta.value = ''; ta.style.height = 'auto';
      api.addComment(p.id, clientId, body).then(function (c) {
        clientId = uuid();   // next comment gets a new key; a retry of this one reuses the old
        pending.replaceWith(commentRow(c, p));
        var cur = S.byId.get(p.id); if (cur) replacePost(Object.assign({}, cur, { comment_count: cur.comment_count + 1 }));
      }).catch(function (err) {
        pending.remove(); ta.value = body; send.disabled = false; toast(err.message);
      });
    };

    api.comments(p.id).then(function (rows) {
      list.innerHTML = '';
      if (!rows.length) list.appendChild(h('li', { class: 'cw-menu__note', style: 'padding:28px;text-align:center', text: 'No comments yet. Say something nice.' }));
      rows.forEach(function (c) { list.appendChild(commentRow(c, p)); });
    }).catch(function (e) { list.innerHTML = ''; list.appendChild(h('li', { class: 'cw-menu__note', style: 'padding:24px', text: e.message })); });
    openLayer(x.scrim);
  }
  function commentRow(c, p, pending) {
    var li = h('li', { class: 'cw-comment' + (pending ? ' is-pending' : ''), 'data-comment': c.id });
    li.appendChild(h('span', { class: 'cw-avatar' + (c.author && c.author.is_staff ? ' cw-avatar--staff' : ''), 'aria-hidden': 'true', text: initials(shownName(c.author)) }));
    var main = h('div', { class: 'cw-comment__main' });
    var lineEl = h('p', { class: 'cw-comment__line' });
    lineEl.appendChild(h('b', { text: shownName(c.author) }));
    lineEl.appendChild(document.createTextNode(c.body));
    main.appendChild(lineEl);
    var meta = h('div', { class: 'cw-comment__meta' });
    meta.appendChild(h('span', { text: pending ? 'Posting' : (c.status === 'hidden' ? 'Under review' : ago(c.created_at)) }));
    if (!pending) {
      if (c.is_mine || c.can_moderate) meta.appendChild(h('button', { class: 'cw-link cw-link--muted', type: 'button', text: c.is_mine ? 'Delete' : 'Remove', onclick: function () {
        api.delComment(c.id).then(function () {
          li.remove();
          var cur = S.byId.get(p.id); if (cur && c.status === 'live') replacePost(Object.assign({}, cur, { comment_count: Math.max(0, cur.comment_count - 1) }));
        }).catch(function (e) { toast(e.message); });
      } }));
      if (!c.is_mine) meta.appendChild(h('button', { class: 'cw-link cw-link--muted', type: 'button', text: 'Report', onclick: function () {
        openReport({ comment: c, onDone: function () {
          li.remove();
          var cur = S.byId.get(p.id); if (cur) replacePost(Object.assign({}, cur, { comment_count: Math.max(0, cur.comment_count - 1) }));
        } });
      } }));
    }
    main.appendChild(meta);
    li.appendChild(main);
    return li;
  }

  // ------------------------------------------------------- share and save
  function fileName(p, m, i) {
    var d = new Date(p.published_at || Date.now());
    var ext = m.kind === 'video' ? (/\.mov$/i.test(m.path) ? 'mov' : 'mp4') : (/\.webp$/i.test(m.path) ? 'webp' : 'jpg');
    return 'Godspeed_' + d.toISOString().slice(0, 10) + '_' + (i + 1) + '.' + ext;
  }
  function fetchFile(p, i) {
    var m = p.media[i];
    return signed(m.path).then(function (u) {
      if (!u) throw { message: 'That file is not available.' };
      return fetch(u).then(function (r) { if (!r.ok) throw { message: 'Download failed.' }; return r.blob(); });
    }).then(function (b) { return new File([b], fileName(p, m, i), { type: b.type || (m.kind === 'video' ? 'video/mp4' : 'image/jpeg') }); });
  }
  function saveFile(file) {
    var url = URL.createObjectURL(file);
    var a = h('a', { href: url, download: file.name }); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  function openShare(p, startIndex) {
    var x = sheet('Share', { head: false });
    var ul = h('ul', { class: 'cw-menu' });
    x.body.appendChild(h('p', { class: 'cw-menu__note', style: 'padding-top:16px', text: 'Only share photos of your own player outside Godspeed. Other families may not have agreed to it.' }));
    function item(icon, label, fn) {
      var b = h('button', { type: 'button' }, icon + '<span></span>');
      b.lastChild.textContent = label;
      b.onclick = function () { b.disabled = true; b.lastChild.textContent = 'Preparing'; fn().then(closeLayer, function (e) { b.disabled = false; b.lastChild.textContent = label; if (e && e.name !== 'AbortError') toast(e.message || 'Could not share that file.'); }); };
      var li = h('li'); li.appendChild(b); ul.appendChild(li);
    }
    var canShareFiles = !!(navigator.canShare && window.File && navigator.canShare({ files: [new File([''], 'x.jpg', { type: 'image/jpeg' })] }));
    var idx = startIndex || 0;
    var label = p.media.length > 1 ? ' (' + (p.media[idx].kind === 'video' ? 'this video' : 'this photo') + ')' : '';
    if (canShareFiles) item(I.share, 'Share to apps' + label, function () {
      return fetchFile(p, idx).then(function (f) { return navigator.share({ files: [f], title: 'Godspeed Basketball' }); });
    });
    item(I.download, 'Save to device' + label, function () { return fetchFile(p, idx).then(saveFile); });
    if (p.media.length > 1) item(I.download, 'Save all ' + p.media.length, function () {
      return Promise.all(p.media.map(function (_, i) { return fetchFile(p, i); })).then(function (files) {
        if (canShareFiles && navigator.canShare({ files: files })) return navigator.share({ files: files, title: 'Godspeed Basketball' });
        files.forEach(function (f, i) { setTimeout(function () { saveFile(f); }, i * 350); });
      });
    });
    x.body.appendChild(ul);
    x.body.appendChild(h('div', { style: 'padding:0 12px 10px' })).appendChild(
      h('button', { class: 'cw-btn', type: 'button', style: 'width:100%;background:var(--gs-bg);color:var(--gs-ink)', text: 'Cancel', onclick: closeLayer }));
    openLayer(x.scrim);
  }

  // ------------------------------------------------------------------ viewer
  var viewer = null;
  function openViewer(postId, index) {
    var p = S.byId.get(postId); if (!p) return;
    var root = h('div', { class: 'cw-viewer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Post viewer', tabindex: '-1' });
    var top = h('div', { class: 'cw-viewer__top' });
    top.appendChild(h('button', { class: 'cw-icon-btn', type: 'button', 'aria-label': 'Close', onclick: closeLayer }, I.close));
    var count = h('div', { class: 'cw-viewer__count', 'aria-live': 'polite' });
    top.appendChild(count);
    top.appendChild(h('button', { class: 'cw-icon-btn', type: 'button', 'aria-label': 'More options', onclick: function () { openMenu(S.byId.get(postId)); } }, I.more));
    root.appendChild(top);

    var track = h('div', { class: 'cw-viewer__track' });
    var burst = h('div', { class: 'cw-burst', 'aria-hidden': 'true' }, HEART_FILLED);
    p.media.forEach(function (m) {
      var s = h('div', { class: 'cw-viewer__slide' });
      if (m.kind === 'video') {
        var v = h('video', { controls: '', playsinline: '', preload: 'metadata', 'aria-label': 'Video' });
        signed(m.poster).then(function (u) { if (u) v.poster = u; });
        if (canPlayCodec(m.codec)) signed(m.path).then(function (u) { if (u) v.src = u; });
        s.appendChild(v);
        watchPlayable(v, s, p, p.media.indexOf(m), m);
      } else {
        var img = h('img', { alt: p.caption ? p.caption.slice(0, 120) : 'Photo', decoding: 'async' });
        signed(m.path).then(function (u) { if (u) img.src = u; });
        s.appendChild(img);
      }
      track.appendChild(s);
    });
    var stage = h('div', { style: 'position:relative;flex:1;display:flex;min-height:0' });
    stage.appendChild(track); stage.appendChild(burst);
    if (p.media.length > 1) {
      stage.appendChild(h('button', { class: 'cw-viewer__nav cw-viewer__nav--prev', type: 'button', 'aria-label': 'Previous', onclick: function () { go(-1); } }, I.chevL));
      stage.appendChild(h('button', { class: 'cw-viewer__nav cw-viewer__nav--next', type: 'button', 'aria-label': 'Next', onclick: function () { go(1); } }, I.chevR));
    }
    root.appendChild(stage);

    var bar = h('div', { class: 'cw-viewer__bar' });
    var acts = h('div', { class: 'cw-actions' });
    var likeBtn = h('button', { class: 'cw-icon-btn cw-like', type: 'button', onclick: function () { toggleLike(postId); } });
    acts.appendChild(likeBtn);
    var likeCount = h('span', { style: 'font-weight:600;font-size:14px;min-width:16px' });
    acts.appendChild(likeCount);
    acts.appendChild(h('button', { class: 'cw-icon-btn', type: 'button', 'aria-label': 'Comments', onclick: function () { openComments(postId); } }, I.comment));
    acts.appendChild(h('button', { class: 'cw-icon-btn', type: 'button', 'aria-label': 'Share or save', onclick: function () { openShare(S.byId.get(postId), cur()); } }, I.share));
    bar.appendChild(acts);
    if (p.caption) {
      var cap = h('p', { class: 'cw-viewer__caption' });
      cap.appendChild(h('b', { text: ((p.author || {}).name || '') + ' ' }));
      cap.appendChild(document.createTextNode(p.caption));
      bar.appendChild(cap);
    }
    root.appendChild(bar);

    function cur() { return Math.round(track.scrollLeft / Math.max(1, track.clientWidth)); }
    function go(d) { track.scrollTo({ left: (cur() + d) * track.clientWidth, behavior: reduceMotion ? 'auto' : 'smooth' }); }
    function updateCount() {
      var i = cur();
      count.textContent = p.media.length > 1 ? (i + 1) + ' of ' + p.media.length : '';
      track.querySelectorAll('video').forEach(function (v, j) { if (j !== i && !v.paused) v.pause(); });
    }
    track.addEventListener('scroll', function () { window.requestAnimationFrame(updateCount); }, { passive: true });
    var lastTap = 0;
    track.addEventListener('click', function (e) {
      if (e.target.tagName === 'VIDEO') return;
      var now = Date.now();
      if (now - lastTap < 280) {
        lastTap = 0; var cp = S.byId.get(postId);
        burst.classList.remove('is-on'); void burst.offsetWidth; burst.classList.add('is-on'); haptic();
        if (cp && !cp.liked) toggleLike(postId);
      } else lastTap = now;
    });
    root.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); });

    viewer = { postId: postId, likeBtn: likeBtn, likeCount: likeCount };
    syncViewerLike(p);
    openLayer(root, { scrimClose: false, onClose: function () { root.querySelectorAll('video').forEach(function (v) { v.pause(); }); viewer = null; } });
    requestAnimationFrame(function () { track.scrollLeft = (index || 0) * track.clientWidth; updateCount(); });
  }
  function syncViewerLike(p) {
    if (!viewer || viewer.postId !== p.id) return;
    viewer.likeBtn.classList.toggle('is-on', !!p.liked);
    viewer.likeBtn.innerHTML = p.liked ? HEART_FILLED : I.heart;
    viewer.likeBtn.setAttribute('aria-label', p.liked ? 'Unlike' : 'Like');
    viewer.likeBtn.setAttribute('aria-pressed', p.liked ? 'true' : 'false');
    viewer.likeCount.textContent = p.like_count ? String(p.like_count) : '';
  }
  function closeViewerIfShowing(id) {
    if (viewer && viewer.postId === id) {
      while (layerStack.length && layerStack[layerStack.length - 1].node.classList.contains('cw-viewer') === false) closeLayer();
      closeLayer();
    }
  }

  // ===================================================================== POSTING
  // Image: decode, downscale, re-encode JPEG. Re-encoding drops all EXIF (GPS included).
  function loadImage(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return viaImg(file); });
    }
    return viaImg(file);
  }
  function viaImg(file) {
    return new Promise(function (res, rej) {
      var u = URL.createObjectURL(file), im = new Image();
      im.onload = function () { res(im); setTimeout(function () { URL.revokeObjectURL(u); }, 0); };
      im.onerror = function () { URL.revokeObjectURL(u); rej({ message: 'This photo format is not supported. On iPhone, set Settings, Camera, Formats to Most Compatible, or send a screenshot.' }); };
      im.src = u;
    });
  }
  function canvasBlob(canvas, type, q) {
    return new Promise(function (res, rej) { canvas.toBlob(function (b) { b ? res(b) : rej({ message: 'Could not process that photo.' }); }, type, q); });
  }
  function processImage(file) {
    return loadImage(file).then(function (src) {
      var w = src.width, hgt = src.height, k = Math.min(1, CFG.maxImageEdge / Math.max(w, hgt));
      var cw = Math.round(w * k), ch = Math.round(hgt * k);
      var c = document.createElement('canvas'); c.width = cw; c.height = ch;
      var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(src, 0, 0, cw, ch);
      if (src.close) src.close();
      return canvasBlob(c, 'image/jpeg', 0.86).then(function (b) {
        if (b.size > CFG.maxImageBytes) return canvasBlob(c, 'image/jpeg', 0.7);
        return b;
      }).then(function (b) {
        return { kind: 'image', blob: b, mime: 'image/jpeg', width: cw, height: ch, preview: URL.createObjectURL(b) };
      });
    });
  }

  // Video: community-wall-video.js converts anything that is not H.264 (iPhone
  // HEVC, Android WebM, oversized clips) so every family's browser can play it,
  // and strips location metadata. This wrapper only adapts its result.
  function processVideo(file, onProgress, signal) {
    if (file.type && !/^video\//.test(file.type)) return Promise.reject({ message: 'That file is not a video.' });
    if (!window.CWVideo) return Promise.reject({ message: 'Video tools did not load. Refresh the page and try again.' });
    return window.CWVideo.prepare(file, { onProgress: onProgress, signal: signal }).then(function (r) {
      if (r.needsPoster) return legacyPoster(file, r);
      return { kind: 'video', blob: r.blob, mime: r.mime, codec: r.codec, width: r.width, height: r.height,
               duration_ms: r.duration_ms, poster: r.poster, preview: URL.createObjectURL(r.poster),
               transcoded: r.transcoded, audioDropped: r.audioDropped };
    });
  }

  // Only used when the converter library could not load: read duration and a
  // poster frame with a plain <video> element. The blob is already GPS-scrubbed.
  function legacyPoster(file, r) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file);
      var v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
      var done = false;
      function fail(m) { if (done) return; done = true; URL.revokeObjectURL(url); rej({ message: m }); }
      var timeout = setTimeout(function () { fail('Could not read that video. Try a shorter clip.'); }, 20000);
      v.onerror = function () { clearTimeout(timeout); fail('That video format is not supported on this phone.'); };
      v.onloadedmetadata = function () {
        if (v.duration * 1000 > CFG.maxVideoMs) { clearTimeout(timeout); return fail('Videos can be up to 60 seconds. Trim it on your phone and try again.'); }
        try { v.currentTime = Math.min(0.25, v.duration / 3); } catch (e) { /* seeked fallback below */ }
      };
      v.onseeked = function () {
        if (done) return;
        clearTimeout(timeout);
        var w = v.videoWidth || 720, hgt = v.videoHeight || 1280, k = Math.min(1, 1080 / Math.max(w, hgt));
        var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(hgt * k);
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        canvasBlob(c, 'image/jpeg', 0.8).then(function (poster) {
          done = true; URL.revokeObjectURL(url);
          res({ kind: 'video', blob: r.blob, mime: r.mime, codec: null, width: w, height: hgt, duration_ms: Math.round(v.duration * 1000),
                poster: poster, preview: URL.createObjectURL(poster), transcoded: false, audioDropped: false });
        }).catch(function (e) { fail(e.message || 'Could not process that video.'); });
      };
    });
  }

  // Upload with progress. 409 / "Duplicate" = already uploaded on a prior try = success.
  function uploadObject(path, blob, mime, onProgress) {
    return new Promise(function (res, rej) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', CFG.url + '/storage/v1/object/' + CFG.bucket + '/' + path.split('/').map(encodeURIComponent).join('/'));
      xhr.setRequestHeader('Authorization', 'Bearer ' + S.session.access_token);
      xhr.setRequestHeader('apikey', CFG.anon);
      xhr.setRequestHeader('x-upsert', 'false');
      xhr.setRequestHeader('Content-Type', mime);
      xhr.setRequestHeader('cache-control', 'max-age=31536000');
      xhr.upload.onprogress = function (e) { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) return res();
        if (xhr.status === 409 || /Duplicate|already exists/i.test(xhr.responseText)) return res();
        rej({ code: 'UPLOAD_FAILED', message: 'Upload failed (' + xhr.status + '). Tap Share to retry.' });
      };
      xhr.onerror = function () { rej({ code: 'NETWORK', message: MESSAGES.NETWORK }); };
      xhr.send(blob);
    });
  }

  var composer = null;
  function openComposer() {
    if (composer) return;
    var ctx = S.ctx;
    composer = {
      clientId: uuid(), items: [], team: S.team && teamCanPost(S.team) ? S.team : null, tags: new Set(),
      busy: false, reservation: null, uploaded: new Set(), preparing: false,
      abort: new AbortController()
    };
    var cancel = h('button', { class: 'cw-link cw-link--muted', type: 'button', text: 'Cancel', onclick: closeLayer });
    var shareBtn = h('button', { class: 'cw-link', type: 'button', text: 'Share', disabled: 'disabled' });
    var x = sheet('New post', { cls: 'cw-compose', left: cancel, right: shareBtn });
    var progress = h('div', { class: 'cw-progress cw-hide' }, '<i></i>');
    x.sheet.insertBefore(progress, x.body);
    var err = h('div', { class: 'cw-error cw-hide', role: 'alert' });
    var note = h('div', { class: 'cw-note cw-hide', role: 'status' });

    var strip = h('div', { class: 'cw-strip', 'aria-label': 'Selected photos and videos' });
    var add = h('button', { class: 'cw-thumb cw-thumb--add', type: 'button', 'aria-label': 'Add photos or videos' }, I.plus + '<span>Add</span>');
    add.onclick = function () { $('cwFileInput').click(); };

    var capWrap = h('div', { class: 'cw-field' });
    capWrap.appendChild(h('label', { for: 'cwCaption', text: 'Caption' }));
    var cap = h('textarea', { id: 'cwCaption', class: 'cw-textarea', maxlength: String(CFG.captionMax), placeholder: 'What happened? Big shot, team win, practice grind', rows: '3' });
    var counter = h('div', { class: 'cw-counter', text: '0/' + CFG.captionMax });
    cap.addEventListener('input', function () {
      counter.textContent = cap.value.length + '/' + CFG.captionMax;
      cap.style.height = 'auto'; cap.style.height = Math.min(240, cap.scrollHeight) + 'px';
    });
    capWrap.appendChild(cap); capWrap.appendChild(counter);

    var teamWrap = h('div', { class: 'cw-field' });
    teamWrap.appendChild(h('div', { class: 'cw-label', text: 'Team' }));
    var teamPills = h('div', { class: 'cw-pills', role: 'group', 'aria-label': 'Team' });
    teamWrap.appendChild(teamPills);
    teamWrap.appendChild(h('p', { class: 'cw-help', text: 'Every Godspeed family sees every post. The team label lets families filter.' }));

    var tagWrap = h('div', { class: 'cw-field' });
    tagWrap.appendChild(h('div', { class: 'cw-label', text: 'Tag players' }));
    var tagPills = h('div', { class: 'cw-pills', role: 'group', 'aria-label': 'Tag players' });
    var tagHelp = h('p', { class: 'cw-help' });
    tagWrap.appendChild(tagPills); tagWrap.appendChild(tagHelp);

    x.body.appendChild(err);
    x.body.appendChild(note);
    x.body.appendChild(strip);
    x.body.appendChild(capWrap);
    x.body.appendChild(teamWrap);
    x.body.appendChild(tagWrap);
    x.body.appendChild(h('div', { class: 'cw-privacy' }, I.lock + '<span>Only signed-in Godspeed families can see The Wall. Location data is removed from photos and videos before they upload.</span>'));

    function renderTeams() {
      teamPills.innerHTML = '';
      var opts = [{ id: null, name: 'All Godspeed' }].concat((ctx.teams || []).filter(function (t) { return t.can_post; }));
      opts.forEach(function (t) {
        teamPills.appendChild(h('button', { class: 'cw-pill', type: 'button', 'aria-pressed': composer.team === t.id ? 'true' : 'false',
          text: t.id ? teamShort(t.name) : t.name, onclick: function () { composer.team = t.id; renderTeams(); renderTags(); } }));
      });
    }
    function renderTags() {
      tagPills.innerHTML = '';
      var list = (ctx.taggable || []).filter(function (a) {
        return a.mine || !composer.team || (a.team_ids || []).indexOf(composer.team) >= 0;
      });
      var unsigned = [];
      list.forEach(function (a) {
        if (!a.release_ok) { unsigned.push(a.name); return; }
        var on = composer.tags.has(a.athlete_id);
        tagPills.appendChild(h('button', { class: 'cw-pill', type: 'button', 'aria-pressed': on ? 'true' : 'false',
          text: a.name + (a.jersey != null ? ' #' + a.jersey : ''),
          onclick: function () {
            if (composer.tags.has(a.athlete_id)) composer.tags.delete(a.athlete_id);
            else if (composer.tags.size < 15) composer.tags.add(a.athlete_id);
            renderTags();
          } }));
      });
      if (!tagPills.children.length) tagPills.appendChild(h('span', { class: 'cw-help', style: 'margin:0', text: 'No players to tag for this team yet.' }));
      tagHelp.innerHTML = '';
      if (unsigned.length) {
        tagHelp.appendChild(document.createTextNode('To tag ' + unsigned.join(' and ') + ', sign the Social Media Release in '));
        tagHelp.appendChild(h('a', { href: 'parent-portal.html#documents', text: 'Documents' }));
        tagHelp.appendChild(document.createTextNode('.'));
      } else tagHelp.textContent = 'Only players whose families signed the Social Media Release can be tagged.';
    }
    function renderStrip() {
      strip.innerHTML = '';
      composer.items.forEach(function (it, i) {
        var t = h('div', { class: 'cw-thumb' + (composer.uploaded.has(i) ? ' is-done' : ''), 'data-i': String(i) });
        t.appendChild(h('img', { src: it.preview, alt: it.kind === 'video' ? 'Selected video' : 'Selected photo' }));
        if (it.kind === 'video') t.appendChild(h('span', { class: 'cw-thumb__dur', text: dur(it.duration_ms) }));
        t.appendChild(h('span', { class: 'cw-thumb__bar' }, '<i></i>'));
        if (!composer.busy && !composer.reservation) t.appendChild(h('button', { class: 'cw-thumb__x', type: 'button', 'aria-label': 'Remove', onclick: function () {
          URL.revokeObjectURL(it.preview); composer.items.splice(i, 1); renderStrip();
        } }, I.close));
        strip.appendChild(t);
      });
      if (!composer.reservation && composer.items.length < CFG.maxFiles) strip.appendChild(add);
      shareBtn.disabled = !composer.items.length || composer.busy || composer.preparing;
    }
    function showErr(m) { err.textContent = m; err.classList.toggle('cw-hide', !m); }
    function showNote(m) { note.textContent = m; note.classList.toggle('cw-hide', !m); }
    function setProgress(frac) { progress.classList.toggle('cw-hide', frac === null); progress.firstChild.style.width = Math.round((frac || 0) * 100) + '%'; }

    composer.addFiles = function (files) {
      showErr('');
      var room = CFG.maxFiles - composer.items.length;
      var list = Array.prototype.slice.call(files, 0, room);
      if (files.length > room) toast('Up to ' + CFG.maxFiles + ' per post');
      shareBtn.disabled = true; shareBtn.textContent = 'Preparing';
      composer.preparing = true;
      var chain = Promise.resolve();
      list.forEach(function (f) {
        chain = chain.then(function () {
          if (!composer || composer.abort.signal.aborted) return;
          var isVideo = /^video\//.test(f.type) || /\.(mov|mp4|m4v|webm|3gp)$/i.test(f.name);
          var job = isVideo
            ? processVideo(f, function (frac, label) {
                setProgress(Math.max(0.02, frac));
                shareBtn.textContent = Math.round(frac * 100) + '%';
                showNote(label + '. Keep this screen open.');
              }, composer.abort.signal)
            : processImage(f);
          return job.then(function (it) {
            if (!composer) return;
            composer.items.push(it); renderStrip();
            if (it.audioDropped) toast('Sound could not be kept on this phone');
          }).catch(function (e) { if (e && e.code === 'CANCELED') return; showErr(e.message || 'Could not add that file.'); });
        });
      });
      chain.then(function () {
        if (!composer) return;
        composer.preparing = false; setProgress(null); showNote('');
        shareBtn.textContent = 'Share'; renderStrip();
      });
    };

    shareBtn.onclick = function () {
      if (composer.busy || !composer.items.length) return;
      composer.busy = true; showErr(''); renderStrip();
      shareBtn.textContent = 'Sharing'; shareBtn.disabled = true; setProgress(0.02);
      var items = composer.items;
      var total = items.reduce(function (s, it) { return s + it.blob.size + (it.poster ? it.poster.size : 0); }, 0);
      var loaded = {};
      function bump(key, bytes) { loaded[key] = bytes; var sum = 0; Object.keys(loaded).forEach(function (k) { sum += loaded[k]; }); setProgress(Math.min(0.97, sum / total)); }

      var reserve = composer.reservation ? Promise.resolve(composer.reservation) : api.createPost({
        p_client_id: composer.clientId, p_team_id: composer.team, p_caption: cap.value.trim(),
        p_media: items.map(function (it) {
          return { kind: it.kind, mime: it.mime, bytes: it.blob.size, width: it.width, height: it.height,
                   duration_ms: it.duration_ms || null, codec: it.kind === 'video' ? (it.codec || null) : null };
        }),
        p_athlete_ids: Array.from(composer.tags)
      });
      reserve.then(function (r) {
        composer.reservation = r; renderStrip();
        // Two uploads at a time keeps phones responsive on cellular.
        var jobs = [];
        r.uploads.forEach(function (u) {
          var it = items[u.position];
          jobs.push({ key: 'm' + u.position, i: u.position, path: u.path, blob: it.blob, mime: it.mime });
          if (u.poster_path) jobs.push({ key: 'p' + u.position, i: u.position, path: u.poster_path, blob: it.poster, mime: 'image/jpeg' });
        });
        var q = jobs.slice();
        function worker() {
          var j = q.shift(); if (!j) return Promise.resolve();
          var bar = strip.querySelector('[data-i="' + j.i + '"] .cw-thumb__bar i');
          return uploadObject(j.path, j.blob, j.mime, function (f) { bump(j.key, f * j.blob.size); if (bar && j.key[0] === 'm') bar.style.width = Math.round(f * 100) + '%'; })
            .then(function () {
              bump(j.key, j.blob.size);
              if (j.key[0] === 'm') { composer.uploaded.add(j.i); var t = strip.querySelector('[data-i="' + j.i + '"]'); if (t) t.classList.add('is-done'); }
            }).then(worker);
        }
        return Promise.all([worker(), worker()]).then(function () { return api.publish(r.post_id); });
      }).then(function (post) {
        setProgress(1);
        index(post);
        if (!S.team || S.team === (post.team && post.team.id)) {
          if (S.filter !== 'my_players') {
            S.posts.unshift(post);
            var f = $('cwFeed'); showState(null);
            var node = S.view === 'grid' ? tile(post) : card(post);
            f.insertBefore(node, S.pinned.length ? f.children[S.pinned.length] || null : f.firstChild);
            observeVideos();
          }
        }
        composer.items.forEach(function (it) { URL.revokeObjectURL(it.preview); });
        composer.busy = false; composer.done = true;
        closeLayer();
        window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
        toast('Posted to The Wall');
      }).catch(function (e) {
        composer.busy = false; setProgress(null);
        shareBtn.textContent = 'Retry'; shareBtn.disabled = false;
        showErr(e.message || 'Could not post. Tap Retry.');
        if (e.code && /BAD_|MEDIA_RELEASE|FILE_TOO|VIDEO_TOO|CAPTION|TOO_MANY/.test(e.code)) { composer.reservation = null; composer.clientId = uuid(); shareBtn.textContent = 'Share'; }
        renderStrip();
      });
    };

    renderTeams(); renderTags(); renderStrip();
    openLayer(x.scrim, { scrimClose: false, onClose: function () {
      if (composer && composer.busy) { toast('Still uploading. Hang tight.'); return false; }
      if (composer && !composer.done && (composer.items.length || composer.preparing) && !confirm('Discard this post?')) return false;
      if (composer) composer.abort.abort();
      composer = null;
    } });
    if (!composer.items.length) setTimeout(function () { $('cwFileInput').click(); }, 60);
  }
  function teamCanPost(id) { return (S.ctx.teams || []).some(function (t) { return t.id === id && t.can_post; }); }
  $('cwFileInput').addEventListener('change', function (e) {
    var files = e.target.files; if (!files || !files.length) return;
    if (!composer) openComposer();
    composer.addFiles(files);
    e.target.value = '';
  });

  // ------------------------------------------------------------ review queue
  function toggleReview() {
    S.reviewOpen = !S.reviewOpen;
    $('cwReview').classList.toggle('cw-hide', !S.reviewOpen);
    $('cwFilters').classList.toggle('cw-hide', S.reviewOpen);
    $('cwFab').classList.toggle('cw-hide', S.reviewOpen);
    $('cwReviewBtn').setAttribute('aria-pressed', S.reviewOpen ? 'true' : 'false');
    if (S.reviewOpen) { $('cwFeed').innerHTML = ''; $('cwEnd').classList.add('cw-hide'); showState(null); renderReview(); }
    else reload();
  }
  function renderReview() {
    var root = $('cwReview'); root.innerHTML = '';
    root.appendChild(h('p', { class: 'cw-menu__note', style: 'padding:12px 16px', text: 'Loading' }));
    api.queue().then(function (q) {
      root.innerHTML = '';
      var n = q.posts.length + q.comments.length;
      $('cwReviewCount').textContent = n ? String(n) : '';
      if (!n) { root.appendChild(h('div', { class: 'cw-state' }, I.flag + '<h2>Nothing to review</h2><p>Reported posts and comments land here.</p>')); return; }
      if (q.posts.length) root.appendChild(h('h2', { text: 'Posts' }));
      q.posts.forEach(function (p) {
        var it = h('div', { class: 'cw-review__item' });
        it.appendChild(authorHead(p, false));
        var th = h('div', { class: 'cw-review__thumbs' });
        p.media.forEach(function (m) { var im = h('img', { alt: '' }); signed(m.kind === 'video' ? m.poster : m.path).then(function (u) { if (u) im.src = u; }); th.appendChild(im); });
        it.appendChild(th);
        if (p.caption) it.appendChild(h('p', { class: 'cw-caption', text: p.caption }));
        it.appendChild(reportList(p.reports));
        it.appendChild(reviewActions(function (a) { return api.moderate(a, p.id); }, it));
        root.appendChild(it);
      });
      if (q.comments.length) root.appendChild(h('h2', { text: 'Comments' }));
      q.comments.forEach(function (c) {
        var it = h('div', { class: 'cw-review__item' });
        var line = h('p', { class: 'cw-comment__line' }); line.appendChild(h('b', { text: c.author.name })); line.appendChild(document.createTextNode(c.body));
        it.appendChild(line);
        it.appendChild(reportList(c.reports));
        it.appendChild(reviewActions(function (a) { return api.moderate(a, null, c.id); }, it));
        root.appendChild(it);
      });
    }).catch(function (e) { root.innerHTML = ''; root.appendChild(h('p', { class: 'cw-menu__note', style: 'padding:16px', text: e.message })); });
  }
  function reportList(reports) {
    var ul = h('ul', { class: 'cw-review__reports' });
    var label = {}; REPORT_REASONS.forEach(function (r) { label[r[0]] = r[1]; });
    (reports || []).forEach(function (r) {
      ul.appendChild(h('li', { text: 'Reported: ' + (label[r.reason] || r.reason) + (r.note ? ' · "' + r.note + '"' : '') }));
    });
    return ul;
  }
  function reviewActions(fn, item) {
    var row = h('div', { class: 'cw-review__actions' });
    function act(a, text, cls) {
      row.appendChild(h('button', { class: 'cw-link ' + (cls || ''), type: 'button', text: text, onclick: function () {
        fn(a).then(function () {
          item.remove(); toast(a === 'restore' ? 'Back on The Wall' : 'Removed');
          var c = parseInt($('cwReviewCount').textContent || '0', 10) - 1; $('cwReviewCount').textContent = c > 0 ? String(c) : '';
        }).catch(function (e) { toast(e.message); });
      } }));
    }
    act('restore', 'Restore'); act('remove', 'Remove', 'cw-link--danger');
    return row;
  }

  // ------------------------------------------------------------------ polling
  function poll() {
    if (document.hidden || S.reviewOpen || !S.ctx || !S.ctx.is_member) return;
    api.feed({ team: S.team, filter: S.filter, limit: 1 }).then(function (r) {
      var p = (r.posts || [])[0];
      if (p && S.newestTs && p.published_at > S.newestTs && !S.byId.has(p.id)) $('cwNewPill').classList.remove('cw-hide');
    }).catch(function () { /* silent */ });
  }

  // ------------------------------------------------- portal dot + first visit
  // The parent portal shows a dot on "The Wall" when anything is newer than this.
  function markSeen() {
    var newest = S.pinned.concat(S.posts).reduce(function (m, p) {
      return p.published_at && p.published_at > m ? p.published_at : m;
    }, '');
    try { localStorage.setItem('gs_wall_seen_at', newest || new Date().toISOString()); } catch (e) { /* optional */ }
  }
  // One-time welcome card. Shown once per device, then never again.
  function maybeIntro() {
    try { if (localStorage.getItem('gs_wall_intro_seen')) return; localStorage.setItem('gs_wall_intro_seen', '1'); } catch (e) { return; }
    var card = h('section', { class: 'cw-intro', 'aria-label': 'Welcome to The Wall' });
    card.appendChild(h('h2', { text: 'Welcome to The Wall' }));
    card.appendChild(h('p', { text: 'Share photos and videos with Godspeed families. Only current families can see them.' }));
    var row = h('div', { class: 'cw-intro__row' });
    var go = h('button', { class: 'cw-btn', type: 'button', text: 'Post your first photo' });
    var later = h('button', { class: 'cw-intro__later', type: 'button', text: 'Not now' });
    go.onclick = function () { card.remove(); openComposer(); };
    later.onclick = function () { card.remove(); };
    row.appendChild(go); row.appendChild(later); card.appendChild(row);
    $('cw-main').insertBefore(card, $('cw-main').firstChild);
  }
  // Coaches arrive from the coach portal; send "< Portal" back there.
  function setBackLink() {
    var from = '';
    try {
      if (/coach-portal\.html/.test(document.referrer)) sessionStorage.setItem('gs_wall_from', 'coach');
      else if (/parent-portal\.html/.test(document.referrer)) sessionStorage.setItem('gs_wall_from', 'parent');
      from = sessionStorage.getItem('gs_wall_from') || '';
    } catch (e) { /* optional */ }
    var back = document.querySelector('.cw-top__back');
    if (back && from === 'coach') { back.href = 'coach-portal.html'; back.setAttribute('aria-label', 'Back to the coach portal'); }
  }

  // -------------------------------------------------------------------- boot
  function boot() {
    setBackLink();
    $('cwViewIcon').innerHTML = S.view === 'grid' ? I.list : I.grid;
    $('cwFeed').classList.toggle('is-grid', S.view === 'grid');
    $('cw-main').classList.toggle('is-grid', S.view === 'grid');
    document.body.classList.toggle('cw-grid', S.view === 'grid');
    skeletons(2);
    sb.auth.getSession().then(function (r) {
      S.session = r.data && r.data.session;
      if (!S.session) { $('cwFeed').innerHTML = ''; showState('signin'); return; }
      sb.auth.onAuthStateChange(function (_e, session) { if (session) S.session = session; });
      return api.context().then(function (ctx) {
        S.ctx = ctx;
        if (!ctx.is_member) { $('cwFeed').innerHTML = ''; showState('member'); return; }
        if (S.team && !(ctx.teams || []).some(function (t) { return t.id === S.team; })) S.team = null;
        renderFilters();
        $('cwFab').classList.remove('cw-hide');
        if (ctx.is_staff) {
          $('cwReviewBtn').classList.remove('cw-hide');
          $('cwReviewCount').textContent = ctx.pending_review ? String(ctx.pending_review) : '';
        }
        return reload().then(function () { markSeen(); maybeIntro(); });
      });
    }).catch(function () { $('cwFeed').innerHTML = ''; showState('error'); });

    $('cwViewBtn').onclick = function () { if (!S.reviewOpen) setView(S.view === 'grid' ? 'feed' : 'grid'); };
    $('cwReviewBtn').onclick = toggleReview;
    $('cwFab').onclick = openComposer;
    $('cwNewPill').onclick = function () { window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }); reload(); };

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) {
        if (en[0].isIntersecting && S.ctx && S.ctx.is_member && !S.reviewOpen && S.posts.length) loadMore(false);
      }, { rootMargin: '800px 0px' }).observe($('cwSentinel'));
    }
    setInterval(poll, CFG.pollMs);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });
  }
  boot();

})();
