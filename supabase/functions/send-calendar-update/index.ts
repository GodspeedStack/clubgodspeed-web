/**
 * send-calendar-update
 *
 * Invoked by admin "Publish to Parents" button.
 * Receives { event_ids: string[] }, fetches event details,
 * resolves parent emails, sends branded Resend email,
 * logs to calendar_push_log for audit/dedup.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FROM_EMAIL       = 'Godspeed Basketball <noreply@clubgodspeed.com>'
const SITE_URL         = 'https://www.clubgodspeed.com'

interface CalendarEvent {
  id: string
  title: string
  event_type: string
  start_date: string
  start_time: string | null
  end_date: string | null
  end_time: string | null
  location: string | null
  cost: number | null
  notes: string | null
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric'
  })
}

function formatTime(timeStr: string | null): string {
  if (!timeStr) return ''
  const [h, m] = timeStr.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hr = h % 12 || 12
  return `${hr}:${String(m).padStart(2, '0')} ${ampm}`
}

function buildEmailHtml(events: CalendarEvent[]): string {
  const rows = events.map(e => {
    const dateLabel = e.end_date && e.end_date !== e.start_date
      ? `${formatDate(e.start_date)} - ${formatDate(e.end_date)}`
      : formatDate(e.start_date)
    const time = e.start_time ? formatTime(e.start_time) + (e.end_time ? ' - ' + formatTime(e.end_time) : '') : ''
    const typeBadge = e.event_type
      ? `<span style="display:inline-block;font-size:10px;padding:2px 6px;border-radius:4px;background:#f3f4f6;color:#374151;text-transform:capitalize;font-weight:600;margin-left:6px">${e.event_type}</span>`
      : ''
    return `
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb">
          <div style="font-weight:700;font-size:15px;color:#111827">${e.title}${typeBadge}</div>
          ${e.notes ? `<div style="color:#6b7280;font-size:12px;margin-top:4px">${e.notes}</div>` : ''}
        </td>
        <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:14px;white-space:nowrap">
          ${dateLabel}${time ? '<br>' + time : ''}
        </td>
        <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:14px">
          ${e.location || 'TBD'}
        </td>
      </tr>`
  }).join('')

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:640px;margin:0 auto;padding:24px">
  <div style="background:#111827;border-radius:12px 12px 0 0;padding:24px;text-align:center">
    <h1 style="color:#fff;font-size:22px;margin:0;letter-spacing:0.05em">GODSPEED</h1>
    <p style="color:#60a5fa;font-size:12px;margin:4px 0 0;letter-spacing:0.1em">SCHEDULE UPDATE</p>
  </div>
  <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none">
    <p style="color:#374151;font-size:15px;margin:0 0 16px">New events have been added to the team schedule. Please review and plan accordingly.</p>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <thead>
        <tr style="background:#f9fafb">
          <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Event</th>
          <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Date</th>
          <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Location</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:20px;text-align:center">
      <a href="${SITE_URL}/parent-portal.html" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">View Full Schedule</a>
    </div>
  </div>
  <p style="color:#9ca3af;font-size:11px;text-align:center;margin-top:16px">BROTHERHOOD. HABITS. SUCCESS.</p>
</div>
</body>
</html>`
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { event_ids } = await req.json()
    if (!event_ids || !Array.isArray(event_ids) || event_ids.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: 'event_ids required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 1. Fetch event details
    const { data: events, error: evErr } = await supabase
      .from('calendar_events')
      .select('id, title, event_type, start_date, start_time, end_date, end_time, location, cost, notes')
      .in('id', event_ids)
      .order('start_date', { ascending: true })

    if (evErr) throw new Error(`Event query failed: ${evErr.message}`)
    if (!events || events.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: 'No events found', sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 2. Resolve parent emails (enrollments + profiles)
    const { data: enrollments } = await supabase
      .from('parent_dues_enrollment')
      .select('parent_email, parent_name')
      .eq('status', 'active')
      .not('parent_email', 'like', 'pending-%')

    const { data: profiles } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('role', 'parent')

    const contactMap = new Map<string, { email: string; name: string }>()
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
      return new Response(JSON.stringify({ ok: true, message: 'No parent contacts', sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 3. Build + send emails
    const html = buildEmailHtml(events as CalendarEvent[])
    const subject = events.length === 1
      ? `Schedule Update: ${events[0].title}`
      : `Schedule Update: ${events.length} New Events`

    let sent = 0
    const BATCH_SIZE = 50

    for (let i = 0; i < parents.length; i += BATCH_SIZE) {
      const batch = parents.slice(i, i + BATCH_SIZE)
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
          if (res.ok) sent++
          else console.error(`Failed to send to ${parent.email}: ${await res.text()}`)
        } catch (sendErr) {
          console.error(`Send error for ${parent.email}:`, sendErr)
        }
      }
    }

    // 4. Log to calendar_push_log
    await supabase.from('calendar_push_log').insert({
      event_ids,
      recipient_count: sent,
      pushed_by: 'admin'
    })

    return new Response(JSON.stringify({ ok: true, sent, total_parents: parents.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('send-calendar-update error:', err)
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
