/**
 * GODSPEED BASKETBALL. Coach first-run onboarding.
 *
 * Load order in coach-portal.html: auth-supabase.js, coach-documents.js,
 * coach-portal.js, then this file.
 *
 * What it does
 *   1. Restores a session on page load (invite link, magic link, or a saved
 *      session) and routes a staff account into the portal without the login form.
 *   2. Wraps enterPortal(): a coach whose onboarding is not complete sees the
 *      wizard instead of the dashboard. Directors and founders skip the wizard
 *      if they are already set up; new ones go through it once too.
 *   3. Wizard steps: password (invite/magic-link only), profile, documents,
 *      teams, done. State lives in Supabase (get_coach_onboarding /
 *      complete_coach_step / sign_coach_document). Nothing is trusted from
 *      localStorage.
 *   4. Adds a "Staff Onboarding" sidebar view for directors: every coach's
 *      progress, signed count, last sign-in.
 *
 * Every write is read back from the server before the UI says "saved".
 * No emojis. Coach-facing copy at a 6th grade level. No em dashes.
 */
(function () {
  'use strict';

  const STAFF_ROLES = ['coach', 'director', 'founder'];
  const BUCKET = 'coach-media';
  const STEPS = ['password', 'profile', 'documents', 'teams', 'done'];
  const STEP_LABELS = { password: 'Password', profile: 'Profile', documents: 'Documents', teams: 'Teams', done: 'Done' };

  let _state = null;          // last get_coach_onboarding() result
  let _role = null;
  let _arrivedFromLink = false;
  let _enterPortalOriginal = null;
  let _currentStep = null;

  // ── helpers ───────────────────────────────────────────────
  function sb() { return window.auth && window.auth.getSupabaseClient ? window.auth.getSupabaseClient() : null; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function el(id) { return document.getElementById(id); }
  function docs() { return Array.isArray(window.COACH_DOCUMENTS) ? window.COACH_DOCUMENTS : []; }
  function requiredDocs() { return docs().filter(d => d.required); }
  function isSigned(doc) { return !!(_state && (_state.signed || []).find(s => s.document_id === doc.id && s.version === doc.version)); }
  function normName(s) { return String(s || '').toLowerCase().replace(/[^a-z]/g, ''); }
  function today() { return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }); }
  function publicHeadshotUrl(path) {
    const client = sb();
    if (!client || !path) return '';
    const { data } = client.storage.from(BUCKET).getPublicUrl(path);
    return data && data.publicUrl ? data.publicUrl : '';
  }

  async function rpc(name, args) {
    const client = sb();
    if (!client) throw new Error('offline');
    const { data, error } = await client.rpc(name, args || {});
    if (error) throw new Error(error.message || name + ' failed');
    if (data && data.error) throw new Error(data.error.message || data.error.code || name + ' failed');
    return data;
  }

  async function refreshState() {
    _state = await rpc('get_coach_onboarding');
    return _state;
  }

  function needsOnboarding(state) {
    return !(state && state.steps && state.steps.done);
  }

  // ── 1. Session restore (invite link, magic link, saved session) ──
  async function restoreSession() {
    const hash = (window.location.hash || '').replace(/^#/, '');
    const h = new URLSearchParams(hash);
    if (h.get('error') || h.get('error_code')) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
      const box = el('coach-login-error');
      if (box) {
        box.textContent = h.get('error_code') === 'otp_expired'
          ? 'That link has expired or was already used. Ask Coach Scott for a fresh invite, or sign in with your email and password.'
          : 'We could not sign you in from that link. Sign in with your email and password, or ask Coach Scott for a fresh invite.';
        box.style.display = 'block';
      }
      return;
    }
    const fromLink = hash.indexOf('access_token') !== -1;
    const linkType = h.get('type') || '';
    if (!window.auth || !window.auth.ensureClient) return;
    if (!fromLink && !window.auth.isLoggedIn()) return;

    if (!(await window.auth.ensureClient())) return;
    // Give supabase-js a tick to consume the hash.
    if (fromLink) await new Promise(r => setTimeout(r, 400));

    const user = await window.auth.getCurrentUser();
    if (!user) return;
    const profile = await window.auth.getProfile(user.id);
    if (!profile || !STAFF_ROLES.includes(profile.role) || profile.approved === false) return;

    if (fromLink) history.replaceState(null, '', window.location.pathname + window.location.search);
    _arrivedFromLink = fromLink && (linkType === 'invite' || linkType === 'magiclink' || linkType === 'recovery' || linkType === '');
    localStorage.setItem('gba_user_email', user.email || '');
    localStorage.setItem('gba_user_id', user.id || '');
    window.enterPortal(profile.role);
  }

  // ── 2. enterPortal wrapper ─────────────────────────────────
  function installGate() {
    _enterPortalOriginal = window.enterPortal;
    if (typeof _enterPortalOriginal !== 'function') return;
    window.enterPortal = async function (role) {
      _role = role;
      try {
        const state = await refreshState();
        if (needsOnboarding(state)) {
          if (!_arrivedFromLink && !state.steps.password) {
            // Signed in with a password, so that step is already true.
            _state = await rpc('complete_coach_step', { p_step: 'password' });
          }
          showWizard();
          return;
        }
      } catch (e) {
        console.warn('[coach-onboarding] state check failed, letting the portal open:', e.message);
      }
      _enterPortalOriginal(role);
      mountStaffNav(role);
      if (!el('staff-onboarding-nav')) mountWelcomeKitNav();
    };
  }

  function finishToPortal() {
    hideWizard();
    _enterPortalOriginal(_role || 'coach');
    mountStaffNav(_role);
    if (!el('staff-onboarding-nav')) mountWelcomeKitNav();
  }

  // ── 3. Wizard ─────────────────────────────────────────────
  function firstIncompleteStep() {
    const s = _state.steps || {};
    if (!s.password) return 'password';
    if (!s.profile) return 'profile';
    if (!s.documents) return 'documents';
    if (!s.teams) return 'teams';
    return 'done';
  }

  function showWizard() {
    const login = el('coach-login');
    const dash = el('coach-dashboard');
    if (login) login.style.display = 'none';
    if (dash) dash.style.display = 'none';
    const nav = document.querySelector('nav.navbar');
    if (nav) nav.style.setProperty('display', 'none', 'important');
    let root = el('coach-onboarding');
    if (!root) {
      root = document.createElement('div');
      root.id = 'coach-onboarding';
      document.body.appendChild(root);
    }
    root.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    renderStep(firstIncompleteStep());
  }

  function hideWizard() {
    const root = el('coach-onboarding');
    if (root) root.style.display = 'none';
    document.body.style.overflow = '';
  }

  function progressHtml(current) {
    const idx = STEPS.indexOf(current);
    const s = _state.steps || {};
    return `<ol class="cob-steps" aria-label="Setup progress">${STEPS.map((k, i) => {
      const done = !!s[k] || i < idx;
      const cls = k === current ? 'is-current' : (done ? 'is-done' : '');
      return `<li class="${cls}"><span class="cob-dot">${done && k !== current ? checkSvg() : (i + 1)}</span><span class="cob-step-label">${STEP_LABELS[k]}</span></li>`;
    }).join('')}</ol>`;
  }

  function checkSvg() {
    return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  }

  function shell(current, title, sub, body, footer) {
    const first = (_state.full_name || '').split(' ')[0] || 'Coach';
    return `
      <div class="cob-card" role="dialog" aria-labelledby="cob-title" aria-modal="true">
        <div class="cob-brand">GODSPEED<span>BASKETBALL</span></div>
        ${progressHtml(current)}
        <h1 id="cob-title" class="cob-title">${esc(title)}</h1>
        <p class="cob-sub">${sub}</p>
        <div class="cob-body">${body}</div>
        <div id="cob-error" class="cob-error" role="alert" aria-live="polite" style="display:none"></div>
        <div class="cob-footer">${footer}</div>
        <p class="cob-fine">Signed in as ${esc(_state.email || '')}. Hey ${esc(first)}, this takes about five minutes. <a href="#" id="cob-signout">Sign out</a></p>
      </div>`;
  }

  function setError(msg) {
    const box = el('cob-error');
    if (!box) return;
    if (!msg) { box.style.display = 'none'; box.textContent = ''; return; }
    box.textContent = msg;
    box.style.display = 'block';
  }

  function busy(btnId, on, label) {
    const b = el(btnId);
    if (!b) return;
    b.disabled = !!on;
    if (label) b.textContent = label;
  }

  function renderStep(step) {
    _currentStep = step;
    const root = el('coach-onboarding');
    if (!root) return;
    const r = { password: renderPassword, profile: renderProfile, documents: renderDocuments, teams: renderTeams, done: renderDone }[step];
    root.innerHTML = r();
    const firstInput = root.querySelector('input, textarea, button.cob-primary');
    if (firstInput) firstInput.focus();
    const so = el('cob-signout');
    if (so) so.onclick = async (ev) => { ev.preventDefault(); try { if (window.auth && window.auth.logout) await window.auth.logout(); } finally { window.location.href = 'coach-portal.html'; } };
  }

  // Step: password
  function renderPassword() {
    const body = `
      <label class="cob-label" for="cob-pw">New password</label>
      <input id="cob-pw" type="password" class="cob-input" autocomplete="new-password" placeholder="At least 10 characters">
      <label class="cob-label" for="cob-pw2">Type it again</label>
      <input id="cob-pw2" type="password" class="cob-input" autocomplete="new-password" placeholder="Same password">
      <p class="cob-help">Use this with your email the next time you sign in.</p>`;
    const footer = `<button id="cob-next" class="cob-primary" type="button">Save password</button>`;
    setTimeout(() => { const b = el('cob-next'); if (b) b.onclick = savePassword; }, 0);
    return shell('password', 'Set your password', 'Your invite link signed you in. Pick a password so you can come back any time.', body, footer);
  }

  async function savePassword() {
    setError('');
    const pw = (el('cob-pw') || {}).value || '';
    const pw2 = (el('cob-pw2') || {}).value || '';
    if (pw.length < 10) return setError('Make it at least 10 characters.');
    if (pw !== pw2) return setError('Those two do not match.');
    busy('cob-next', true, 'Saving...');
    try {
      const client = sb();
      const { error } = await client.auth.updateUser({ password: pw });
      if (error) throw new Error(error.message);
      _state = await rpc('complete_coach_step', { p_step: 'password' });
      renderStep('profile');
    } catch (e) {
      setError('We could not save that password. ' + (e.message || 'Please try again.'));
      busy('cob-next', false, 'Save password');
    }
  }

  // Step: profile
  function renderProfile() {
    const s = _state;
    const img = publicHeadshotUrl(s.headshot_path);
    const body = `
      <div class="cob-row">
        <div class="cob-avatar" id="cob-avatar" style="${img ? `background-image:url('${esc(img)}')` : ''}">${img ? '' : '<span>Photo</span>'}</div>
        <div class="cob-avatar-actions">
          <label class="cob-secondary" for="cob-photo">Add a headshot</label>
          <input id="cob-photo" type="file" accept="image/jpeg,image/png,image/webp" style="display:none">
          <p class="cob-help">Optional now. It goes on the About page. Square, face forward, 5 MB max.</p>
        </div>
      </div>
      <label class="cob-label" for="cob-name">Full name</label>
      <input id="cob-name" class="cob-input" type="text" autocomplete="name" value="${esc(s.full_name || '')}" placeholder="First and last name">
      <label class="cob-label" for="cob-title-in">Title</label>
      <input id="cob-title-in" class="cob-input" type="text" value="${esc(s.title || 'Coach')}" placeholder="Coach">
      <label class="cob-label" for="cob-phone">Mobile number</label>
      <input id="cob-phone" class="cob-input" type="tel" autocomplete="tel" inputmode="tel" value="${esc(s.phone || '')}" placeholder="555-555-5555">
      <label class="cob-label" for="cob-bio">Two or three sentences about you <span class="cob-count" id="cob-bio-count">0 / 600</span></label>
      <textarea id="cob-bio" class="cob-input cob-textarea" maxlength="600" placeholder="Where you played, what you coach, what you want players to leave with.">${esc(s.bio || '')}</textarea>`;
    const footer = `<button id="cob-next" class="cob-primary" type="button">Save and continue</button>`;
    setTimeout(() => {
      const b = el('cob-next'); if (b) b.onclick = saveProfile;
      const bio = el('cob-bio'); const cnt = el('cob-bio-count');
      const upd = () => { if (cnt && bio) cnt.textContent = bio.value.length + ' / 600'; };
      if (bio) { bio.addEventListener('input', upd); upd(); }
      const photo = el('cob-photo'); if (photo) photo.addEventListener('change', uploadHeadshot);
      const phone = el('cob-phone');
      if (phone) phone.addEventListener('input', function () {
        const d = this.value.replace(/\D/g, '').slice(0, 10);
        this.value = d.length > 6 ? d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6) : d.length > 3 ? d.slice(0, 3) + '-' + d.slice(3) : d;
      });
    }, 0);
    return shell('profile', 'Tell families who you are', 'Parents see your name, title, photo, and bio. Your number is for directors only.', body, footer);
  }

  let _pendingHeadshotPath = null;
  async function uploadHeadshot(ev) {
    setError('');
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return setError('That photo is over 5 MB. Pick a smaller one.');
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
    if (!ext) return setError('Use a JPG, PNG, or WebP photo.');
    const client = sb();
    const path = `${_state.user_id}/headshot.${ext}`;
    const av = el('cob-avatar');
    if (av) av.innerHTML = '<span>Uploading</span>';
    const { error } = await client.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' });
    if (error) { if (av) av.innerHTML = '<span>Photo</span>'; return setError('Upload failed. ' + (error.message || 'Try again.')); }
    _pendingHeadshotPath = path;
    if (av) { av.innerHTML = ''; av.style.backgroundImage = `url('${publicHeadshotUrl(path)}?v=${Date.now()}')`; }
  }

  async function saveProfile() {
    setError('');
    const name = ((el('cob-name') || {}).value || '').trim();
    const title = ((el('cob-title-in') || {}).value || '').trim();
    const phone = ((el('cob-phone') || {}).value || '').trim();
    const bio = ((el('cob-bio') || {}).value || '').trim();
    if (name.split(/\s+/).length < 2) return setError('Type your first and last name.');
    if (phone.replace(/\D/g, '').length !== 10) return setError('Type a 10 digit mobile number.');
    if (bio.length < 40) return setError('Give families at least a sentence or two.');
    busy('cob-next', true, 'Saving...');
    try {
      _state = await rpc('complete_coach_step', {
        p_step: 'profile',
        p_payload: { full_name: name, title: title || 'Coach', phone, bio, headshot_path: _pendingHeadshotPath }
      });
      // Read back: the server is the source of truth.
      if (!_state.steps || !_state.steps.profile) throw new Error('not saved');
      renderStep('documents');
    } catch (e) {
      setError('We could not save your profile. ' + (e.message || 'Please try again.'));
      busy('cob-next', false, 'Save and continue');
    }
  }

  // Step: documents
  function renderDocuments() {
    const list = requiredDocs().map((d, i) => {
      const signed = isSigned(d);
      return `
        <div class="cob-doc ${signed ? 'is-signed' : ''}" id="cob-doc-${esc(d.id)}">
          <button type="button" class="cob-doc-head" data-doc="${esc(d.id)}" aria-expanded="false">
            <span class="cob-doc-n">${signed ? checkSvg() : (i + 1)}</span>
            <span class="cob-doc-t"><strong>${esc(d.title)}</strong><small>${esc(d.summary)}</small></span>
            <span class="cob-doc-state">${signed ? 'Signed' : 'Read and sign'}</span>
          </button>
          <div class="cob-doc-body" style="display:none">
            <div class="cob-doc-text">${fill(d.html)}</div>
            ${signed ? `<p class="cob-help">Signed on ${esc(signedDate(d))}.</p>` : `
            <label class="cob-check"><input type="checkbox" id="cob-read-${esc(d.id)}"> I read this and I agree.</label>
            <label class="cob-label" for="cob-sig-${esc(d.id)}">Type your full name to sign</label>
            <input id="cob-sig-${esc(d.id)}" class="cob-input cob-sig" type="text" autocomplete="off" placeholder="${esc(_state.full_name || 'Full name')}">
            <button type="button" class="cob-primary cob-sign" data-doc="${esc(d.id)}">Sign ${esc(d.title)}</button>`}
          </div>
        </div>`;
    }).join('');
    const allSigned = requiredDocs().every(isSigned);
    const body = `<div class="cob-docs">${list}</div>`;
    const footer = `<button id="cob-next" class="cob-primary" type="button" ${allSigned ? '' : 'disabled'}>Continue</button>`;
    setTimeout(() => {
      document.querySelectorAll('.cob-doc-head').forEach(h => h.onclick = () => toggleDoc(h.getAttribute('data-doc')));
      document.querySelectorAll('.cob-sign').forEach(b => b.onclick = () => signDoc(b.getAttribute('data-doc')));
      const n = el('cob-next'); if (n) n.onclick = finishDocuments;
      const firstOpen = requiredDocs().find(d => !isSigned(d));
      if (firstOpen) toggleDoc(firstOpen.id);
    }, 0);
    const done = requiredDocs().filter(isSigned).length;
    return shell('documents', 'Sign the coach documents', `${done} of ${requiredDocs().length} signed. Read each one, check the box, type your name.`, body, footer);
  }

  function fill(html) {
    return html
      .replace(/{coach_name}/g, esc(_state.full_name || 'Coach'))
      .replace(/{coach_email}/g, esc(_state.email || ''))
      .replace(/{today}/g, esc(today()));
  }

  function signedDate(d) {
    const s = (_state.signed || []).find(x => x.document_id === d.id && x.version === d.version);
    return s ? new Date(s.signed_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
  }

  function toggleDoc(id) {
    const card = el('cob-doc-' + id);
    if (!card) return;
    const body = card.querySelector('.cob-doc-body');
    const head = card.querySelector('.cob-doc-head');
    const open = body.style.display !== 'none';
    document.querySelectorAll('.cob-doc-body').forEach(b => b.style.display = 'none');
    document.querySelectorAll('.cob-doc-head').forEach(h => h.setAttribute('aria-expanded', 'false'));
    if (!open) { body.style.display = 'block'; head.setAttribute('aria-expanded', 'true'); card.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }

  async function signDoc(id) {
    setError('');
    const d = docs().find(x => x.id === id);
    if (!d) return;
    const read = el('cob-read-' + id);
    const sig = ((el('cob-sig-' + id) || {}).value || '').trim();
    if (!read || !read.checked) return setError('Check the box to confirm you read it.');
    if (normName(sig) !== normName(_state.full_name)) return setError('Type your name exactly as it appears in your profile: ' + (_state.full_name || ''));
    const btn = document.querySelector(`.cob-sign[data-doc="${CSS.escape(id)}"]`);
    if (btn) { btn.disabled = true; btn.textContent = 'Signing...'; }
    try {
      const res = await rpc('sign_coach_document', {
        p_document_id: d.id, p_document_title: d.title, p_document_version: d.version,
        p_signature: sig, p_team: null, p_user_agent: navigator.userAgent
      });
      if (!res || !res.success) throw new Error('not recorded');
      await refreshState();
      if (!isSigned(d)) throw new Error('signature did not persist');
      renderStep('documents');
    } catch (e) {
      setError('We could not record that signature. ' + (e.message || 'Please try again.') + ' Nothing was signed.');
      if (btn) { btn.disabled = false; btn.textContent = 'Sign ' + d.title; }
    }
  }

  async function finishDocuments() {
    setError('');
    busy('cob-next', true, 'Saving...');
    try {
      _state = await rpc('complete_coach_step', {
        p_step: 'documents',
        p_payload: { required: requiredDocs().map(d => ({ document_id: d.id, version: d.version })) }
      });
      if (!_state.steps || !_state.steps.documents) throw new Error('not saved');
      renderStep('teams');
    } catch (e) {
      setError(e.message || 'Please try again.');
      busy('cob-next', false, 'Continue');
    }
  }

  // Step: teams
  function renderTeams() {
    const chosen = new Set(_state.team_ids || []);
    const teams = _state.teams || [];
    const body = teams.length ? `<div class="cob-teams">${teams.map(t => `
      <label class="cob-team ${chosen.has(t.id) ? 'is-on' : ''}">
        <input type="checkbox" value="${esc(t.id)}" ${chosen.has(t.id) ? 'checked' : ''}>
        <span class="cob-team-name">${esc(t.name)}</span>
        <span class="cob-team-age">${esc(t.age_group || '')}</span>
      </label>`).join('')}</div>` : '<p class="cob-help">No active teams yet. You can pick teams later from the portal.</p>';
    const footer = `<button id="cob-next" class="cob-primary" type="button">Confirm teams</button>`;
    setTimeout(() => {
      document.querySelectorAll('.cob-team input').forEach(i => i.addEventListener('change', () => i.closest('.cob-team').classList.toggle('is-on', i.checked)));
      const n = el('cob-next'); if (n) n.onclick = saveTeams;
    }, 0);
    return shell('teams', 'Which teams are you with?', 'Pick every team you coach or help with. A director can change this later.', body, footer);
  }

  async function saveTeams() {
    setError('');
    const ids = Array.from(document.querySelectorAll('.cob-team input:checked')).map(i => i.value);
    busy('cob-next', true, 'Saving...');
    try {
      _state = await rpc('complete_coach_step', { p_step: 'teams', p_payload: { team_ids: ids } });
      if (!_state.steps || !_state.steps.teams) throw new Error('not saved');
      renderStep('done');
    } catch (e) {
      setError('We could not save your teams. ' + (e.message || 'Please try again.'));
      busy('cob-next', false, 'Confirm teams');
    }
  }

  // Step: done
  function renderDone() {
    const body = `
      <ul class="cob-summary">
        <li>${checkSvg()} Password set</li>
        <li>${checkSvg()} Profile saved</li>
        <li>${checkSvg()} ${requiredDocs().length} documents signed</li>
        <li>${checkSvg()} ${(_state.team_ids || []).length} team${(_state.team_ids || []).length === 1 ? '' : 's'} confirmed</li>
      </ul>
      <p class="cob-help">Next: read the welcome kit in the portal sidebar. It covers your first two weeks, gym rules, and how grading works.</p>`;
    const footer = `<button id="cob-next" class="cob-primary" type="button">Open the Coach Portal</button>`;
    setTimeout(() => { const n = el('cob-next'); if (n) n.onclick = finishAll; }, 0);
    return shell('done', 'You are set', 'Welcome to the staff. Brotherhood. Habits. Success.', body, footer);
  }

  async function finishAll() {
    setError('');
    busy('cob-next', true, 'Opening...');
    try {
      _state = await rpc('complete_coach_step', { p_step: 'done' });
      if (!_state.steps || !_state.steps.done) throw new Error('not saved');
      finishToPortal();
    } catch (e) {
      setError(e.message || 'Please try again.');
      busy('cob-next', false, 'Open the Coach Portal');
    }
  }

  // ── 4. Staff Onboarding view (directors) ──────────────────
  function mountStaffNav(role) {
    if (role !== 'director' && role !== 'founder') return;
    if (el('staff-onboarding-nav')) return;
    const anchor = el('academy-nav');
    if (!anchor || !anchor.parentNode) return;
    const wrap = document.createElement('div');
    wrap.id = 'staff-onboarding-nav';
    wrap.innerHTML = `
      <div class="sidebar-title" style="margin-top: 1.5rem;">Staff</div>
      <div class="team-nav-item" id="staff-onboarding-item" style="display:flex;align-items:center;gap:12px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.7" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
        <span>Staff Onboarding</span>
      </div>
      ${el('welcome-kit-nav') ? '' : `<a class="team-nav-item" href="coach-welcome-kit.html" style="display:flex;align-items:center;gap:12px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.7" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
        <span>Welcome Kit</span>
      </a>`}`;
    anchor.parentNode.insertBefore(wrap, anchor.nextSibling);
    el('staff-onboarding-item').onclick = openStaffView;
  }

  function mountWelcomeKitNav() {
    if (el('welcome-kit-nav')) return;
    const anchor = el('academy-nav');
    if (!anchor || !anchor.parentNode) return;
    const wrap = document.createElement('div');
    wrap.id = 'welcome-kit-nav';
    wrap.innerHTML = `<a class="team-nav-item" href="coach-welcome-kit.html" style="display:flex;align-items:center;gap:12px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.7" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
        <span>Welcome Kit</span></a>`;
    anchor.appendChild(wrap);
  }

  async function openStaffView() {
    const main = document.querySelector('.dashboard-main');
    if (!main) return;
    let view = el('staff-view');
    if (!view) {
      view = document.createElement('div');
      view.id = 'staff-view';
      const header = main.querySelector('.dashboard-header');
      if (header && header.nextSibling) main.insertBefore(view, header.nextSibling); else main.appendChild(view);
    }
    main.querySelectorAll('div[id$="-view"]').forEach(v => { if (v !== view) v.style.display = 'none'; });
    document.querySelectorAll('.team-nav-item.active, .segment-btn.active').forEach(n => n.classList.remove('active'));
    el('staff-onboarding-item').classList.add('active');
    const tabs = el('view-tabs'); if (tabs) tabs.style.display = 'none';
    const title = el('view-title'); if (title) title.textContent = 'Staff Onboarding';
    view.style.display = 'block';
    view.innerHTML = '<p class="text-sub">Loading staff...</p>';
    try {
      const rows = await rpc('list_coach_onboarding');
      view.innerHTML = staffTable(rows || []);
    } catch (e) {
      view.innerHTML = `<p class="text-sub">Could not load staff. ${esc(e.message || '')}</p>`;
    }
  }

  function staffTable(rows) {
    const cell = (ts) => ts ? `<span class="cob-pill is-done">${checkSvg()}</span>` : '<span class="cob-pill">Open</span>';
    const fmt = (ts) => ts ? new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Never';
    return `
      <div class="cob-staff-wrap">
        <table class="cob-staff">
          <thead><tr><th>Coach</th><th>Role</th><th>Teams</th><th>Password</th><th>Profile</th><th>Documents</th><th>Teams set</th><th>Done</th><th>Last sign-in</th></tr></thead>
          <tbody>${rows.map(r => `
            <tr>
              <td><div class="cob-staff-name">${r.headshot_path ? `<img src="${esc(publicHeadshotUrl(r.headshot_path))}" alt="">` : '<span class="cob-staff-initial">' + esc((r.full_name || r.email || '?').charAt(0).toUpperCase()) + '</span>'}<div><strong>${esc(r.full_name || 'No name yet')}</strong><small>${esc(r.email)}</small></div></div></td>
              <td>${esc(r.role)}</td>
              <td>${(r.team_names || []).map(esc).join(', ') || '<span class="text-sub">None</span>'}</td>
              <td>${cell(r.steps.password)}</td>
              <td>${cell(r.steps.profile)}</td>
              <td>${cell(r.steps.documents)} <small>${r.signed_count}/${requiredDocs().length}</small></td>
              <td>${cell(r.steps.teams)}</td>
              <td>${cell(r.steps.done)}</td>
              <td>${fmt(r.last_sign_in_at)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        <p class="text-sub" style="margin-top:12px">To add a coach: Supabase, Authentication, Users, Add user, Send invitation. Then set their role to coach in profiles. The invite link brings them straight to this setup.</p>
      </div>`;
  }

  // When any regular team view is chosen, put the tabs back and hide the staff view.
  function wrapSwitchTeamView() {
    const orig = window.switchTeamView;
    if (typeof orig !== 'function' || orig.__cobWrapped) return;
    const wrapped = function (viewName, btn) {
      const sv = el('staff-view'); if (sv) sv.style.display = 'none';
      const tabs = el('view-tabs'); if (tabs) tabs.style.display = '';
      const item = el('staff-onboarding-item'); if (item) item.classList.remove('active');
      return orig.apply(this, arguments);
    };
    wrapped.__cobWrapped = true;
    window.switchTeamView = wrapped;
  }

  // ── styles ─────────────────────────────────────────────────
  function injectStyles() {
    if (el('coach-onboarding-css')) return;
    const css = document.createElement('style');
    css.id = 'coach-onboarding-css';
    css.textContent = `
#coach-onboarding h1,#coach-onboarding h3,#coach-onboarding h4,#coach-onboarding button,#coach-onboarding strong,#coach-onboarding small,#coach-onboarding label,#coach-onboarding .cob-doc-state,#staff-view th,#staff-view td,#staff-view small,#staff-view strong{text-transform:none;letter-spacing:normal}
#coach-onboarding{position:fixed;inset:0;z-index:9000;display:none;align-items:flex-start;justify-content:center;overflow:auto;padding:32px 16px;background:radial-gradient(circle at 50% 0%,#F2F2F7 0%,#E5E5EA 100%);font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1d1d1f}
.cob-card{width:100%;max-width:640px;background:rgba(255,255,255,.92);backdrop-filter:blur(40px);border-radius:24px;padding:36px 36px 28px;box-shadow:0 20px 40px rgba(0,0,0,.10)}
.cob-brand{font-weight:800;font-size:15px;letter-spacing:.02em;margin-bottom:20px}.cob-brand span{color:#0071E3}
.cob-steps{list-style:none;display:flex;gap:6px;padding:0;margin:0 0 26px}
.cob-steps li{flex:1;display:flex;align-items:center;gap:8px;font-size:12px;color:#86868b}
.cob-steps li .cob-dot{width:24px;height:24px;border-radius:50%;background:#e9e9eb;display:inline-flex;align-items:center;justify-content:center;font-weight:600;font-size:12px;color:#6e6e73;flex-shrink:0}
.cob-steps li.is-current{color:#1d1d1f;font-weight:600}.cob-steps li.is-current .cob-dot{background:#0071E3;color:#fff}
.cob-steps li.is-done .cob-dot{background:#34C759;color:#fff}
.cob-step-label{white-space:nowrap}@media(max-width:520px){.cob-step-label{display:none}}
.cob-title{font-size:26px;line-height:1.15;font-weight:700;letter-spacing:-.02em;margin:0 0 6px}
.cob-sub{margin:0 0 22px;color:#6e6e73;font-size:15px;line-height:1.5}
.cob-label{display:flex;justify-content:space-between;font-size:13px;font-weight:600;color:#3a3a3c;margin:14px 0 6px}
.cob-count{font-weight:400;color:#86868b}
.cob-input{width:100%;padding:13px 14px;border-radius:12px;background:#F2F2F7;border:1px solid transparent;font-size:16px;font-family:inherit;transition:all .15s}
.cob-input:focus{outline:none;background:#fff;border-color:#0071E3;box-shadow:0 0 0 4px rgba(0,113,227,.12)}
.cob-textarea{min-height:110px;resize:vertical;line-height:1.5}
.cob-help{font-size:13px;color:#86868b;margin:8px 0 0;line-height:1.5}
.cob-error{margin-top:14px;padding:12px 14px;border-radius:12px;background:rgba(255,59,48,.10);color:#D70015;font-size:14px;line-height:1.4}
.cob-footer{margin-top:22px;display:flex;gap:10px;justify-content:flex-end}
.cob-primary{background:#0071E3;color:#fff;border:none;border-radius:12px;padding:13px 22px;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit;transition:transform .1s,opacity .15s}
.cob-primary:hover{opacity:.92}.cob-primary:active{transform:scale(.98)}.cob-primary:disabled{opacity:.45;cursor:default}
.cob-secondary{display:inline-block;background:rgba(0,113,227,.10);color:#0071E3;border-radius:10px;padding:9px 14px;font-size:14px;font-weight:600;cursor:pointer}
.cob-fine{margin:18px 0 0;font-size:12px;color:#86868b;text-align:center}
.cob-row{display:flex;gap:18px;align-items:center;margin-bottom:6px}
.cob-avatar{width:84px;height:84px;border-radius:50%;background:#e9e9eb center/cover no-repeat;display:flex;align-items:center;justify-content:center;font-size:12px;color:#6e6e73;flex-shrink:0}
.cob-docs{display:flex;flex-direction:column;gap:10px}
.cob-doc{border:1px solid #e5e5ea;border-radius:16px;background:#fff;overflow:hidden}
.cob-doc.is-signed{border-color:rgba(52,199,89,.45)}
.cob-doc-head{width:100%;display:flex;align-items:center;gap:14px;padding:14px 16px;background:none;border:none;text-align:left;cursor:pointer;font-family:inherit}
.cob-doc-n{width:28px;height:28px;border-radius:50%;background:#e9e9eb;display:inline-flex;align-items:center;justify-content:center;font-weight:600;font-size:13px;color:#3a3a3c;flex-shrink:0}
.cob-doc.is-signed .cob-doc-n{background:#34C759;color:#fff}
.cob-doc-t{flex:1;display:flex;flex-direction:column;gap:2px}.cob-doc-t strong{font-size:15px}.cob-doc-t small{font-size:13px;color:#86868b}
.cob-doc-state{font-size:12px;font-weight:600;color:#0071E3;white-space:nowrap}.cob-doc.is-signed .cob-doc-state{color:#34C759}
.cob-doc-body{padding:0 16px 18px;border-top:1px solid #f2f2f7}
.cob-doc-text{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1d1d1f;max-height:360px;overflow:auto;padding:14px 4px 6px;border-bottom:1px solid #f2f2f7;margin-bottom:12px}
.cob-doc-text h3{font-size:19px;margin:6px 0 2px}.cob-doc-text h4{font-size:15px;margin:16px 0 4px}.cob-doc-text p{margin:6px 0}.cob-doc-text .doc-meta{font-size:12px;color:#86868b;margin-bottom:12px}
.cob-check{display:flex;align-items:center;gap:10px;font-size:15px;margin:8px 0 4px;cursor:pointer}.cob-check input{width:18px;height:18px}
.cob-sig{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-style:italic;font-size:20px}
.cob-sign{margin-top:12px;width:100%}
.cob-teams{display:flex;flex-direction:column;gap:8px}
.cob-team{display:flex;align-items:center;gap:12px;padding:14px 16px;border:1px solid #e5e5ea;border-radius:14px;cursor:pointer;background:#fff;transition:all .15s}
.cob-team.is-on{border-color:#0071E3;background:rgba(0,113,227,.06)}.cob-team input{width:18px;height:18px}
.cob-team-name{flex:1;font-weight:600;font-size:15px}.cob-team-age{font-size:13px;color:#86868b}
.cob-summary{list-style:none;padding:0;margin:0 0 6px;display:flex;flex-direction:column;gap:10px;font-size:15px}
.cob-summary li{display:flex;align-items:center;gap:10px;color:#1d1d1f}.cob-summary svg{color:#34C759}
.cob-staff-wrap{overflow-x:auto;background:#fff;border-radius:16px;border:1px solid #e5e5ea;padding:4px 8px 12px}
.cob-staff{width:100%;border-collapse:collapse;font-size:14px}.cob-staff th{text-align:left;font-size:12px;color:#86868b;font-weight:600;padding:12px 10px;border-bottom:1px solid #f2f2f7;white-space:nowrap}
.cob-staff td{padding:12px 10px;border-bottom:1px solid #f2f2f7;vertical-align:middle}.cob-staff tr:last-child td{border-bottom:none}
.cob-staff-name{display:flex;align-items:center;gap:10px}.cob-staff-name img,.cob-staff-initial{width:32px;height:32px;border-radius:50%;object-fit:cover;background:#e9e9eb;display:inline-flex;align-items:center;justify-content:center;font-weight:600;color:#3a3a3c;flex-shrink:0}
.cob-staff-name small{display:block;color:#86868b;font-size:12px}
.cob-pill{display:inline-flex;align-items:center;justify-content:center;min-width:44px;height:22px;padding:0 8px;border-radius:999px;font-size:12px;font-weight:600;background:#f2f2f7;color:#86868b}
.cob-pill.is-done{background:rgba(52,199,89,.14);color:#1f8f3f;min-width:26px}
@media(max-width:600px){.cob-card{padding:24px 18px 20px;border-radius:20px}.cob-title{font-size:22px}#coach-onboarding{padding:16px 10px}}`;
    document.head.appendChild(css);
  }

  // ── boot ───────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    injectStyles();
    installGate();
    wrapSwitchTeamView();
    // Expose for the welcome-kit page and for debugging.
    window.CoachOnboarding = { refreshState, openStaffView, mountWelcomeKitNav };
    restoreSession().catch(e => console.warn('[coach-onboarding] restore failed:', e.message));
  });
})();
