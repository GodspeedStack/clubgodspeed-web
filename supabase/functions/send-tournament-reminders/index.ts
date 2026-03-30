/**
 * send-tournament-reminders
 *
 * Cron: Tuesday & Thursday at 6 PM CT (weekly)
 * Fetches tournaments in the next 14 days, resolves all parent emails
 * from the dues enrollment table, enforces weekly dedup via
 * tournament_reminder_log, and sends a branded Resend email
 * with tournament schedule + .ics download link.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FROM_EMAIL       = 'Godspeed Basketball <noreply@clubgodspeed.com>'
const SITE_URL         = 'https://www.clubgodspeed.com'

interface Tournament {
  id: string
  title: string
  start_date: string
  start_time: string | null
  end_time: string | null
  location: string | null
  location_url: string | null
  grade_level: string | null
  description: string | null
}

interface ParentContact {
  email: string
  name: string
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  })
}

function formatTime(timeStr: string | null): string {
  if (!timeStr) return ''
  const [h, m] = timeStr.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hr = h % 12 || 12
  return `${hr}:${String(m).padStart(2, '0')} ${ampm}`
}

function getWeekKey(): string {
  const now = new Date()
  const startOfYear = new Date(now.getFullYear(), 0, 1)
  const days = Math.floor((now.getTime() - startOfYear.getTime()) / 86_400_000)
  const week = Math.ceil((days + startOfYear.getDay() + 1) / 7)
  return `${now.getFullYear()}-W${String(week).padStart(2, '0')}`
}

function gradeLabel(g: string | null): string {
  if (g === '4th') return '4th Grade'
  if (g === '5th') return '5th Grade'
  return 'Both Teams'
}

function buildEmailHtml(tournaments: Tournament[]): string {
  const rows = tournaments.map(t => `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb">
        <div style="font-weight:700;font-size:15px;color:#111827">${t.title}</div>
        <div style="color:#6b7280;font-size:13px;margin-top:4px">${gradeLabel(t.grade_level)}</div>
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:14px">
        ${formatDate(t.start_date)}${t.start_time ? '<br>' + formatTime(t.start_time) : ''}
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:14px">
        ${t.location ? (t.location_url ? `<a href="${t.location_url}" style="color:#2563eb">${t.location}</a>` : t.location) : 'TBD'}
      </td>
    </tr>`).join('')

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:640px;margin:0 auto;padding:24px">
  <div style="background:#111827;border-radius:12px 12px 0 0;padding:24px;text-align:center">
    <h1 style="color:#fff;font-size:22px;margin:0;letter-spacing:0.05em">GODSPEED</h1>
    <p style="color:#60a5fa;font-size:12px;margin:4px 0 0;letter-spacing:0.1em">UPCOMING TOURNAMENTS</p>
  </div>
  <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none">
    <p style="color:#374151;font-size:15px;margin:0 0 16px">Here are the upcoming tournaments for the next two weeks. Please review and plan accordingly.</p>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <thead>
        <tr style="background:#f9fafb">
          <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Tournament</th>
          <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Date</th>
          <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Location</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:20px;text-align:center">
      <a href="${SITE_URL}/parent-portal.html#tournaments" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">View Full Schedule</a>
    </div>
    <p style="color:#9ca3af;font-size:12px;margin-top:20px;text-align:center">Download the tournament schedule as a PDF or add dates to your phone calendar from the parent portal.</p>
  </div>
  <p style="color:#9ca3af;font-size:11px;text-align:center;margin-top:16px">BROTHERHOOD. HABITS. SUCCESS.</p>
</div>
</body>
</html>`
}

Deno.serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // 1. Fetch tournaments in next 14 days
    const { data: tournaments, error: tErr } = await supabase
      .rpc('get_upcoming_tournaments', { p_days_ahead: 14 })

    if (tErr) throw new Error(`Tournament query failed: ${tErr.message}`)
    if (!tournaments || tournaments.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: 'No upcoming tournaments', sent: 0 }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // 2. Get all parent emails from active enrollments (non-placeholder)
    const { data: enrollments, error: eErr } = await supabase
      .from('parent_dues_enrollment')
      .select('parent_email, parent_name')
      .eq('status', 'active')
      .not('parent_email', 'like', 'pending-%')

    if (eErr) throw new Error(`Enrollment query failed: ${eErr.message}`)

    // Also get all parent profiles with role = 'parent'
    const { data: profiles, error: pErr } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('role', 'parent')

    if (pErr) throw new Error(`Profile query failed: ${pErr.message}`)

    // Deduplicate parent contacts
    const contactMap = new Map<string, ParentContact>()
    for (const e of (enrollments || [])) {
      if (e.parent_email && !e.parent_email.startsWith('pending-')) {
        contactMap.set(e.parent_email, { email: e.parent_email, name: e.parent_name || 'Parent' })
      }
    }
    for (const p of (profiles || [])) {
      if (p.email && !contactMap.has(p.email)) {
        contactMap.set(p.email, { email: p.email, name: p.full_name || 'Parent' })
      }
    }

    const parents = Array.from(contactMap.values())
    if (parents.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: 'No parent contacts found', sent: 0 }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // 3. Check weekly dedup
    const weekKey = getWeekKey()
    const { data: alreadySent } = await supabase
      .from('tournament_reminder_log')
      .select('parent_email')
      .eq('week_key', weekKey)

    const sentEmails = new Set((alreadySent || []).map(r => r.parent_email))
    const toSend = parents.filter(p => !sentEmails.has(p.email))

    if (toSend.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: 'All reminders already sent this week', sent: 0 }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // 4. Build email
    const html = buildEmailHtml(tournaments as Tournament[])
    const eventIds = (tournaments as Tournament[]).map(t => t.id)
    const subject = `Upcoming Tournaments - ${formatDate(tournaments[0].start_date)}`

    // 5. Send emails (batch via Resend)
    let sent = 0
    const BATCH_SIZE = 50
    for (let i = 0; i < toSend.length; i += BATCH_SIZE) {
      const batch = toSend.slice(i, i + BATCH_SIZE)

      for (const parent of batch) {
        try {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${RESEND_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: FROM_EMAIL,
              to: [parent.email],
              subject,
              html
            })
          })

          if (res.ok) {
            sent++
            // Log for dedup
            await supabase.from('tournament_reminder_log').insert({
              parent_email: parent.email,
              event_ids: eventIds,
              week_key: weekKey
            })
          } else {
            console.error(`Failed to send to ${parent.email}: ${await res.text()}`)
          }
        } catch (err) {
          console.error(`Email error for ${parent.email}:`, err)
        }
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      tournaments: tournaments.length,
      parents: toSend.length,
      sent
    }), { headers: { 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('Tournament reminder error:', err)
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
