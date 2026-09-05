/**
 * GODSPEED BASKETBALL. Roster administration inside the Coach Portal.
 *
 * Director / founder only (profiles.role in director, founder and approved).
 * Coaches never see these controls, and the database refuses the calls anyway:
 * every write goes through the v17_01 RPCs (admin_update_athlete,
 * admin_set_roster_membership, admin_delete_team) and v17_03 admin_create_athlete,
 * which check is_program_admin() and write to the append-only roster_admin_log.
 *
 * What a director gets:
 *   - On a team roster: text-only "Edit" per player (name, jersey, grade, date of
 *     birth, status, teams), "Add player" (any athlete in the system, or create a
 *     brand-new one), and "Delete team" when the team has no active players.
 *   - After every save the portal reloads live data (CoachHome.reload) and
 *     re-renders the roster, so what you see is what the database has.
 *
 * Contract: no direct table writes for mutations, no service key, no emojis, no em dashes.
 * Depends on window.auth.getSupabaseClient, getDB, loadTeamRoster, CoachHome.
 */
(function () {
  'use strict';
  var el = function (id) { return document.getElementById(id); };
  function esc(s) { return (s == null ? '' : String(s)).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function client() { try { return window.auth && window.auth.getSupabaseClient ? window.auth.getSupabaseClient() : null; } catch (e) { return null; } }

  var GRADES = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
  var state = { isAdmin: null, teamId: null, busy: false };

  var CSS = '\
.ra-bar{display:flex;align-items:center;gap:16px;margin:0 0 14px;font-size:13px}\
.ra-bar .ra-count{color:#6E6E73}\
.ra-bar .ra-spacer{flex:1}\
.ra-link{background:none;border:none;padding:0;font:inherit;font-size:13px;font-weight:600;color:#0071E3;cursor:pointer;min-height:0;min-width:0;text-transform:none;transition:opacity .15s}\
.ra-link:hover{opacity:.7}.ra-link.danger{color:#D70015}\
.ra-link:focus-visible{outline:2px solid #0071E3;outline-offset:2px;border-radius:4px}\
.ra-row-edit{margin-left:4px;font-size:13px;font-weight:600;color:#0071E3;background:none;border:none;padding:4px 6px;cursor:pointer;min-height:0;min-width:0;text-transform:none;border-radius:6px}\
.ra-row-edit:hover{background:rgba(0,113,227,.08)}\
.ra-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.36);z-index:400;display:flex;align-items:center;justify-content:center;padding:16px}\
.ra-modal{background:#fff;border-radius:18px;width:min(520px,100%);max-height:92vh;overflow:auto;box-shadow:0 24px 80px rgba(0,0,0,.28);padding:22px 24px}\
.ra-modal h3{margin:0 0 2px;font-size:18px;font-weight:700;letter-spacing:-.01em;text-transform:none}\
.ra-modal .ra-sub{margin:0 0 16px;font-size:13px;color:#6E6E73}\
.ra-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}\
.ra-field{display:flex;flex-direction:column;gap:5px;min-width:0}\
.ra-field.full{grid-column:1/-1}\
.ra-field label{font-size:12px;font-weight:600;color:#6E6E73}\
.ra-field input,.ra-field select{font:inherit;font-size:15px;padding:10px 12px;border:1px solid rgba(60,60,67,.18);border-radius:10px;background:#fff;color:#1D1D1F;min-height:0;width:100%}\
.ra-field input:focus,.ra-field select:focus{outline:none;border-color:#0071E3;box-shadow:0 0 0 3px rgba(0,113,227,.15)}\
.ra-hint{font-size:12px;color:#A1A1A6}\
.ra-teams{display:grid;gap:6px}\
.ra-teams label{display:flex;align-items:center;gap:10px;font-size:14px;font-weight:500;color:#1D1D1F;padding:8px 10px;border:1px solid rgba(60,60,67,.1);border-radius:10px;cursor:pointer}\
.ra-teams input{width:16px;height:16px;margin:0;accent-color:#0071E3}\
.ra-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}\
.ra-btn{font:inherit;font-size:14px;font-weight:600;padding:9px 16px;border-radius:999px;border:none;cursor:pointer;min-height:0;min-width:0;text-transform:none}\
.ra-btn.primary{background:#0071E3;color:#fff}.ra-btn.primary:disabled{opacity:.55;cursor:default}\
.ra-btn.ghost{background:rgba(0,0,0,.05);color:#1D1D1F}\
.ra-btn.danger{background:#D70015;color:#fff}\
.ra-err{margin-top:12px;font-size:13px;color:#D70015;background:#FFF1F0;border-radius:10px;padding:10px 12px;display:none}\
.ra-err.on{display:block}\
.ra-ok{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#0A0A0A;color:#fff;font-size:13.5px;font-weight:500;padding:10px 16px;border-radius:999px;z-index:500;box-shadow:0 8px 24px rgba(0,0,0,.25)}\
.ra-list{display:grid;gap:6px;max-height:320px;overflow:auto;padding:2px}\
.ra-list button{display:flex;align-items:center;gap:10px;text-align:left;font:inherit;font-size:14px;padding:9px 12px;border:1px solid rgba(60,60,67,.1);border-radius:10px;background:#fff;cursor:pointer;min-height:0;min-width:0;text-transform:none;color:#1D1D1F}\
.ra-list button:hover{border-color:#0071E3;background:rgba(0,113,227,.04)}\
.ra-list small{color:#6E6E73;margin-left:auto;font-size:12px}\
.ra-search{width:100%;font:inherit;font-size:15px;padding:10px 12px;border:1px solid rgba(60,60,67,.18);border-radius:10px;margin-bottom:10px;min-height:0}\
@media (max-width:600px){.ra-grid{grid-template-columns:1fr}.ra-modal{padding:18px}}';
  function injectCss() { if (el('coach-roster-admin-css')) return; var s = document.createElement('style'); s.id = 'coach-roster-admin-css'; s.textContent = CSS; document.head.appendChild(s); }

  // ---------- who am I ----------
  async function checkAdmin() {
    if (state.isAdmin !== null) return state.isAdmin;
    var c = client(); if (!c) { state.isAdmin = false; return false; }
    try {
      var r = await c.rpc('is_program_admin');
      state.isAdmin = r && r.data === true;
    } catch (e) { state.isAdmin = false; }
    return state.isAdmin;
  }

  // ---------- helpers ----------
  function db() { return typeof getDB === 'function' ? getDB() : { teams: [], roster: [] }; }
  function teamById(id) { return (db().teams || []).filter(function (t) { return t.id === id; })[0]; }
  function activeOn(teamId) { return (db().roster || []).filter(function (r) { return r.teamId === teamId && r.status !== 'inactive'; }); }
  function athleteFromRoster(id) { return (db().roster || []).filter(function (r) { return r.athleteId === id; })[0]; }
  function teamsOf(athleteId) { return (db().roster || []).filter(function (r) { return r.athleteId === athleteId; }).map(function (r) { return r.teamId; }); }
  function ageFrom(dob) { if (!dob) return ''; var d = new Date(dob + 'T12:00:00'); if (isNaN(d)) return ''; var n = new Date(); var a = n.getFullYear() - d.getFullYear(); if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a--; return a; }
  function gradeValue(g) { var m = /^(K|\d{1,2})/.exec(String(g || '').trim()); return m ? m[1] : ''; }
  function toast(msg) { var t = document.createElement('div'); t.className = 'ra-ok'; t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2600); }
  function errText(e) { var m = (e && (e.message || e.error_description || e.details)) || String(e); return m.replace(/^.*?:\s*/, function (x) { return /^(P0001|42501)/.test(x) ? '' : x; }); }
  function gradeOptionLabel(g) { return g === 'K' ? 'Kindergarten' : g + (g === '1' ? 'st' : g === '2' ? 'nd' : g === '3' ? 'rd' : 'th') + ' grade'; }

  async function refresh(teamId) {
    if (window.CoachHome && window.CoachHome.reload) await window.CoachHome.reload();
    if (teamId && typeof loadTeamRoster === 'function') {
      var nav = null; document.querySelectorAll('#team-list .team-nav-item').forEach(function (n) { if (n.__teamId === teamId) nav = n; });
      loadTeamRoster(teamId, nav);
      decorate(teamId);
    }
  }

  // ---------- modal plumbing ----------
  function modal(html) {
    close();
    var b = document.createElement('div'); b.className = 'ra-backdrop'; b.id = 'ra-backdrop';
    b.innerHTML = '<div class="ra-modal" role="dialog" aria-modal="true">' + html + '</div>';
    b.addEventListener('click', function (e) { if (e.target === b) close(); });
    document.body.appendChild(b);
    var f = b.querySelector('input,select,button'); if (f) f.focus();
    return b;
  }
  function close() { var b = el('ra-backdrop'); if (b) b.remove(); }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

  // ---------- edit player ----------
  function openEdit(athleteId, teamId) {
    var a = athleteFromRoster(athleteId); if (!a) return;
    var teams = db().teams || [];
    var mine = teamsOf(athleteId);
    var gradeSel = '<select name="grade"><option value="">Not set</option>' + GRADES.map(function (g) { return '<option value="' + g + '"' + (gradeValue(a.grade) === g ? ' selected' : '') + '>' + gradeOptionLabel(g) + '</option>'; }).join('') + '</select>';
    var teamBoxes = teams.map(function (t) { return '<label><input type="checkbox" name="team" value="' + esc(t.id) + '"' + (mine.indexOf(t.id) > -1 ? ' checked' : '') + '>' + esc(t.name) + '</label>'; }).join('');
    var b = modal(
      '<h3>Edit player</h3><p class="ra-sub">Changes save to the roster database and show for every coach right away.</p>' +
      '<form id="ra-edit"><div class="ra-grid">' +
      '<div class="ra-field"><label>First name</label><input name="first_name" required maxlength="60" value="' + esc(a.name) + '"></div>' +
      '<div class="ra-field"><label>Last name</label><input name="last_name" maxlength="60" value="' + esc(a.lastName) + '"></div>' +
      '<div class="ra-field"><label>Jersey number</label><input name="jersey_number" type="number" min="0" max="99" inputmode="numeric" value="' + esc(a.jersey == null ? '' : a.jersey) + '"></div>' +
      '<div class="ra-field"><label>Grade</label>' + gradeSel + '</div>' +
      '<div class="ra-field"><label>Date of birth</label><input name="date_of_birth" type="date" value="' + esc(a.dob) + '"><span class="ra-hint" id="ra-age">' + (a.dob ? 'Age ' + ageFrom(a.dob) : 'Age shows once a date is set') + '</span></div>' +
      '<div class="ra-field"><label>Status</label><select name="enrollment_status"><option value="active"' + (a.status === 'active' ? ' selected' : '') + '>Active</option><option value="inactive"' + (a.status === 'inactive' ? ' selected' : '') + '>Inactive</option><option value="pending"' + (a.status === 'pending' ? ' selected' : '') + '>Pending</option></select></div>' +
      '<div class="ra-field full"><label>Teams</label><div class="ra-teams">' + teamBoxes + '</div></div>' +
      '</div><div class="ra-err" id="ra-err"></div>' +
      '<div class="ra-actions"><button type="button" class="ra-btn ghost" id="ra-cancel">Cancel</button><button type="submit" class="ra-btn primary" id="ra-save">Save</button></div></form>');
    b.querySelector('#ra-cancel').onclick = close;
    var dobIn = b.querySelector('[name=date_of_birth]');
    dobIn.addEventListener('input', function () { var ag = ageFrom(dobIn.value); el('ra-age').textContent = ag === '' ? 'Age shows once a date is set' : 'Age ' + ag; });
    b.querySelector('#ra-edit').addEventListener('submit', async function (e) {
      e.preventDefault();
      if (state.busy) return;
      var f = e.target; var err = el('ra-err'); err.classList.remove('on');
      var patch = { first_name: f.first_name.value.trim(), last_name: f.last_name.value.trim(), jersey_number: f.jersey_number.value === '' ? null : f.jersey_number.value, grade: f.grade.value, date_of_birth: f.date_of_birth.value || null, enrollment_status: f.enrollment_status.value };
      var wanted = Array.prototype.map.call(f.querySelectorAll('[name=team]:checked'), function (x) { return x.value; });
      var c = client(); if (!c) { err.textContent = 'Sign-in service not loaded.'; err.classList.add('on'); return; }
      state.busy = true; el('ra-save').disabled = true; el('ra-save').textContent = 'Saving';
      try {
        var r = await c.rpc('admin_update_athlete', { p_athlete_id: athleteId, p_patch: patch }); if (r.error) throw r.error;
        var adds = wanted.filter(function (t) { return mine.indexOf(t) === -1; });
        var removes = mine.filter(function (t) { return wanted.indexOf(t) === -1; });
        for (var i = 0; i < adds.length; i++) { var ra = await c.rpc('admin_set_roster_membership', { p_team_id: adds[i], p_athlete_id: athleteId, p_active: true }); if (ra.error) throw ra.error; }
        for (var j = 0; j < removes.length; j++) { var rr = await c.rpc('admin_set_roster_membership', { p_team_id: removes[j], p_athlete_id: athleteId, p_active: false }); if (rr.error) throw rr.error; }
        close(); toast('Saved ' + patch.first_name + '.');
        await refresh(teamId);
      } catch (ex) { err.textContent = errText(ex); err.classList.add('on'); }
      state.busy = false; var sb = el('ra-save'); if (sb) { sb.disabled = false; sb.textContent = 'Save'; }
    });
  }

  // ---------- add player to this team (existing athlete from the whole system) ----------
  function openAdd(teamId) {
    var t = teamById(teamId); if (!t) return;
    var on = {}; activeOn(teamId).forEach(function (r) { on[r.athleteId] = 1; });
    var pool = [];
    var b = modal('<h3>Add a player to ' + esc(t.name) + '</h3><p class="ra-sub">Pick a player already in Godspeed, or create a brand-new one. Nobody is removed from another team.</p>' +
      '<div style="margin:0 0 12px"><button type="button" class="ra-btn primary" id="ra-new">New player</button></div>' +
      '<input class="ra-search" id="ra-q" placeholder="Type a name" autocomplete="off">' +
      '<div class="ra-list" id="ra-list"><div class="ra-hint" style="padding:10px 4px">Loading players...</div></div><div class="ra-err" id="ra-err"></div>' +
      '<div class="ra-actions"><button type="button" class="ra-btn ghost" id="ra-cancel">Cancel</button></div>');
    b.querySelector('#ra-cancel').onclick = close;
    b.querySelector('#ra-new').onclick = function () { openCreate(teamId); };
    function paint(q) {
      var list = el('ra-list'); if (!list) return; var ql = (q || '').toLowerCase();
      var items = pool.filter(function (r) { return !ql || (r.name + ' ' + r.lastName).toLowerCase().indexOf(ql) > -1; });
      if (!items.length) { list.innerHTML = '<div class="ra-hint" style="padding:10px 4px">' + (pool.length ? 'No match.' : 'No other players in the system yet. Use New player.') + '</div>'; return; }
      list.innerHTML = items.map(function (r) { var tm = teamsOf(r.athleteId).map(function (id) { var x = teamById(id); return x ? x.name.replace(/^Godspeed /, '') : ''; }).filter(Boolean).join(', '); return '<button type="button" data-id="' + esc(r.athleteId) + '"><b>' + esc(r.name + (r.lastName ? ' ' + r.lastName : '')) + '</b>' + (r.status && r.status !== 'active' ? ' <span class="ra-hint">' + esc(r.status) + '</span>' : '') + '<small>' + esc(tm || 'no team') + '</small></button>'; }).join('');
      list.querySelectorAll('button').forEach(function (btn) { btn.onclick = async function () {
        if (state.busy) return; state.busy = true; btn.disabled = true;
        try { var c = client(); var r = await c.rpc('admin_set_roster_membership', { p_team_id: teamId, p_athlete_id: btn.getAttribute('data-id'), p_active: true }); if (r.error) throw r.error; close(); toast('Added to ' + t.name + '.'); await refresh(teamId); }
        catch (ex) { var err = el('ra-err'); if (err) { err.textContent = errText(ex); err.classList.add('on'); } btn.disabled = false; }
        state.busy = false;
      }; });
    }
    el('ra-q').addEventListener('input', function () { paint(el('ra-q').value); });
    // Load the full athlete pool from the database (a director can read all athletes),
    // not just the roster rows already loaded in memory. Falls back to loaded data on error.
    (async function () {
      var c = client();
      if (c) {
        try {
          var r = await c.from('athletes').select('id,first_name,last_name,enrollment_status').order('first_name');
          if (r.error) throw r.error;
          pool = (r.data || []).filter(function (a) { return !on[a.id]; }).map(function (a) { return { athleteId: a.id, name: a.first_name || '', lastName: a.last_name || '', status: a.enrollment_status }; });
          paint(el('ra-q') ? el('ra-q').value : '');
          return;
        } catch (e) { /* fall through to loaded data */ }
      }
      var seen = {}; pool = [];
      (db().roster || []).forEach(function (rr) { if (seen[rr.athleteId] || on[rr.athleteId]) return; seen[rr.athleteId] = 1; pool.push(rr); });
      pool.sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
      paint(el('ra-q') ? el('ra-q').value : '');
    })();
  }

  // ---------- create a brand-new player, then add to this team ----------
  function openCreate(teamId) {
    var t = teamById(teamId); if (!t) return;
    var gradeSel = '<select name="grade"><option value="">Not set</option>' + GRADES.map(function (g) { return '<option value="' + g + '">' + gradeOptionLabel(g) + '</option>'; }).join('') + '</select>';
    var b = modal(
      '<h3>New player on ' + esc(t.name) + '</h3><p class="ra-sub">Creates the player in Godspeed and adds them to this team. You can edit the rest anytime.</p>' +
      '<form id="ra-create"><div class="ra-grid">' +
      '<div class="ra-field"><label>First name</label><input name="first_name" required maxlength="60" autocomplete="off"></div>' +
      '<div class="ra-field"><label>Last name</label><input name="last_name" maxlength="60" autocomplete="off"></div>' +
      '<div class="ra-field"><label>Jersey number</label><input name="jersey_number" type="number" min="0" max="99" inputmode="numeric"></div>' +
      '<div class="ra-field"><label>Grade</label>' + gradeSel + '</div>' +
      '<div class="ra-field"><label>Date of birth</label><input name="date_of_birth" type="date"><span class="ra-hint" id="ra-age">Optional</span></div>' +
      '<div class="ra-field"><label>Status</label><select name="enrollment_status"><option value="active" selected>Active</option><option value="pending">Pending</option><option value="inactive">Inactive</option></select></div>' +
      '</div><div class="ra-err" id="ra-err"></div>' +
      '<div class="ra-actions"><button type="button" class="ra-btn ghost" id="ra-cancel">Cancel</button><button type="submit" class="ra-btn primary" id="ra-save">Create and add</button></div></form>');
    b.querySelector('#ra-cancel').onclick = close;
    var dobIn = b.querySelector('[name=date_of_birth]');
    dobIn.addEventListener('input', function () { var ag = ageFrom(dobIn.value); el('ra-age').textContent = ag === '' ? 'Optional' : 'Age ' + ag; });
    b.querySelector('#ra-create').addEventListener('submit', async function (e) {
      e.preventDefault();
      if (state.busy) return;
      var f = e.target; var err = el('ra-err'); err.classList.remove('on');
      var patch = { first_name: f.first_name.value.trim(), last_name: f.last_name.value.trim(), jersey_number: f.jersey_number.value === '' ? null : f.jersey_number.value, grade: f.grade.value, date_of_birth: f.date_of_birth.value || null, enrollment_status: f.enrollment_status.value };
      if (!patch.first_name) { err.textContent = 'First name is required.'; err.classList.add('on'); return; }
      var c = client(); if (!c) { err.textContent = 'Sign-in service not loaded.'; err.classList.add('on'); return; }
      state.busy = true; el('ra-save').disabled = true; el('ra-save').textContent = 'Creating';
      try {
        var r = await c.rpc('admin_create_athlete', { p_patch: patch }); if (r.error) throw r.error;
        var newId = r.data && r.data.id; if (!newId) throw new Error('Create did not return an id.');
        var rm = await c.rpc('admin_set_roster_membership', { p_team_id: teamId, p_athlete_id: newId, p_active: true }); if (rm.error) throw rm.error;
        close(); toast('Added ' + patch.first_name + ' to ' + t.name + '.');
        await refresh(teamId);
      } catch (ex) { err.textContent = errText(ex); err.classList.add('on'); }
      state.busy = false; var sb = el('ra-save'); if (sb) { sb.disabled = false; sb.textContent = 'Create and add'; }
    });
  }

  // ---------- remove from team (from the edit form the team checkbox does it; this is the quick path) ----------
  async function removeFromTeam(athleteId, teamId) {
    var a = athleteFromRoster(athleteId); var t = teamById(teamId); if (!a || !t) return;
    var b = modal('<h3>Take ' + esc(a.name) + ' off ' + esc(t.name) + '?</h3><p class="ra-sub">The player stays in Godspeed and on any other team. Only this team changes.</p><div class="ra-err" id="ra-err"></div><div class="ra-actions"><button type="button" class="ra-btn ghost" id="ra-cancel">Cancel</button><button type="button" class="ra-btn danger" id="ra-go">Remove from team</button></div>');
    b.querySelector('#ra-cancel').onclick = close;
    b.querySelector('#ra-go').onclick = async function () {
      if (state.busy) return; state.busy = true;
      try { var c = client(); var r = await c.rpc('admin_set_roster_membership', { p_team_id: teamId, p_athlete_id: athleteId, p_active: false }); if (r.error) throw r.error; close(); toast(a.name + ' removed from ' + t.name + '.'); await refresh(teamId); }
      catch (ex) { el('ra-err').textContent = errText(ex); el('ra-err').classList.add('on'); }
      state.busy = false;
    };
  }

  // ---------- delete empty team ----------
  function openDelete(teamId) {
    var t = teamById(teamId); if (!t) return;
    if (activeOn(teamId).length) { toast(t.name + ' still has players.'); return; }
    var b = modal('<h3>Delete ' + esc(t.name) + '?</h3><p class="ra-sub">This cannot be undone. Past practices and games keep their records; the team itself goes away. Type the team name to confirm.</p>' +
      '<div class="ra-field"><input id="ra-confirm" placeholder="' + esc(t.name) + '" autocomplete="off"></div><div class="ra-err" id="ra-err"></div>' +
      '<div class="ra-actions"><button type="button" class="ra-btn ghost" id="ra-cancel">Cancel</button><button type="button" class="ra-btn danger" id="ra-go" disabled>Delete team</button></div>');
    b.querySelector('#ra-cancel').onclick = close;
    var inp = el('ra-confirm'); var go = el('ra-go');
    inp.addEventListener('input', function () { go.disabled = inp.value.trim().toLowerCase() !== t.name.toLowerCase(); });
    go.onclick = async function () {
      if (state.busy || go.disabled) return; state.busy = true; go.disabled = true; go.textContent = 'Deleting';
      try {
        var c = client(); var r = await c.rpc('admin_delete_team', { p_team_id: teamId }); if (r.error) throw r.error;
        close(); toast(t.name + ' deleted.');
        if (window.CoachHome && window.CoachHome.reload) await window.CoachHome.reload();
        if (window.CoachHome && window.CoachHome.show) window.CoachHome.show();
      } catch (ex) { el('ra-err').textContent = errText(ex); el('ra-err').classList.add('on'); go.disabled = false; go.textContent = 'Delete team'; }
      state.busy = false;
    };
  }

  // ---------- decorate a loaded roster ----------
  async function decorate(teamId) {
    if (!(await checkAdmin())) return;
    injectCss();
    var box = el('roster-table-container'); if (!box) return;
    var t = teamById(teamId); if (!t) return;
    var active = activeOn(teamId);
    var old = el('ra-bar'); if (old) old.remove();
    var bar = document.createElement('div'); bar.className = 'ra-bar'; bar.id = 'ra-bar';
    bar.innerHTML = '<span class="ra-count">' + active.length + ' active player' + (active.length === 1 ? '' : 's') + '</span><span class="ra-spacer"></span>' +
      '<button type="button" class="ra-link" id="ra-add">Add player</button>' +
      (active.length === 0 ? '<button type="button" class="ra-link danger" id="ra-del">Delete team</button>' : '');
    box.parentNode.insertBefore(bar, box);
    el('ra-add').onclick = function () { openAdd(teamId); };
    var d = el('ra-del'); if (d) d.onclick = function () { openDelete(teamId); };

    // Per-row Edit / Remove, text only, no bubbling into the report opener.
    box.querySelectorAll('[onclick^="viewPlayerReport("]').forEach(function (row) {
      if (row.querySelector('.ra-row-edit')) return;
      var m = /viewPlayerReport\('([^']+)'\)/.exec(row.getAttribute('onclick') || ''); if (!m) return;
      var id = m[1];
      var badge = row.querySelector('span[style*="border-radius: 999px"]');
      var slot = badge ? badge.parentNode : row;
      var edit = document.createElement('button'); edit.type = 'button'; edit.className = 'ra-row-edit'; edit.textContent = 'Edit';
      edit.onclick = function (e) { e.stopPropagation(); openEdit(id, teamId); };
      var rem = document.createElement('button'); rem.type = 'button'; rem.className = 'ra-row-edit'; rem.textContent = 'Remove'; rem.style.color = '#D70015';
      rem.onclick = function (e) { e.stopPropagation(); removeFromTeam(id, teamId); };
      slot.appendChild(edit); slot.appendChild(rem);
    });
  }

  function wrap() {
    var orig = window.loadTeamRoster;
    if (typeof orig === 'function' && !orig.__raWrapped) {
      var w = function (teamId, navItem) { var r = orig.apply(this, arguments); var b = el('ra-bar'); if (b) b.remove(); setTimeout(function () { decorate(teamId); }, 0); return r; };
      w.__raWrapped = true; window.loadTeamRoster = w;
    }
    var sw = window.switchTeamView;
    if (typeof sw === 'function' && !sw.__raWrapped) {
      var w2 = function (view) { var b = el('ra-bar'); if (b) b.style.display = view === 'roster' ? '' : 'none'; return sw.apply(this, arguments); };
      w2.__raWrapped = true; window.switchTeamView = w2;
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    wrap();
    window.CoachRosterAdmin = { decorate: decorate, openEdit: openEdit, openAdd: openAdd, openCreate: openCreate, openDelete: openDelete, checkAdmin: checkAdmin };
  });
})();
