/**
 * tournament-schedule.js
 * Parent-facing module for tournament schedule display, PDF download, and .ics export.
 * Loaded by parent-portal.html in the Tournaments section.
 */
'use strict';

const TournamentSchedule = (() => {
  let supabase = null;
  let tournaments = [];

  function init(supabaseClient) {
    supabase = supabaseClient;
  }

  async function load() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('calendar_events')
      .select('id,title,event_type,start_date,start_time,end_time,end_date,location,location_url,grade_level,description,cost,tags')
      .in('event_type', ['tournament', 'season', 'game', 'camp'])
      .eq('is_cancelled', false)
      .not('published_at', 'is', null)
      .in('visibility', ['public', 'team_only'])
      .gte('start_date', new Date().toISOString().split('T')[0])
      .order('start_date', { ascending: true });
    if (error) { console.error('Tournament load error:', error); return; }
    tournaments = data || [];
    return tournaments;
  }

  function formatDate(dateStr) {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    });
  }

  function formatTime(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
  }

  function gradeLabel(g) {
    if (g === '4th') return '4th Grade';
    if (g === '5th') return '5th Grade';
    return 'Both Teams';
  }

  // ─── .ICS GENERATION ──────────────────────────────────────
  function toICSDate(dateStr, timeStr) {
    // Format: YYYYMMDDTHHMMSS
    const d = dateStr.replace(/-/g, '');
    if (timeStr) {
      const t = timeStr.replace(/:/g, '').padEnd(6, '0');
      return d + 'T' + t;
    }
    return d;
  }

  function generateICS(events) {
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Godspeed Basketball//Tournament Schedule//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Godspeed Tournaments'
    ];

    for (const e of events) {
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${e.id}@clubgodspeed.com`);
      lines.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`);

      if (e.start_time) {
        lines.push(`DTSTART:${toICSDate(e.start_date, e.start_time)}`);
        if (e.end_time) {
          lines.push(`DTEND:${toICSDate(e.end_date || e.start_date, e.end_time)}`);
        }
      } else {
        // All-day event
        lines.push(`DTSTART;VALUE=DATE:${toICSDate(e.start_date)}`);
        if (e.end_date && e.end_date !== e.start_date) {
          // ICS all-day end date is exclusive (day after)
          const endPlusOne = new Date(e.end_date + 'T12:00:00');
          endPlusOne.setDate(endPlusOne.getDate() + 1);
          lines.push(`DTEND;VALUE=DATE:${endPlusOne.toISOString().split('T')[0].replace(/-/g, '')}`);
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

  function escICS(str) {
    return (str || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  }

  function downloadICS(events) {
    const evts = events || tournaments;
    if (!evts.length) return alert('No upcoming tournaments to add.');
    const ics = generateICS(evts);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'godspeed-tournaments.ics';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function downloadSingleICS(event) {
    downloadICS([event]);
  }

  // ─── PDF GENERATION ───────────────────────────────────────
  async function downloadPDF(events) {
    const evts = events || tournaments;
    if (!evts.length) return alert('No upcoming tournaments.');

    // Build a print-friendly HTML document and trigger print/save as PDF
    const rows = evts.map(e => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #ddd;font-weight:600">${e.title}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #ddd">${formatDate(e.start_date)}${e.end_date && e.end_date !== e.start_date ? ' - ' + formatDate(e.end_date) : ''}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #ddd">${e.start_time ? formatTime(e.start_time) : 'TBD'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #ddd">${e.location || 'TBD'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #ddd">${gradeLabel(e.grade_level)}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Godspeed Basketball - Tournament Schedule</title>
<style>
  @page { margin: 0.75in; }
  body { font-family: Helvetica Neue, Helvetica, Arial, sans-serif; color: #111; margin: 0; padding: 20px; }
  h1 { font-size: 22px; letter-spacing: 0.05em; margin: 0 0 4px; }
  .subtitle { color: #2563eb; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { background: #f3f4f6; padding: 8px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 2px solid #ddd; }
  .footer { margin-top: 24px; font-size: 11px; color: #9ca3af; text-align: center; }
</style></head>
<body>
  <h1>GODSPEED BASKETBALL</h1>
  <div class="subtitle">TOURNAMENT SCHEDULE - ${new Date().getFullYear()}</div>
  <table>
    <thead><tr><th>Tournament</th><th>Date</th><th>Time</th><th>Location</th><th>Division</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">BROTHERHOOD. HABITS. SUCCESS.<br>Updated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
  <script>window.onload=function(){window.print();}<\/script>
</body></html>`;

    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
    } else {
      alert('Please allow popups to download the PDF.');
    }
  }

  // ─── TYPE BADGE ─────────────────────────────────────────────
  function typeBadge(eventType) {
    const colors = {
      tournament: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
      season:     { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
      game:       { bg: '#fefce8', color: '#a16207', border: '#fef08a' },
      camp:       { bg: '#fdf4ff', color: '#7e22ce', border: '#e9d5ff' }
    };
    const c = colors[eventType] || { bg: '#f3f4f6', color: '#374151', border: '#e5e7eb' };
    const label = (eventType || 'event').toUpperCase();
    return `<span style="display:inline-block;font-size:10px;padding:2px 8px;border-radius:4px;background:${c.bg};color:${c.color};border:1px solid ${c.border};font-weight:700;letter-spacing:0.04em">${label}</span>`;
  }

  function formatDateShort(dateStr) {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'short', day: 'numeric'
    });
  }

  // ─── RENDER (for parent portal) ───────────────────────────
  function render(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!tournaments.length) {
      container.innerHTML = '<p style="color:#6b7280;text-align:center;padding:32px">No upcoming events scheduled.</p>';
      return;
    }

    // Group by month
    const months = {};
    tournaments.forEach(t => {
      const d = new Date(t.start_date + 'T12:00:00');
      const key = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (!months[key]) months[key] = [];
      months[key].push(t);
    });

    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:8px">
        <h3 style="margin:0;font-size:18px;font-weight:800;text-transform:uppercase;letter-spacing:-0.01em;color:#111">Our Schedule</h3>
        <div style="display:flex;gap:8px">
          <button onclick="TournamentSchedule.downloadPDF()" style="padding:8px 16px;border-radius:8px;border:1px solid #d1d5db;background:#fff;color:#374151;font-size:13px;font-weight:600;cursor:pointer">Download PDF</button>
          <button onclick="TournamentSchedule.downloadICS()" style="padding:8px 16px;border-radius:8px;border:none;background:#2563eb;color:#fff;font-size:13px;font-weight:600;cursor:pointer">Add All to Calendar</button>
        </div>
      </div>`;

    for (const [month, events] of Object.entries(months)) {
      html += `
      <div style="margin-bottom:24px">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;margin-bottom:4px;border-bottom:2px solid #e5e7eb">
          <span style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#111">${month}</span>
          <span style="font-size:11px;font-weight:600;color:#9ca3af">${events.length} event${events.length > 1 ? 's' : ''}</span>
        </div>`;

      for (const t of events) {
        const isBackup = Array.isArray(t.tags) && t.tags.includes('backup');
        const dateLabel = t.end_date && t.end_date !== t.start_date
          ? `${formatDateShort(t.start_date)} - ${formatDateShort(t.end_date)}`
          : formatDateShort(t.start_date);
        const locationText = t.location
          ? (t.location_url ? `<a href="${t.location_url}" target="_blank" style="color:#2563eb;text-decoration:none">${t.location}</a>` : t.location)
          : '--';
        const backupTag = isBackup ? '<span style="display:inline-block;font-size:10px;padding:2px 6px;border-radius:4px;background:#eff6ff;color:#2563eb;font-weight:700;border:1px solid #bfdbfe;margin-left:6px">BACKUP</span>' : '';

        html += `
        <div style="display:grid;grid-template-columns:90px 1fr auto;gap:12px;padding:12px 0;border-bottom:1px solid #f3f4f6;align-items:center">
          <div>
            <div style="font-size:13px;font-weight:700;color:#111">${dateLabel}</div>
            ${t.start_time ? `<div style="font-size:11px;color:#9ca3af;margin-top:2px">${formatTime(t.start_time)}</div>` : ''}
          </div>
          <div>
            <div style="font-weight:700;font-size:14px;color:#111827">${t.title}${backupTag}</div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap">
              ${typeBadge(t.event_type)}
              <span style="font-size:12px;color:#6b7280">${locationText}</span>
            </div>
          </div>
          <div>
            <button onclick="TournamentSchedule.downloadSingleICS(TournamentSchedule.getById('${t.id}'))" style="padding:6px 10px;border-radius:6px;border:1px solid #d1d5db;background:#fff;color:#374151;font-size:11px;cursor:pointer;white-space:nowrap;font-weight:600">+ Calendar</button>
          </div>
        </div>`;
      }

      html += '</div>';
    }

    container.innerHTML = html;
  }

  function getById(id) {
    return tournaments.find(t => t.id === id) || null;
  }

  function getAll() { return tournaments; }

  return { init, load, render, downloadICS, downloadSingleICS, downloadPDF, getById, getAll, formatDate, gradeLabel };
})();

if (typeof window !== 'undefined') window.TournamentSchedule = TournamentSchedule;
