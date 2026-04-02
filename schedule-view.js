/**
 * schedule-view.js
 * Parent portal Schedule & Tournaments view.
 * Replaces the previous iframe calendar + tournament-schedule list with an
 * integrated layout: mini calendar sidebar, grade-level tabs, tournament
 * drill-down cards, and upcoming events.
 *
 * Public API:
 *   ScheduleView.init(supabaseClient)
 *   ScheduleView.load()
 *   ScheduleView.render(containerId)
 */
'use strict';

const ScheduleView = (() => {
  let supabase = null;
  let allEvents = [];
  let currentMonth = new Date().getMonth();
  let currentYear = new Date().getFullYear();
  let activeGrade = 'all';   // 'all' | '4th' | '5th'
  let activeTab = 0;         // 0=Tournaments, 1=Practice, 2=Full Calendar
  let expandedId = null;     // which tournament card is expanded
  let containerId = null;
  let availability = {};     // { tournamentId: 'available' | 'unavailable' }
  let availSaving = {};      // { tournamentId: true } while save in flight

  // ─── Init & Load ────────────────────────────────────────────
  function init(supabaseClient) {
    supabase = supabaseClient;
  }

  async function load() {
    if (!supabase) return;

    // Load calendar_events (practices, meetings, etc.)
    const { data: calData, error: calErr } = await supabase
      .from('calendar_events')
      .select('id,title,event_type,start_date,start_time,end_time,end_date,location,location_url,grade_level,description,cost,tags,color')
      .eq('is_cancelled', false)
      .not('published_at', 'is', null)
      .in('visibility', ['public', 'team_only'])
      .order('start_date', { ascending: true });
    if (calErr) { console.error('ScheduleView load calendar_events:', calErr); }

    // Load team_schedule_view (master tournament source)
    const { data: schedData, error: schedErr } = await supabase
      .from('team_schedule_view')
      .select('schedule_id,tournament_id,tournament_name,start_date,end_date,city,state,event_type,rank_tier,game_guarantee,status')
      .order('start_date', { ascending: true });
    if (schedErr) { console.error('ScheduleView load team_schedule_view:', schedErr); }

    // Normalize tournament names for dedup
    function normalizeName(name) {
      return (name || '').toLowerCase()
        .replace(/ day \d+$/i, '')
        .replace(/^ihoop\s+/i, '')
        .replace(/\b(the|a|an|of)\b/g, '')
        .replace(/mountain\s*west/gi, '')
        .replace(/[^a-z0-9]/g, '');
    }

    // Build set of normalized schedule names (master source)
    const scheduleNames = new Set((schedData || []).map(t => normalizeName(t.tournament_name)));

    // Filter out calendar_events tournaments that duplicate team_schedule_view entries
    const calEvents = (calData || []).filter(e => {
      if (!['tournament', 'season', 'game', 'camp'].includes(e.event_type)) return true;
      const norm = normalizeName(e.title);
      for (const sn of scheduleNames) {
        if (norm === sn || sn.includes(norm) || norm.includes(sn)) return false;
      }
      return true;
    });

    // Map team_schedule_view rows to the same shape as calendar_events
    const schedEvents = (schedData || []).map(t => ({
      id: t.schedule_id || t.tournament_id,
      title: t.tournament_name,
      event_type: t.event_type === '3v3' ? 'tournament' : 'tournament',
      start_date: t.start_date,
      start_time: null,
      end_time: null,
      end_date: t.end_date,
      location: [t.city, t.state].filter(Boolean).join(', ') || null,
      location_url: null,
      grade_level: null,
      description: [t.rank_tier ? `${t.rank_tier}` : null, t.game_guarantee ? `${t.game_guarantee} games` : null].filter(Boolean).join(' -- '),
      cost: null,
      tags: null,
      color: null,
      _source: 'team_schedule'
    }));

    allEvents = [...calEvents, ...schedEvents].sort((a, b) =>
      (a.start_date || '').localeCompare(b.start_date || '')
    );

    // Load parent's availability responses
    await loadAvailability();

    return allEvents;
  }

  // ─── Availability ──────────────────────────────────────────
  async function loadAvailability() {
    if (!supabase) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from('tournament_availability')
        .select('tournament_identifier,status')
        .eq('parent_id', user.id);
      if (error) { console.error('ScheduleView loadAvailability:', error); return; }
      availability = {};
      (data || []).forEach(r => { availability[r.tournament_identifier] = r.status; });
    } catch (err) {
      console.error('ScheduleView loadAvailability:', err);
    }
  }

  async function setAvailability(tournamentId, tournamentName, status) {
    if (!supabase || availSaving[tournamentId]) return;
    availSaving[tournamentId] = true;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase
        .from('tournament_availability')
        .upsert({
          parent_id: user.id,
          tournament_identifier: tournamentId,
          tournament_name: tournamentName,
          status: status
        }, { onConflict: 'parent_id,tournament_identifier' });
      if (error) { console.error('ScheduleView setAvailability:', error); return; }
      availability[tournamentId] = status;
    } catch (err) {
      console.error('ScheduleView setAvailability:', err);
    } finally {
      delete availSaving[tournamentId];
      render(containerId);
    }
  }

  // ─── Helpers ────────────────────────────────────────────────
  function fmt(dateStr, opts) {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', opts);
  }
  function fmtShort(d) { return fmt(d, { month: 'short', day: 'numeric' }); }
  function fmtTime(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  }
  function gradeLabel(g) {
    if (g === '4th') return '4th Grade';
    if (g === '5th') return '5th Grade';
    return 'Both Teams';
  }
  function gradeBadgeColor(g) {
    if (g === '4th') return { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' };
    if (g === '5th') return { bg: '#FDF4FF', color: '#7E22CE', border: '#E9D5FF' };
    return { bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0' };
  }

  function filterByGrade(events) {
    if (activeGrade === 'all') return events;
    return events.filter(e => e.grade_level === activeGrade || e.grade_level === 'both' || !e.grade_level);
  }

  function futureEvents() {
    const today = new Date().toISOString().split('T')[0];
    return allEvents.filter(e => e.start_date >= today);
  }

  function tournamentEvents() {
    return filterByGrade(futureEvents()).filter(e =>
      ['tournament', 'season', 'game', 'camp'].includes(e.event_type)
    );
  }

  function practiceEvents() {
    return filterByGrade(futureEvents()).filter(e =>
      ['practice', 'meeting'].includes(e.event_type) || e.event_type === 'other'
    );
  }

  // ─── ICS Export ─────────────────────────────────────────────
  function toICSDate(dateStr, timeStr) {
    const d = dateStr.replace(/-/g, '');
    if (timeStr) return d + 'T' + timeStr.replace(/:/g, '').padEnd(6, '0');
    return d;
  }
  function escICS(str) {
    return (str || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  }
  function generateICS(events) {
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0',
      'PRODID:-//Godspeed Basketball//Schedule//EN',
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'X-WR-CALNAME:Godspeed Schedule'
    ];
    for (const e of events) {
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${e.id}@clubgodspeed.com`);
      lines.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`);
      if (e.start_time) {
        lines.push(`DTSTART:${toICSDate(e.start_date, e.start_time)}`);
        if (e.end_time) lines.push(`DTEND:${toICSDate(e.end_date || e.start_date, e.end_time)}`);
      } else {
        lines.push(`DTSTART;VALUE=DATE:${toICSDate(e.start_date)}`);
        if (e.end_date && e.end_date !== e.start_date) {
          const endP = new Date(e.end_date + 'T12:00:00');
          endP.setDate(endP.getDate() + 1);
          lines.push(`DTEND;VALUE=DATE:${endP.toISOString().split('T')[0].replace(/-/g, '')}`);
        }
      }
      lines.push(`SUMMARY:${escICS(e.title)} (${gradeLabel(e.grade_level)})`);
      if (e.location) lines.push(`LOCATION:${escICS(e.location)}`);
      if (e.description) lines.push(`DESCRIPTION:${escICS(e.description)}`);
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }
  function downloadICS(events) {
    const evts = events || tournamentEvents();
    if (!evts.length) return;
    const blob = new Blob([generateICS(evts)], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'godspeed-schedule.ics'; document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(a.href);
  }

  // ─── Mini Calendar ──────────────────────────────────────────
  function renderMiniCalendar() {
    const today = new Date();
    const first = new Date(currentYear, currentMonth, 1);
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const startDay = first.getDay();
    const monthLabel = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // Collect event dates for this month
    const eventDates = new Set();
    const monthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
    filterByGrade(allEvents).forEach(e => {
      if (e.start_date.startsWith(monthStr)) {
        eventDates.add(parseInt(e.start_date.split('-')[2]));
      }
      // Multi-day events
      if (e.end_date) {
        const s = new Date(e.start_date + 'T12:00:00');
        const end = new Date(e.end_date + 'T12:00:00');
        while (s <= end) {
          const ms = `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}`;
          if (ms === monthStr) eventDates.add(s.getDate());
          s.setDate(s.getDate() + 1);
        }
      }
    });

    const isToday = (d) => d === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();
    const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

    let cells = dayLabels.map(l =>
      `<div style="font-size:9px;color:#9ca3af;text-align:center;padding:2px 0;font-weight:500">${l}</div>`
    ).join('');

    for (let i = 0; i < startDay; i++) cells += '<div></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const t = isToday(d);
      const hasEv = eventDates.has(d);
      const bg = t ? '#111' : 'transparent';
      const col = t ? '#fff' : hasEv ? '#111' : '#9ca3af';
      const fw = (t || hasEv) ? '600' : '400';
      const dot = hasEv && !t ? '<div style="position:absolute;bottom:1px;left:50%;transform:translateX(-50%);width:4px;height:4px;border-radius:50%;background:#ef4444"></div>' : '';
      cells += `<div style="font-size:10px;text-align:center;padding:4px 2px;border-radius:4px;position:relative;background:${bg};color:${col};font-weight:${fw};cursor:default">${d}${dot}</div>`;
    }

    return `
      <div style="margin-bottom:20px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <span style="font-size:12px;font-weight:600;color:#111">${monthLabel}</span>
          <div style="display:flex;gap:2px">
            <button onclick="ScheduleView._navMonth(-1)" style="background:none;border:none;cursor:pointer;font-size:14px;color:#6b7280;padding:2px 6px;border-radius:4px" aria-label="Previous month">&#8249;</button>
            <button onclick="ScheduleView._navMonth(1)" style="background:none;border:none;cursor:pointer;font-size:14px;color:#6b7280;padding:2px 6px;border-radius:4px" aria-label="Next month">&#8250;</button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px">${cells}</div>
      </div>`;
  }

  // ─── Upcoming Sidebar ───────────────────────────────────────
  function renderUpcoming() {
    const upcoming = filterByGrade(futureEvents()).slice(0, 6);
    if (!upcoming.length) return '<div style="font-size:11px;color:#9ca3af;padding:8px 0">No upcoming events</div>';

    const typeColor = { tournament: '#ef4444', season: '#059669', game: '#f59e0b', camp: '#7c3aed', practice: '#2563eb', meeting: '#6b7280' };
    let html = '<div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#9ca3af;margin-bottom:8px">Upcoming</div>';

    upcoming.forEach(ev => {
      const color = typeColor[ev.event_type] || '#6b7280';
      const dateStr = fmtShort(ev.start_date);
      const timeStr = ev.start_time ? ' -- ' + fmtTime(ev.start_time) : '';
      html += `
        <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px">
          <div style="width:6px;height:6px;border-radius:50%;background:${color};flex-shrink:0;margin-top:4px"></div>
          <div>
            <div style="font-size:11px;font-weight:600;color:#111;line-height:1.3">${ev.title}</div>
            <div style="font-size:10px;color:#6b7280">${dateStr}${timeStr}</div>
          </div>
        </div>`;
    });
    return html;
  }

  // ─── Status badge ───────────────────────────────────────────
  function statusFromTags(tags) {
    if (!Array.isArray(tags)) return null;
    if (tags.includes('confirmed')) return { label: 'Confirmed', bg: '#EAF3DE', color: '#3B6D11' };
    if (tags.includes('registered')) return { label: 'Registered', bg: '#EAF3DE', color: '#3B6D11' };
    if (tags.includes('paid')) return { label: 'Paid', bg: '#EAF3DE', color: '#3B6D11' };
    if (tags.includes('planned')) return { label: 'Planned', bg: '#FAEEDA', color: '#854F0B' };
    if (tags.includes('pending')) return { label: 'Pending', bg: '#FAEEDA', color: '#854F0B' };
    if (tags.includes('interest')) return { label: 'Interested', bg: '#E6F1FB', color: '#185FA5' };
    if (tags.includes('backup')) return { label: 'Backup', bg: '#F3F4F6', color: '#6B7280' };
    return null;
  }

  // ─── Priority Events (full roster required) ─────────────────
  const PRIORITY_KEYWORDS = ['spring hoops classic', 'jps mile high', 'jps freedom', 'jps invitational'];
  const PRIORITY_EXCLUDE = ['3on3', '3 on 3'];
  function isPriorityEvent(title) {
    const t = (title || '').toLowerCase();
    if (PRIORITY_EXCLUDE.some(ex => t.includes(ex))) return false;
    return PRIORITY_KEYWORDS.some(kw => t.includes(kw));
  }

  // ─── Tournament Card ────────────────────────────────────────
  function renderTournamentCard(ev) {
    const isExpanded = expandedId === ev.id;
    const dateLabel = ev.end_date && ev.end_date !== ev.start_date
      ? `${fmtShort(ev.start_date)} - ${fmtShort(ev.end_date)}`
      : fmtShort(ev.start_date);
    const gc = gradeBadgeColor(ev.grade_level);
    const priority = isPriorityEvent(ev.title);
    const status = statusFromTags(ev.tags);
    const statusBadge = (priority
      ? '<span style="font-size:9px;font-weight:700;letter-spacing:0.06em;border-radius:4px;padding:2px 7px;background:#111;color:#fff">HIGH PRIORITY</span>'
      : '')
      + (status
      ? `<span style="font-size:10px;font-weight:600;border-radius:10px;padding:2px 8px;background:${status.bg};color:${status.color}">${status.label}</span>`
      : '');

    const chevron = isExpanded
      ? '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style="transform:rotate(90deg);transition:transform 0.15s"><path d="M6 3l5 5-5 5"/></svg>'
      : '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style="transition:transform 0.15s"><path d="M6 3l5 5-5 5"/></svg>';

    // Availability state
    const avail = availability[ev.id];
    const isAvail = avail === 'available';
    const isUnavail = avail === 'unavailable';
    const noResponse = !isAvail && !isUnavail;
    const saving = availSaving[ev.id];
    const eid = ev.id.replace(/'/g, "\\'");
    const ename = (ev.title || '').replace(/'/g, "\\'");

    // iOS-style segmented control: pill background, sliding active state
    function segBtn(label, value, isActive) {
      const activeStyle = value === 'available'
        ? 'background:#111;color:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.12)'
        : 'background:#111;color:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.12)';
      const inactiveStyle = 'background:transparent;color:#9ca3af';
      return `<button onclick="event.stopPropagation();ScheduleView._setAvail('${eid}','${ename}','${value}')"
        style="padding:4px 12px;border:none;font-size:10px;font-weight:600;cursor:pointer;transition:all 0.2s ease;border-radius:6px;white-space:nowrap;${isActive ? activeStyle : inactiveStyle}"${saving ? ' disabled' : ''}>${label}</button>`;
    }

    const availToggle = `
      <div style="display:inline-flex;align-items:center;gap:2px;padding:2px;border-radius:8px;background:#f3f4f6;flex-shrink:0" onclick="event.stopPropagation()">
        ${segBtn('In', 'available', isAvail)}${segBtn('Out', 'unavailable', isUnavail)}
      </div>`;

    // Status dot for the card face subtitle
    const availDot = isAvail
      ? '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#22c55e;flex-shrink:0"></span><span style="color:#15803d;font-weight:500">In</span>'
      : isUnavail
      ? '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#ef4444;flex-shrink:0"></span><span style="color:#dc2626;font-weight:500">Out</span>'
      : '';

    let detail = '';
    if (isExpanded) {
      const rows = [];
      if (ev.location) {
        const loc = ev.location_url
          ? `<a href="${ev.location_url}" target="_blank" rel="noopener" style="color:#2563eb;text-decoration:none;font-weight:500">${ev.location}</a>`
          : ev.location;
        rows.push(['Location', loc]);
      }
      rows.push(['Date', fmt(ev.start_date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) +
        (ev.end_date && ev.end_date !== ev.start_date ? ' - ' + fmt(ev.end_date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '')]);
      if (ev.start_time) rows.push(['Time', fmtTime(ev.start_time) + (ev.end_time ? ' - ' + fmtTime(ev.end_time) : '')]);
      rows.push(['Division', gradeLabel(ev.grade_level)]);
      if (ev.cost) rows.push(['Cost', '$' + parseFloat(ev.cost).toFixed(0)]);
      if (ev.description) rows.push(['Details', ev.description]);
      if (priority) rows.push(['Attendance', '<span style="font-weight:600;color:#111">Full roster required.</span> This is a priority event for our program. We need every player present and ready to compete. Please plan accordingly and communicate early if there is a conflict.']);

      const detailRows = rows.map(([k, v]) =>
        `<div style="display:flex;gap:12px;padding:8px 0;border-bottom:1px solid #f3f4f6">
          <div style="width:72px;flex-shrink:0;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.04em">${k}</div>
          <div style="font-size:12px;color:#374151;line-height:1.5">${v}</div>
        </div>`
      ).join('');

      detail = `
        <div style="padding:12px 14px 14px;border-top:1px solid #e5e7eb;background:#fafafa;border-radius:0 0 8px 8px">
          ${detailRows}
          <div style="display:flex;gap:8px;margin-top:12px">
            <button onclick="ScheduleView._addToCalendar('${ev.id}')" style="padding:6px 12px;border-radius:6px;border:1px solid #d1d5db;background:#fff;color:#374151;font-size:11px;cursor:pointer;font-weight:600">Add to Calendar</button>
            ${ev.location_url ? `<a href="${ev.location_url}" target="_blank" rel="noopener" style="padding:6px 12px;border-radius:6px;border:none;background:#111;color:#fff;font-size:11px;cursor:pointer;font-weight:600;text-decoration:none;display:inline-flex;align-items:center">Get Directions</a>` : ''}
          </div>
        </div>`;
    }

    return `
      <div style="border:1px solid ${isExpanded ? '#111' : '#e5e7eb'};border-radius:8px;margin-bottom:8px;overflow:hidden;transition:border-color 0.15s;cursor:pointer" onclick="ScheduleView._toggle('${ev.id}')">
        <div style="padding:12px 14px;display:flex;align-items:center;gap:10px">
          <div style="color:#9ca3af;flex-shrink:0">${chevron}</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span style="font-size:13px;font-weight:600;color:#111">${ev.title}</span>
              <span style="font-size:10px;font-weight:600;border-radius:4px;padding:2px 7px;background:${gc.bg};color:${gc.color};border:1px solid ${gc.border}">${gradeLabel(ev.grade_level)}</span>
              ${statusBadge}
            </div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:3px;font-size:11px;color:#6b7280">
              <span>${dateLabel}</span>
              ${ev.location ? '<span style="color:#d1d5db">|</span><span>' + ev.location.split(',')[0] + '</span>' : ''}
              ${availDot ? '<span style="color:#d1d5db">|</span><span style="display:inline-flex;align-items:center;gap:4px">' + availDot + '</span>' : ''}
            </div>
          </div>
          ${availToggle}
        </div>
        ${detail}
      </div>`;
  }

  // ─── Tournament List ────────────────────────────────────────
  function renderTournamentList() {
    const events = tournamentEvents();
    if (!events.length) {
      return '<div style="padding:32px;text-align:center;color:#9ca3af;font-size:13px">No upcoming tournaments scheduled.</div>';
    }

    // Group by month
    const months = {};
    events.forEach(e => {
      const key = fmt(e.start_date, { month: 'long', year: 'numeric' });
      if (!months[key]) months[key] = [];
      months[key].push(e);
    });

    let html = '';
    for (const [month, evts] of Object.entries(months)) {
      html += `
        <div style="margin-bottom:20px">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;margin-bottom:6px;border-bottom:1px solid #e5e7eb">
            <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#111">${month}</span>
            <span style="font-size:10px;font-weight:500;color:#9ca3af">${evts.length} event${evts.length > 1 ? 's' : ''}</span>
          </div>
          ${evts.map(renderTournamentCard).join('')}
        </div>`;
    }
    return html;
  }

  // ─── Practice List ──────────────────────────────────────────
  function renderPracticeList() {
    const events = practiceEvents();
    if (!events.length) {
      return '<div style="padding:32px;text-align:center;color:#9ca3af;font-size:13px">No upcoming practice sessions.</div>';
    }
    let html = '';
    events.forEach(ev => {
      const dateStr = fmtShort(ev.start_date);
      const timeStr = ev.start_time ? fmtTime(ev.start_time) + (ev.end_time ? ' - ' + fmtTime(ev.end_time) : '') : '';
      html += `
        <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #f3f4f6">
          <div style="width:80px;flex-shrink:0">
            <div style="font-size:12px;font-weight:600;color:#111">${dateStr}</div>
            <div style="font-size:10px;color:#9ca3af">${timeStr}</div>
          </div>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:600;color:#111">${ev.title}</div>
            ${ev.location ? `<div style="font-size:11px;color:#6b7280">${ev.location}</div>` : ''}
          </div>
        </div>`;
    });
    return html;
  }

  // ─── Full Calendar Grid ─────────────────────────────────────
  function renderFullCalendar() {
    const first = new Date(currentYear, currentMonth, 1);
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const startDay = first.getDay();
    const monthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Build day -> events map
    const dayEvents = {};
    filterByGrade(allEvents).forEach(e => {
      const s = new Date(e.start_date + 'T12:00:00');
      const end = e.end_date ? new Date(e.end_date + 'T12:00:00') : s;
      const cur = new Date(s);
      while (cur <= end) {
        const ms = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`;
        if (ms === monthStr) {
          const d = cur.getDate();
          if (!dayEvents[d]) dayEvents[d] = [];
          dayEvents[d].push(e);
        }
        cur.setDate(cur.getDate() + 1);
      }
    });

    const typeColor = { tournament: '#111', season: '#059669', game: '#f59e0b', camp: '#7c3aed', practice: '#2563eb', meeting: '#6b7280' };
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    let headerCells = dayNames.map(n =>
      `<div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#9ca3af;text-align:center;padding:6px 0">${n}</div>`
    ).join('');

    let cells = '';
    for (let i = 0; i < startDay; i++) {
      cells += '<div style="min-height:72px;border:1px solid #f3f4f6;border-radius:4px"></div>';
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isToday = dateStr === todayStr;
      const evts = dayEvents[d] || [];
      const pills = evts.slice(0, 2).map(e => {
        const c = typeColor[e.event_type] || '#6b7280';
        return `<div style="font-size:9px;padding:1px 4px;border-radius:3px;background:${c};color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;font-weight:500">${e.title}</div>`;
      }).join('');
      const more = evts.length > 2 ? `<div style="font-size:9px;color:#9ca3af;font-weight:500">+${evts.length - 2} more</div>` : '';

      cells += `
        <div style="min-height:72px;border:1px solid ${isToday ? '#111' : '#f3f4f6'};border-radius:4px;padding:4px;display:flex;flex-direction:column;gap:2px">
          <div style="font-size:10px;font-weight:${isToday ? '700' : '500'};color:${isToday ? '#111' : '#6b7280'};margin-bottom:1px">${d}</div>
          ${pills}${more}
        </div>`;
    }

    return `
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px">${headerCells}</div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px">${cells}</div>`;
  }

  // ─── Grade Filter Tabs ──────────────────────────────────────
  function renderGradeFilter() {
    const grades = [
      { key: 'all', label: 'All' },
      { key: '4th', label: '4th Grade' },
      { key: '5th', label: '5th Grade' }
    ];
    return grades.map(g => {
      const active = activeGrade === g.key;
      return `<button onclick="ScheduleView._setGrade('${g.key}')"
        style="padding:4px 12px;border-radius:6px;font-size:11px;font-weight:${active ? '600' : '500'};
        cursor:pointer;border:1px solid ${active ? '#111' : '#e5e7eb'};
        background:${active ? '#111' : '#fff'};color:${active ? '#fff' : '#6b7280'};
        transition:all 0.12s">${g.label}</button>`;
    }).join('');
  }

  // ─── Main View Tabs ─────────────────────────────────────────
  function renderTabs() {
    const tabs = ['Tournaments', 'Practice', 'Full Calendar'];
    return tabs.map((t, i) => {
      const active = activeTab === i;
      return `<div onclick="ScheduleView._setTab(${i})"
        style="font-size:12px;padding:8px 14px;cursor:pointer;font-weight:${active ? '600' : '400'};
        border-bottom:2px solid ${active ? '#111' : 'transparent'};
        color:${active ? '#111' : '#6b7280'};transition:all 0.12s">${t}</div>`;
    }).join('');
  }

  // ─── Render ─────────────────────────────────────────────────
  function render(id) {
    containerId = id;
    const container = document.getElementById(id);
    if (!container) return;

    const count = tournamentEvents().length;
    const countBadge = count > 0
      ? `<span style="font-size:10px;font-weight:600;background:#111;color:#fff;border-radius:10px;padding:2px 8px;margin-left:8px">${count} tournament${count !== 1 ? 's' : ''}</span>`
      : '';

    // Tab content
    let tabContent = '';
    if (activeTab === 0) tabContent = renderTournamentList();
    else if (activeTab === 1) tabContent = renderPracticeList();
    else if (activeTab === 2) tabContent = renderFullCalendar();

    container.innerHTML = `
      <div style="display:flex;gap:0;min-height:480px;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden">
        <!-- Left: Mini Calendar + Upcoming -->
        <div style="width:220px;flex-shrink:0;padding:16px;border-right:1px solid #e5e7eb;overflow-y:auto">
          ${renderMiniCalendar()}
          ${renderUpcoming()}
        </div>

        <!-- Right: Main content -->
        <div style="flex:1;display:flex;flex-direction:column;overflow:hidden">
          <!-- Header -->
          <div style="padding:14px 20px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
            <div style="display:flex;align-items:center">
              <h3 style="margin:0;font-size:15px;font-weight:700;color:#111">Schedule & Tournaments</h3>
              ${countBadge}
            </div>
            <div style="display:flex;gap:6px">${renderGradeFilter()}</div>
          </div>

          <!-- Tabs -->
          <div style="display:flex;padding:0 20px;border-bottom:1px solid #e5e7eb">${renderTabs()}</div>

          <!-- Tab Actions -->
          ${activeTab === 0 ? `
          <div style="display:flex;gap:8px;padding:12px 20px 0;justify-content:flex-end">
            <button onclick="ScheduleView._downloadPDF()" style="padding:6px 14px;border-radius:6px;border:1px solid #d1d5db;background:#fff;color:#374151;font-size:11px;cursor:pointer;font-weight:600">Download PDF</button>
            <button onclick="ScheduleView._downloadICS()" style="padding:6px 14px;border-radius:6px;border:none;background:#111;color:#fff;font-size:11px;cursor:pointer;font-weight:600">Add All to Calendar</button>
          </div>` : ''}

          <!-- Content -->
          <div style="flex:1;padding:${activeTab === 2 ? '12px 16px' : '16px 20px'};overflow-y:auto">${tabContent}</div>
        </div>
      </div>`;
  }

  // ─── PDF ────────────────────────────────────────────────────
  function downloadPDF() {
    const evts = tournamentEvents();
    if (!evts.length) return;
    const rows = evts.map(e => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #ddd;font-weight:600">${e.title}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #ddd">${fmtShort(e.start_date)}${e.end_date && e.end_date !== e.start_date ? ' - ' + fmtShort(e.end_date) : ''}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #ddd">${e.start_time ? fmtTime(e.start_time) : 'TBD'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #ddd">${e.location || 'TBD'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #ddd">${gradeLabel(e.grade_level)}</td>
      </tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Godspeed - Tournament Schedule</title>
<style>@page{margin:0.75in}body{font-family:Helvetica Neue,Helvetica,Arial,sans-serif;color:#111;margin:0;padding:20px}
h1{font-size:22px;letter-spacing:0.05em;margin:0 0 4px}.subtitle{color:#111;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:20px}
table{width:100%;border-collapse:collapse;font-size:13px}th{background:#f3f4f6;padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;border-bottom:2px solid #ddd}
.footer{margin-top:24px;font-size:11px;color:#9ca3af;text-align:center}</style></head><body>
<h1>GODSPEED BASKETBALL</h1><div class="subtitle">TOURNAMENT SCHEDULE - ${currentYear}</div>
<table><thead><tr><th>Tournament</th><th>Date</th><th>Time</th><th>Location</th><th>Division</th></tr></thead><tbody>${rows}</tbody></table>
<div class="footer">BROTHERHOOD. HABITS. SUCCESS.<br>Updated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
<script>window.onload=function(){window.print();}<\/script></body></html>`;
    const w = window.open('', '_blank', 'width=800,height=600');
    if (w) { w.document.write(html); w.document.close(); }
  }

  // ─── Public callbacks (exposed on window) ───────────────────
  function _toggle(id) { expandedId = expandedId === id ? null : id; render(containerId); }
  function _setGrade(g) { activeGrade = g; expandedId = null; render(containerId); }
  function _setTab(t) { activeTab = t; expandedId = null; render(containerId); }
  function _navMonth(dir) {
    currentMonth += dir;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    render(containerId);
  }
  function _addToCalendar(id) {
    const ev = allEvents.find(e => e.id === id);
    if (ev) downloadICS([ev]);
  }
  function _downloadICS() { downloadICS(); }
  function _downloadPDF() { downloadPDF(); }

  function _setAvail(tournamentId, tournamentName, status) {
    setAvailability(tournamentId, tournamentName, status);
  }

  return {
    init, load, render, downloadICS,
    _toggle, _setGrade, _setTab, _navMonth, _addToCalendar, _downloadICS, _downloadPDF, _setAvail
  };
})();
