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

// ---------------------------------------------------------------------------
// Branded HTML email shell — matches clubgodspeed.com design system
// ---------------------------------------------------------------------------
function htmlWrap(heading: string, bodyHtml: string, ctaUrl?: string, ctaLabel?: string): string {
  const cta = ctaUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:30px auto 10px;">
        <tr><td style="background-color:#2563eb;border-radius:8px;">
          <a href="${ctaUrl}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:'Inter',Helvetica,Arial,sans-serif;font-size:14px;font-weight:800;color:#ffffff;text-decoration:none;text-transform:uppercase;letter-spacing:0.1em;">${ctaLabel || 'Open Dashboard'}</a>
        </td></tr>
       </table>`
    : ''

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
    <!-- Body -->
    <tr><td style="padding:36px 40px;">
      <h1 style="font-size:20px;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 24px;color:#111;">${heading}</h1>
      ${bodyHtml}
      ${cta}
    </td></tr>
    <!-- Footer -->
    <tr><td style="background-color:#fafafa;padding:20px;text-align:center;font-size:12px;color:#9ca3af;border-top:1px solid #f3f4f6;">
      &copy; ${new Date().getFullYear()} Godspeed Basketball &middot; Denver, CO
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`
}

// Helper: render a detail row for info-style emails
function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 12px;font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap;vertical-align:top;">${label}</td>
    <td style="padding:8px 12px;font-size:15px;color:#111;">${value}</td>
  </tr>`
}

function detailTable(rows: [string, string][]): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:16px 0 8px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
    ${rows.map(([l, v]) => detailRow(l, v)).join('')}
  </table>`
}

// ---------------------------------------------------------------------------
// Email content generator — returns { subject, text, html }
// ---------------------------------------------------------------------------
function getEmailContent(type: string, data: any): { subject: string; text: string; html: string } {
  const { playerName, amount, dueDate, installmentNumber, remaining } = data

  const payLink = 'https://www.clubgodspeed.com/parent-portal.html'
  const adminLink = 'https://www.clubgodspeed.com/admin-os.html'

  switch (type) {
    case 'receipt': {
      const nextLine = remaining > 0
        ? `Your next payment of <strong>$${remaining}</strong> is due on <strong>${dueDate}</strong>.`
        : 'Your balance is paid in full. Thank you!'
      return {
        subject: `Payment received — Godspeed Basketball`,
        text: `Hi,\n\nWe received your payment of $${amount} for ${playerName}. You are all set.\n\n${remaining > 0 ? `Your next payment of $${remaining} is due on ${dueDate}.` : 'Your balance is paid in full. Thank you.'}\n\nCoach Scott\nGodspeed Basketball`,
        html: htmlWrap('Payment Received',
          `<p style="font-size:16px;color:#4b5563;margin:0 0 20px;">We received your payment of <strong style="color:#111;">$${amount}</strong> for <strong style="color:#111;">${playerName}</strong>. You are all set.</p>
           <p style="font-size:16px;color:#4b5563;margin:0 0 10px;">${nextLine}</p>
           <p style="font-size:14px;color:#6b7280;margin:24px 0 0;">Coach Scott<br>Godspeed Basketball</p>`)
      }
    }

    case '7_day':
      return {
        subject: `Payment coming up — Godspeed Basketball`,
        text: `Hi,\n\nThis is a friendly heads-up that payment ${installmentNumber} of $${amount} for ${playerName} is due on ${dueDate} — one week from today.\n\nYou can pay at clubgodspeed.com or send via Venmo.\n\nCoach Scott\nGodspeed Basketball`,
        html: htmlWrap('Payment Coming Up',
          `<p style="font-size:16px;color:#4b5563;margin:0 0 20px;">Friendly heads-up — payment <strong style="color:#111;">#${installmentNumber}</strong> of <strong style="color:#111;">$${amount}</strong> for <strong style="color:#111;">${playerName}</strong> is due on <strong style="color:#111;">${dueDate}</strong>, one week from today.</p>
           <p style="font-size:14px;color:#6b7280;margin:24px 0 0;">Coach Scott<br>Godspeed Basketball</p>`,
          payLink, 'Pay Now')
      }

    case '1_day':
      return {
        subject: `Payment due tomorrow — Godspeed Basketball`,
        text: `Hi,\n\nPayment ${installmentNumber} of $${amount} for ${playerName} is due tomorrow, ${dueDate}.\n\nPay at clubgodspeed.com or via Venmo.\n\nCoach Scott\nGodspeed Basketball`,
        html: htmlWrap('Payment Due Tomorrow',
          `<p style="font-size:16px;color:#4b5563;margin:0 0 20px;">Payment <strong style="color:#111;">#${installmentNumber}</strong> of <strong style="color:#111;">$${amount}</strong> for <strong style="color:#111;">${playerName}</strong> is due tomorrow, <strong style="color:#111;">${dueDate}</strong>.</p>
           <p style="font-size:14px;color:#6b7280;margin:24px 0 0;">Coach Scott<br>Godspeed Basketball</p>`,
          payLink, 'Pay Now')
      }

    case 'due_today':
      return {
        subject: `Payment due today — Godspeed Basketball`,
        text: `Hi,\n\nPayment ${installmentNumber} of $${amount} for ${playerName} is due today.\n\nPay at clubgodspeed.com or via Venmo at your earliest convenience.\n\nCoach Scott\nGodspeed Basketball`,
        html: htmlWrap('Payment Due Today',
          `<p style="font-size:16px;color:#4b5563;margin:0 0 20px;">Payment <strong style="color:#111;">#${installmentNumber}</strong> of <strong style="color:#111;">$${amount}</strong> for <strong style="color:#111;">${playerName}</strong> is due <strong style="color:#111;">today</strong>.</p>
           <p style="font-size:14px;color:#6b7280;margin:24px 0 0;">Coach Scott<br>Godspeed Basketball</p>`,
          payLink, 'Pay Now')
      }

    case '3_day_overdue':
      return {
        subject: `Past due — Godspeed Basketball`,
        text: `Hi,\n\nPayment ${installmentNumber} of $${amount} for ${playerName} was due on ${dueDate} and has not been received.\n\nPlease take care of this as soon as possible. If you have a question or need to work something out, reply to this email.\n\nCoach Scott\nGodspeed Basketball`,
        html: htmlWrap('Payment Past Due',
          `<p style="font-size:16px;color:#4b5563;margin:0 0 20px;">Payment <strong style="color:#111;">#${installmentNumber}</strong> of <strong style="color:#111;">$${amount}</strong> for <strong style="color:#111;">${playerName}</strong> was due on <strong style="color:#111;">${dueDate}</strong> and has not been received.</p>
           <p style="font-size:16px;color:#4b5563;margin:0 0 10px;">Please take care of this as soon as possible. If you have a question or need to work something out, just reply to this email.</p>
           <p style="font-size:14px;color:#6b7280;margin:24px 0 0;">Coach Scott<br>Godspeed Basketball</p>`,
          payLink, 'Pay Now')
      }

    case '7_day_overdue':
      return {
        subject: `Balance outstanding — Godspeed Basketball`,
        text: `Hi,\n\nWe have not received payment ${installmentNumber} of $${amount} for ${playerName}. This was due on ${dueDate}.\n\nPlease settle this balance or reach out directly so we can work through it together.\n\nCoach Scott\nGodspeed Basketball`,
        html: htmlWrap('Balance Outstanding',
          `<p style="font-size:16px;color:#4b5563;margin:0 0 20px;">We have not received payment <strong style="color:#111;">#${installmentNumber}</strong> of <strong style="color:#111;">$${amount}</strong> for <strong style="color:#111;">${playerName}</strong>. This was due on <strong style="color:#111;">${dueDate}</strong>.</p>
           <p style="font-size:16px;color:#4b5563;margin:0 0 10px;">Please settle this balance or reach out directly so we can work through it together.</p>
           <p style="font-size:14px;color:#6b7280;margin:24px 0 0;">Coach Scott<br>Godspeed Basketball</p>`,
          payLink, 'Pay Now')
      }

    case 'gear_order': {
      const itemsHtml = data.items
        ? data.items.map((i: any) =>
            `<tr>
              <td style="padding:8px 12px;font-size:14px;color:#111;border-bottom:1px solid #f3f4f6;">${i.name}</td>
              <td style="padding:8px 12px;font-size:14px;color:#111;border-bottom:1px solid #f3f4f6;">${i.size || 'N/A'}</td>
              <td style="padding:8px 12px;font-size:14px;color:#111;border-bottom:1px solid #f3f4f6;text-align:center;">${i.qty}</td>
              <td style="padding:8px 12px;font-size:14px;color:#111;border-bottom:1px solid #f3f4f6;">${(i.customName && i.customName !== 'No Name') ? i.customName : '—'}</td>
            </tr>`
          ).join('')
        : '<tr><td colspan="4" style="padding:12px;color:#9ca3af;">No items</td></tr>'

      return {
        subject: `New Gear Order: ${data.parentId || 'Parent'}`,
        text: `A new gear order has been placed.\n\nParent Email: ${data.parentId}\nDate: ${new Date(data.date).toLocaleString()}\n\n${data.items ? data.items.map((i: any) => `- ${i.name} | Size: ${i.size || 'N/A'} | Qty: ${i.qty}${(i.customName && i.customName !== 'No Name') ? ' | Name on item: ' + i.customName : ''}`).join('\n') : 'No items'}\n\nGodspeed Portal`,
        html: htmlWrap('New Gear Order',
          `${detailTable([
            ['Parent', data.parentId || 'Unknown'],
            ['Date', new Date(data.date).toLocaleString()],
          ])}
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:20px 0 8px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
            <tr style="background-color:#f9fafb;">
              <th style="padding:10px 12px;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;text-align:left;">Item</th>
              <th style="padding:10px 12px;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;text-align:left;">Size</th>
              <th style="padding:10px 12px;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;text-align:center;">Qty</th>
              <th style="padding:10px 12px;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;text-align:left;">Name</th>
            </tr>
            ${itemsHtml}
          </table>`)
      }
    }

    case 'new_registration':
      return {
        subject: `New Parent Registration — ${data.parentName || data.email || 'Unknown'}`,
        text: `A new parent has registered on the portal and is awaiting your approval.\n\nParent Name: ${data.parentName || 'Not provided'}\nEmail: ${data.email || 'Not provided'}\nPlayer Name: ${data.playerName || 'Not provided'}\nGrade: ${data.grade || 'Not provided'}\nPhone: ${data.phone || 'Not provided'}\n\nLog in to the Admin Dashboard to approve or deny this request:\n${adminLink}\n\nGodspeed Portal`,
        html: htmlWrap('New Parent Registration',
          `<p style="font-size:16px;color:#4b5563;margin:0 0 20px;">A new parent has registered and is awaiting your approval.</p>
           ${detailTable([
             ['Parent', data.parentName || 'Not provided'],
             ['Email', data.email || 'Not provided'],
             ['Player', data.playerName || 'Not provided'],
             ['Grade', data.grade || 'Not provided'],
             ['Phone', data.phone || 'Not provided'],
           ])}`,
          adminLink, 'Review in Dashboard')
      }

    case 'payment_admin_notify': {
      const paidAt = data.paidAt ? new Date(data.paidAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'Just now'
      const label = data.notes || (data.installmentNumber ? `Installment ${data.installmentNumber}` : 'Payment')
      return {
        subject: `Payment received — ${data.playerName || 'Athlete'} ($${data.amount})`,
        text: `A payment has been received.\n\nPlayer: ${data.playerName || 'Unknown'}\nParent: ${data.parentEmail || 'Unknown'}\nAmount: $${data.amount}\nType: ${label}\nTime: ${paidAt}\n\nView in admin dashboard:\n${adminLink}\n\nGodspeed Portal`,
        html: htmlWrap('Payment Received',
          `<p style="font-size:16px;color:#4b5563;margin:0 0 20px;">A payment has been successfully processed via Stripe.</p>
           ${detailTable([
             ['Player',  data.playerName  || 'Unknown'],
             ['Parent',  data.parentEmail || 'Unknown'],
             ['Amount',  `$${data.amount}`],
             ['Type',    label],
             ['Time',    paidAt],
           ])}`,
          adminLink, 'View in Dashboard')
      }
    }

    default:
      return { subject: 'Godspeed Basketball', text: '', html: '' }
  }
}

// ---------------------------------------------------------------------------
// Edge function handler
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const body = await req.json()
  const { paymentId, type, emailTo, orderObj } = body

  let content: { subject: string; text: string; html: string }

  let resolvedEmailTo = emailTo

  if (type === 'gear_order') {
    content = getEmailContent(type, orderObj)
  } else if (type === 'new_registration') {
    content = getEmailContent(type, body)
  } else if (type === 'payment_admin_notify') {
    const { data: payment } = await supabase
      .from('payments')
      .select('*, payment_plans(player_name, parent_id)')
      .eq('id', paymentId)
      .single()

    if (!payment) return new Response('Payment not found', { status: 404, headers: corsHeaders })

    // Resolve parent email from profiles
    const parentId = payment.parent_id || payment.payment_plans?.parent_id
    let parentEmail = 'Unknown'
    if (parentId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', parentId)
        .single()
      if (profile?.email) parentEmail = profile.email
    }

    content = getEmailContent(type, {
      playerName: payment.payment_plans?.player_name || 'Unknown',
      amount: payment.amount,
      installmentNumber: payment.installment_number,
      notes: payment.notes,
      parentEmail,
      paidAt: payment.paid_at,
    })

    // Always route admin notifications to the configured admin email
    resolvedEmailTo = Deno.env.get('ADMIN_EMAIL') || emailTo
  } else {
    const { data: payment } = await supabase
      .from('payments')
      .select('*, payment_plans(player_name, parent_id)')
      .eq('id', paymentId)
      .single()

    if (!payment) return new Response('Payment not found', { status: 404, headers: corsHeaders })

    content = getEmailContent(type, {
      playerName: payment.payment_plans?.player_name,
      amount: payment.amount,
      dueDate: payment.due_date,
      installmentNumber: payment.installment_number,
      remaining: payment.amount // fallback — caller should provide actual remaining
    })
  }

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: resolvedEmailTo,
      subject: content.subject,
      text: content.text,
      html: content.html
    })
  })

  const resendBody = await resendRes.text()
  console.log(`Resend ${resendRes.status}: ${resendBody}`)

  if (!resendRes.ok) {
    return new Response(JSON.stringify({ error: 'Resend API error', status: resendRes.status, detail: resendBody }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  if (type !== 'gear_order' && type !== 'new_registration' && type !== 'payment_admin_notify') {
    await supabase.from('payment_reminders').insert({
      payment_id: paymentId,
      parent_id: body.payment ? body.payment.parent_id : null,
      reminder_type: type,
      email_to: resolvedEmailTo
    })
  }

  return new Response('sent', { headers: corsHeaders })
})
