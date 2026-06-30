import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL')!
const ADMIN_EMAIL = 'jewellsco@gmail.com'
const FUNCTION_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1/notify-admin-signup`

// ---------------------------------------------------------------------------
// Branded admin notification email
// ---------------------------------------------------------------------------
function buildAdminEmail(profile: {
  email: string
  full_name: string | null
  phone: string | null
  player_name: string | null
  grade: string | null
  date_of_birth: string | null
  created_at: string
}, approveUrl: string): string {
  const name = profile.full_name || profile.email
  const created = new Date(profile.created_at).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  })

  // Calculate age from DOB if available
  let ageDisplay = ''
  if (profile.date_of_birth) {
    const dob = new Date(profile.date_of_birth)
    const now = new Date()
    const age = Math.floor((now.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    ageDisplay = `${age} years old`
  }

  // Profile info rows (only show fields that have data)
  const rows: [string, string][] = []
  rows.push(['Parent Name', name])
  rows.push(['Email', profile.email])
  if (profile.phone) rows.push(['Phone', profile.phone])
  if (profile.player_name) rows.push(['Player Name', profile.player_name])
  if (profile.grade) rows.push(['Grade', profile.grade])
  if (ageDisplay) rows.push(['Player Age', ageDisplay])
  if (profile.date_of_birth) rows.push(['Date of Birth', profile.date_of_birth])
  rows.push(['Signed Up', created])

  const profileRows = rows.map(([label, value]) =>
    `<tr>
      <td style="padding:10px 14px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;border-bottom:1px solid #f3f4f6;width:130px;">${label}</td>
      <td style="padding:10px 14px;font-size:14px;color:#111;border-bottom:1px solid #f3f4f6;">${value}</td>
    </tr>`
  ).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f5f7;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#111;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f7;">
<tr><td align="center" style="padding:40px 16px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid rgba(0,0,0,0.05);box-shadow:0 4px 6px rgba(0,0,0,0.02);">
    <!-- Header -->
    <tr><td style="background-color:#111111;padding:32px 20px;text-align:center;">
      <span style="font-size:22px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;">GODSPEED</span><span style="font-size:22px;font-weight:900;color:#2563eb;letter-spacing:-0.5px;">BASKETBALL</span>
    </td></tr>
    <!-- Alert Banner -->
    <tr><td style="background-color:#2563eb;padding:14px 20px;text-align:center;">
      <span style="font-size:13px;font-weight:700;color:#ffffff;text-transform:uppercase;letter-spacing:0.1em;">New Parent Signup</span>
    </td></tr>
    <!-- Body -->
    <tr><td style="padding:32px 36px;">
      <p style="font-size:15px;color:#4b5563;margin:0 0 20px;">A new parent just created an account and is waiting for approval.</p>

      <!-- Profile Card -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin:0 0 28px;">
        <tr><td style="background:#f9fafb;padding:10px 14px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#374151;border-bottom:1px solid #e5e7eb;">Profile</td></tr>
        ${profileRows}
      </table>

      <!-- Approve Button -->
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 16px;">
        <tr><td style="background-color:#16a34a;border-radius:8px;">
          <a href="${approveUrl}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:'Inter',Helvetica,Arial,sans-serif;font-size:14px;font-weight:800;color:#ffffff;text-decoration:none;text-transform:uppercase;letter-spacing:0.1em;">Approve Account</a>
        </td></tr>
      </table>
      <p style="text-align:center;font-size:12px;color:#9ca3af;margin:0;">This will activate their portal access and send a welcome email.</p>
    </td></tr>
    <!-- Footer -->
    <tr><td style="background-color:#fafafa;padding:20px;text-align:center;font-size:12px;color:#9ca3af;border-top:1px solid #f3f4f6;">
      &copy; ${new Date().getFullYear()} Godspeed Basketball &middot; Admin Notification
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Approval success page (shown after clicking Approve in email)
// ---------------------------------------------------------------------------
function approvalSuccessHtml(name: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Account Approved</title></head>
<body style="margin:0;padding:60px 16px;background:#f5f5f7;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:center;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:48px 36px;border:1px solid rgba(0,0,0,0.05);box-shadow:0 4px 6px rgba(0,0,0,0.02);">
    <div style="width:56px;height:56px;border-radius:50%;background:#16a34a;margin:0 auto 20px;display:flex;align-items:center;justify-content:center;">
      <span style="color:#fff;font-size:28px;line-height:56px;">&#10003;</span>
    </div>
    <h1 style="font-size:20px;font-weight:800;color:#111;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.05em;">Account Approved</h1>
    <p style="font-size:15px;color:#4b5563;margin:0 0 8px;">${name} now has full portal access.</p>
    <p style="font-size:13px;color:#9ca3af;margin:0;">A welcome email has been sent automatically.</p>
  </div>
</body>
</html>`
}

function alreadyApprovedHtml(name: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Already Approved</title></head>
<body style="margin:0;padding:60px 16px;background:#f5f5f7;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:center;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:48px 36px;border:1px solid rgba(0,0,0,0.05);">
    <h1 style="font-size:20px;font-weight:800;color:#111;margin:0 0 12px;">Already Approved</h1>
    <p style="font-size:15px;color:#4b5563;margin:0;">${name} was already approved.</p>
  </div>
</body>
</html>`
}

function errorHtml(msg: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Error</title></head>
<body style="margin:0;padding:60px 16px;background:#f5f5f7;font-family:sans-serif;text-align:center;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:48px 36px;border:1px solid rgba(0,0,0,0.05);">
    <h1 style="font-size:20px;color:#dc2626;margin:0 0 12px;">Approval Failed</h1>
    <p style="color:#4b5563;">${msg}</p>
  </div>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Send email via Resend
// ---------------------------------------------------------------------------
async function sendViaResend(to: string, subject: string, html: string): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  })
  if (!res.ok) {
    console.error('Resend error:', await res.text())
  }
  return res.ok
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const action = url.searchParams.get('action')

  // ── GET ?action=approve&token=xxx ── One-click approval from email ──
  if (req.method === 'GET' && action === 'approve') {
    const token = url.searchParams.get('token')
    if (!token) {
      return new Response(errorHtml('Missing approval token.'), {
        headers: { 'Content-Type': 'text/html' }, status: 400
      })
    }

    // Look up the notification by token
    const { data: notif, error: notifErr } = await supabase
      .from('admin_signup_notifications')
      .select('profile_id, email, full_name')
      .eq('approval_token', token)
      .single()

    if (notifErr || !notif) {
      return new Response(errorHtml('Invalid or expired approval token.'), {
        headers: { 'Content-Type': 'text/html' }, status: 404
      })
    }

    // Check if already approved
    const { data: profile } = await supabase
      .from('profiles')
      .select('approved, full_name')
      .eq('id', notif.profile_id)
      .single()

    if (profile?.approved) {
      return new Response(alreadyApprovedHtml(profile.full_name || notif.email), {
        headers: { 'Content-Type': 'text/html' }
      })
    }

    // Approve the account — this triggers trg_queue_welcome (welcome email)
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ approved: true, updated_at: new Date().toISOString() })
      .eq('id', notif.profile_id)

    if (updateErr) {
      console.error('Approval update failed:', updateErr)
      return new Response(errorHtml('Database error. Try again or approve manually.'), {
        headers: { 'Content-Type': 'text/html' }, status: 500
      })
    }

    // Mark notification as approved
    await supabase
      .from('admin_signup_notifications')
      .update({ status: 'approved' })
      .eq('approval_token', token)

    const displayName = notif.full_name || notif.email
    return new Response(approvalSuccessHtml(displayName), {
      headers: { 'Content-Type': 'text/html' }
    })
  }

  // ── POST (cron or direct) ── Process pending notifications ──────────

  // Parse body for registration-page enrollment data
  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch { /* no body or invalid JSON — that's fine for cron calls */ }

  const { data: pending, error: fetchErr } = await supabase
    .from('admin_signup_notifications')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(10)

  let sent = 0
  let failed = 0

  if (!fetchErr && pending && pending.length > 0) {
    for (const item of pending) {
      try {
        const approveUrl = `${FUNCTION_URL}?action=approve&token=${item.approval_token}`

        const ok = await sendViaResend(
          ADMIN_EMAIL,
          `New Signup: ${item.full_name || item.email}`,
          buildAdminEmail({
            email: item.email,
            full_name: item.full_name,
            phone: item.phone,
            player_name: item.player_name,
            grade: item.grade,
            date_of_birth: item.date_of_birth,
            created_at: item.created_at,
          }, approveUrl)
        )

        await supabase
          .from('admin_signup_notifications')
          .update({ status: ok ? 'sent' : 'failed' })
          .eq('id', item.id)

        ok ? sent++ : failed++
      } catch (err) {
        console.error(`Exception processing ${item.email}:`, err)
        await supabase
          .from('admin_signup_notifications')
          .update({ status: 'failed' })
          .eq('id', item.id)
        failed++
      }
    }
  }

  // ── Auto-enroll: create athlete + link + enrollment from registration ──
  let enrollment: Record<string, unknown> | null = null

  if (body.source === 'registration_page' && body.email) {
    try {
      const email = String(body.email).toLowerCase()
      const fullName = String(body.full_name || '')
      const athleteName = String(body.athlete_name || '')
      const teamLabel = String(body.team || '')
      const duesAmount = Number(body.dues_amount) || 250

      // Parse athlete first/last name
      const nameParts = athleteName.trim().split(/\s+/)
      const athleteFirst = nameParts[0] || ''
      const athleteLast = nameParts.slice(1).join(' ') || ''

      if (!athleteFirst) {
        console.error('Auto-enroll skipped: no athlete first name')
      } else {
        // 1. Look up parent profile (created by handle_new_user trigger)
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', email)
          .maybeSingle()

        // 2. Create athlete record
        const { data: athlete, error: athleteErr } = await supabase
          .from('athletes')
          .insert({
            first_name: athleteFirst,
            last_name: athleteLast,
            team_name: teamLabel,
            enrollment_status: 'active',
            season: 'Summer 2026',
          })
          .select('id')
          .single()

        if (athleteErr) {
          console.error('Auto-enroll athlete insert failed:', athleteErr)
        } else {
          // 3. Link parent to athlete (if profile exists yet)
          if (profile) {
            const { error: linkErr } = await supabase.rpc('link_parent_to_athlete', {
              p_profile_id: profile.id,
              p_athlete_id: athlete.id,
              p_relationship: 'guardian',
              p_is_primary: true,
            })
            if (linkErr) console.error('Auto-enroll link failed:', linkErr)
          }

          // 4. Create enrollment
          const LATE_SEASON_CONFIG = '3a06d4cb-1d0e-4533-87f9-d88670e19fb8'
          const LATE_SEASON_PLAN   = '17f26289-195b-4439-8f28-19f28c3241bf'

          const { data: enr, error: enrErr } = await supabase
            .from('parent_dues_enrollment')
            .insert({
              parent_email: email,
              parent_name: fullName,
              athlete_name: athleteFirst,
              dues_config_id: LATE_SEASON_CONFIG,
              plan_template_id: LATE_SEASON_PLAN,
              total_owed: duesAmount,
              total_paid: 0,
              status: 'active',
            })
            .select('id')
            .single()

          if (enrErr) {
            console.error('Auto-enroll enrollment insert failed:', enrErr)
          } else {
            // 5. Create single installment (due immediately)
            const { error: instErr } = await supabase
              .from('dues_installments')
              .insert({
                enrollment_id: enr.id,
                installment_number: 1,
                amount: duesAmount,
                due_date: new Date().toISOString().split('T')[0],
                status: 'pending',
              })

            if (instErr) console.error('Auto-enroll installment insert failed:', instErr)

            enrollment = { id: enr.id, athlete: athlete.id, amount: duesAmount }
          }
        }
      }
    } catch (err) {
      console.error('Auto-enroll exception:', err)
    }
  }

  return new Response(JSON.stringify({
    processed: pending?.length ?? 0,
    sent,
    failed,
    enrollment,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
})
