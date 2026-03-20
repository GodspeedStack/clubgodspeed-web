import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL')!

function getEmailContent(type: string, data: any) {
  const { playerName, amount, dueDate, installmentNumber, remaining } = data

  const templates: Record<string, { subject: string; body: string }> = {
    receipt: {
      subject: `Payment received — Godspeed Basketball`,
      body: `Hi,\n\nWe received your payment of $${amount} for ${playerName}. You are all set.\n\n${remaining > 0 ? `Your next payment of $${remaining} is due on ${dueDate}.` : 'Your balance is paid in full. Thank you.'}\n\nCoach Scott\nGodspeed Basketball`
    },
    '7_day': {
      subject: `Payment coming up — Godspeed Basketball`,
      body: `Hi,\n\nThis is a friendly heads-up that payment ${installmentNumber} of $${amount} for ${playerName} is due on ${dueDate} — one week from today.\n\nYou can pay at clubgodspeed.com or send via Venmo.\n\nCoach Scott\nGodspeed Basketball`
    },
    '1_day': {
      subject: `Payment due tomorrow — Godspeed Basketball`,
      body: `Hi,\n\nPayment ${installmentNumber} of $${amount} for ${playerName} is due tomorrow, ${dueDate}.\n\nPay at clubgodspeed.com or via Venmo.\n\nCoach Scott\nGodspeed Basketball`
    },
    due_today: {
      subject: `Payment due today — Godspeed Basketball`,
      body: `Hi,\n\nPayment ${installmentNumber} of $${amount} for ${playerName} is due today.\n\nPay at clubgodspeed.com or via Venmo at your earliest convenience.\n\nCoach Scott\nGodspeed Basketball`
    },
    '3_day_overdue': {
      subject: `Past due — Godspeed Basketball`,
      body: `Hi,\n\nPayment ${installmentNumber} of $${amount} for ${playerName} was due on ${dueDate} and has not been received.\n\nPlease take care of this as soon as possible. If you have a question or need to work something out, reply to this email.\n\nCoach Scott\nGodspeed Basketball`
    },
    '7_day_overdue': {
      subject: `Balance outstanding — Godspeed Basketball`,
      body: `Hi,\n\nWe have not received payment ${installmentNumber} of $${amount} for ${playerName}. This was due on ${dueDate}.\n\nPlease settle this balance or reach out directly so we can work through it together.\n\nCoach Scott\nGodspeed Basketball`
    }
  }

  return templates[type]
}

Deno.serve(async (req) => {
  const { paymentId, type, emailTo } = await req.json()

  const { data: payment } = await supabase
    .from('payments')
    .select('*, payment_plans(player_name, parent_id)')
    .eq('id', paymentId)
    .single()

  if (!payment) return new Response('Payment not found', { status: 404 })

  const content = getEmailContent(type, {
    playerName: payment.payment_plans.player_name,
    amount: payment.amount,
    dueDate: payment.due_date,
    installmentNumber: payment.installment_number
  })

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: emailTo,
      subject: content.subject,
      text: content.body
    })
  })

  await supabase.from('payment_reminders').insert({
    payment_id: paymentId,
    parent_id: payment.parent_id,
    reminder_type: type,
    email_to: emailTo
  })

  return new Response('sent')
})
