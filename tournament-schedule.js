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
      .select('id,title,start_date,start_time,end_time,location,location_url,grade_level,description,end_date')
      .in('event_type', ['tournament', 'season'])
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

  // ─── RENDER (for parent portal) ───────────────────────────
  function render(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!tournaments.length) {
      container.innerHTML = '<p style="color:#6b7280;text-align:center;padding:32px">No upcoming tournaments scheduled.</p>';
      return;
    }

    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
        <h3 style="margin:0;font-size:18px;font-weight:700">Upcoming Tournaments</h3>
        <div style="display:flex;gap:8px">
          <button onclick="TournamentSchedule.downloadPDF()" style="padding:8px 16px;border-radius:8px;border:1px solid #d1d5db;background:#fff;color:#374151;font-size:13px;font-weight:600;cursor:pointer">Download PDF</button>
          <button onclick="TournamentSchedule.downloadICS()" style="padding:8px 16px;border-radius:8px;border:none;background:#2563eb;color:#fff;font-size:13px;font-weight:600;cursor:pointer">Add All to Calendar</button>
        </div>
      </div>`;

    for (const t of tournaments) {
      html += `
      <div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:12px;background:#fff">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
          <div>
            <div style="font-weight:700;font-size:16px;color:#111827">${t.title}</div>
            <div style="color:#6b7280;font-size:13px;margin-top:4px">${gradeLabel(t.grade_level)}</div>
          </div>
          <button onclick="TournamentSchedule.downloadSingleICS(TournamentSchedule.getById('${t.id}'))" style="padding:6px 12px;border-radius:6px;border:1px solid #d1d5db;background:#fff;color:#374151;font-size:12px;cursor:pointer;white-space:nowrap">Add to Calendar</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-top:12px">
          <div><div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em">Date</div><div style="font-size:14px;color:#374151;margin-top:2px">${formatDate(t.start_date)}${t.end_date && t.end_date !== t.start_date ? ' - ' + formatDate(t.end_date) : ''}</div></div>
          <div><div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em">Time</div><div style="font-size:14px;color:#374151;margin-top:2px">${t.start_time ? formatTime(t.start_time) : 'TBD'}</div></div>
          <div><div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em">Location</div><div style="font-size:14px;color:#374151;margin-top:2px">${t.location ? (t.location_url ? `<a href="${t.location_url}" target="_blank" style="color:#2563eb">${t.location}</a>` : t.location) : 'TBD'}</div></div>
        </div>
        ${t.description ? `<div style="margin-top:12px;font-size:13px;color:#6b7280;line-height:1.5">${t.description}</div>` : ''}
      </div>`;
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
