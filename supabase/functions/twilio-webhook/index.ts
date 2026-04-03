import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Twilio sends webhooks as application/x-www-form-urlencoded
// No CORS needed -- this is server-to-server from Twilio

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!

// ---------------------------------------------------------------------------
// Validate Twilio signature (X-Twilio-Signature header)
// Prevents spoofed webhooks
// ---------------------------------------------------------------------------
async function validateTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string
): Promise<boolean> {
  // Build the data string: URL + sorted params concatenated
  const sortedKeys = Object.keys(params).sort()
  let data = url
  for (const key of sortedKeys) {
    data += key + params[key]
  }

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(TWILIO_AUTH_TOKEN),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)))
  return expected === signature
}

// ---------------------------------------------------------------------------
// Parse reply into available/unavailable
// ---------------------------------------------------------------------------
function parseReply(body: string): 'available' | 'unavailable' | 'unknown' {
  const trimmed = body.trim().toLowerCase()

  // Exact digit replies
  if (trimmed === '1' || trimmed === 'yes' || trimmed === 'y' || trimmed === 'available') {
    return 'available'
  }
  if (trimmed === '2' || trimmed === 'no' || trimmed === 'n' || trimmed === 'unavailable' || trimmed === 'not available') {
    return 'unavailable'
  }

  // Fuzzy: check if the reply contains key words
  if (/\b(yes|available|can make it|will be there|coming|there)\b/i.test(body)) {
    return 'available'
  }
  if (/\b(no|unavailable|can't|cannot|won't|unable|not available|out)\b/i.test(body)) {
    return 'unavailable'
  }

  return 'unknown'
}

// ---------------------------------------------------------------------------
// Normalize phone to E.164
// ---------------------------------------------------------------------------
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return phone.replace(/[^\d+]/g, '')
}

// ---------------------------------------------------------------------------
// Handler -- Twilio POSTs form-encoded data when a reply SMS arrives
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const formData = await req.formData()
    const params: Record<string, string> = {}
    formData.forEach((value, key) => { params[key] = value.toString() })

    // Validate Twilio signature
    const twilioSig = req.headers.get('x-twilio-signature') || ''
    const webhookUrl = Deno.env.get('TWILIO_WEBHOOK_URL') ||
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/twilio-webhook`

    const valid = await validateTwilioSignature(webhookUrl, params, twilioSig)
    if (!valid) {
      console.warn('Invalid Twilio signature -- rejecting webhook')
      return new Response('Forbidden', { status: 403 })
    }

    const fromPhone = normalizePhone(params.From || '')
    const body = params.Body || ''
    const messageSid = params.MessageSid || ''

    if (!fromPhone || !body) {
      return twimlResponse('') // Empty TwiML = no auto-reply
    }

    // Find the most recent sent check (the one they're replying to)
    const { data: latestCheck } = await supabase
      .from('availability_checks')
      .select('id, title, event_date')
      .eq('status', 'sent')
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!latestCheck) {
      // No active check -- just acknowledge
      return twimlResponse('Thanks for your message. No active availability check right now.')
    }

    // Parse the reply
    const response = parseReply(body)

    // Look up profile by phone
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name')
      .or(`phone.eq.${fromPhone},phone.eq.${fromPhone.replace('+1', '')}`)
      .limit(1)
      .maybeSingle()

    // Look up player name from parent_player_links
    let playerName: string | null = null
    if (profile) {
      const { data: link } = await supabase
        .from('parent_player_links')
        .select('athlete:athletes!athlete_id(first_name, last_name)')
        .eq('profile_id', profile.id)
        .order('is_primary', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (link?.athlete) {
        const a = link.athlete as { first_name: string; last_name: string }
        playerName = `${a.first_name} ${a.last_name}`
      }
    }

    // Upsert response (one per phone per check)
    const { error: upsertErr } = await supabase
      .from('availability_responses')
      .upsert({
        check_id: latestCheck.id,
        profile_id: profile?.id || null,
        phone: fromPhone,
        player_name: playerName,
        response,
        raw_reply: body,
        responded_at: new Date().toISOString(),
        twilio_sid: messageSid,
      }, { onConflict: 'check_id,phone' })

    if (upsertErr) {
      console.error('Upsert error:', upsertErr.message)
    }

    // Auto-reply confirmation
    const statusText = response === 'available'
      ? 'Got it -- marked as AVAILABLE'
      : response === 'unavailable'
        ? 'Got it -- marked as NOT AVAILABLE'
        : 'Thanks. We couldn\'t determine your availability. Reply 1 for YES or 2 for NO.'

    const replyText = playerName
      ? `${statusText} for ${playerName}.`
      : `${statusText}.`

    return twimlResponse(replyText)

  } catch (e) {
    console.error('Webhook error:', e.message)
    return twimlResponse('')
  }
})

// TwiML response -- Twilio expects XML
function twimlResponse(message: string): Response {
  const xml = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`

  return new Response(xml, {
    headers: { 'Content-Type': 'text/xml' },
  })
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
