/**
 * send-practice-update
 *
 * Invoked by admin "Save & Notify Parents" button after toggling practices.
 * Receives { cancellations: Change[], restorations: Change[] }
 * where Change = { dateStr, title, loc }.
 * Sends a single consolidated branded email to all parents.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FROM_EMAIL       = 'Godspeed Basketball <noreply@clubgodspeed.com>'
const SITE_URL         = 'https://www.clubgodspeed.com'

interface Change {
  dateStr: string
  title: string
  loc: string
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  })
}

function buildEmailHtml(cancellations: Change[], restorations: Change[]): string {
  let body = ''

  if (cancellations.length > 0) {
    const rows = cancellations.map(c => `
      <tr>
        <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb">
          <span style="display:inline-block;font-size:10px;padding:2px 8px;border-radius:4px;background:#fef2f2;color:#dc2626;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">Cancelled</span>
        </td>
        <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;font-weight:700;font-size:14px;color:#111827">${c.title}</td>
        <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:14px">${formatDate(c.dateStr)}</td>
        <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:14px">${c.loc || ''}</td>
      </tr>`).join('')
    body += rows
  }

  if (restorations.length > 0) {
    const rows = restorations.map(r => `
      <tr>
        <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb">
          <span style="display:inline-block;font-size:10px;padding:2px 8px;border-radius:4px;background:#f0fdf4;color:#16a34a;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">Restored</span>
        </td>
        <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;font-weight:700;font-size:14px;color:#111827">${r.title}</td>
        <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:14px">${formatDate(r.dateStr)}</td>
        <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:14px">${r.loc || ''}</td>
      </tr>`).join('')
    body += rows
  }

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:640px;margin:0 auto;padding:24px">
  <div style="background:#111827;border-radius:12px 12px 0 0;padding:24px;text-align:center">
    <h1 style="color:#fff;font-size:22px;margin:0;letter-spacing:0.05em">GODSPEED</h1>
    <p style="color:#60a5fa;font-size:12px;margin:4px 0 0;letter-spacing:0.1em">PRACTICE UPDATE</p>
  </div>
  <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none">
    <p style="color:#374151;font-size:15px;margin:0 0 16px">The following practice schedule changes have been made. Please update your plans accordingly.</p>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <thead>
        <tr style="background:#f9fafb">
          <th style="padding:8px 16px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Status</th>
          <th style="padding:8px 16px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Practice</th>
          <th style="padding:8px 16px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Date</th>
          <th style="padding:8px 16px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Location</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
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

    const { cancellations = [], restorations = [] } = await req.json() as {
      cancellations: Change[]
      restorations: Change[]
    }

    if (cancellations.length === 0 && restorations.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, message: 'No changes' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Resolve parent emails
    const { data: profiles } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('role', 'parent')
      .eq('approved', true)

    const parents = (profiles || []).filter(p => p.email)
    if (parents.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, message: 'No parent contacts' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Build subject
    const totalChanges = cancellations.length + restorations.length
    const subject = cancellations.length > 0 && restorations.length === 0
      ? (cancellations.length === 1
        ? `Practice Cancelled: ${formatDate(cancellations[0].dateStr)}`
        : `${cancellations.length} Practices Cancelled`)
      : restorations.length > 0 && cancellations.length === 0
        ? `Practice Restored: ${formatDate(restorations[0].dateStr)}`
        : `Practice Schedule Update (${totalChanges} changes)`

    const html = buildEmailHtml(cancellations, restorations)

    let sent = 0
    for (const parent of parents) {
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

    return new Response(JSON.stringify({ ok: true, sent, total_parents: parents.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('send-practice-update error:', err)
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
