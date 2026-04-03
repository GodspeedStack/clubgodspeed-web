import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_AUTH_TOKEN  = Deno.env.get('TWILIO_AUTH_TOKEN')!
const TWILIO_FROM_NUMBER = Deno.env.get('TWILIO_FROM_NUMBER')!  // E.164 format

// ---------------------------------------------------------------------------
// Send a single SMS via Twilio REST API
// ---------------------------------------------------------------------------
async function sendSms(to: string, body: string): Promise<{ ok: boolean; sid?: string; error?: string }> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`
  const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)

  const params = new URLSearchParams()
  params.set('To', to)
  params.set('From', TWILIO_FROM_NUMBER)
  params.set('Body', body)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })
    const data = await res.json()
    if (res.ok) {
      return { ok: true, sid: data.sid }
    }
    return { ok: false, error: data.message || `Twilio ${res.status}` }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

// ---------------------------------------------------------------------------
// Normalize phone to E.164 (US numbers)
// ---------------------------------------------------------------------------
function normalizePhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.startsWith('+') && digits.length >= 11) return phone.replace(/[^\d+]/g, '')
  return null
}

// ---------------------------------------------------------------------------
// Handler
// POST { check_id } -- sends SMS to all eligible parents for that check
// POST { title, event_date, event_type?, team_id? } -- creates check + sends
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    let checkId = body.check_id as string | undefined

    // Create check if needed
    if (!checkId) {
      const { title, event_date, event_type, team_id } = body
      if (!title || !event_date) {
        return new Response(
          JSON.stringify({ error: 'title and event_date are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Build branded SMS body
      const dateStr = new Date(event_date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric'
      })
      const smsBody =
        `GODSPEED BASKETBALL\n\n` +
        `${title} -- ${dateStr}\n\n` +
        `Is your player available?\n` +
        `Reply 1 for YES\n` +
        `Reply 2 for NO\n\n` +
        `Please include player name if you have multiple athletes.\n\n` +
        `BROTHERHOOD. HABITS. SUCCESS.`

      const { data: check, error: checkErr } = await supabase
        .from('availability_checks')
        .insert({
          title,
          event_date,
          event_type: event_type || 'practice',
          team_id: team_id || null,
          message: smsBody,
          status: 'draft',
        })
        .select('id')
        .single()

      if (checkErr) {
        return new Response(
          JSON.stringify({ error: checkErr.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      checkId = check.id
    }

    // Fetch check details
    const { data: check } = await supabase
      .from('availability_checks')
      .select('*')
      .eq('id', checkId)
      .single()

    if (!check) {
      return new Response(
        JSON.stringify({ error: 'Check not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get eligible parents
    const { data: parents, error: parentErr } = await supabase
      .rpc('get_sms_eligible_parents', { p_team_id: check.team_id })

    if (parentErr || !parents?.length) {
      return new Response(
        JSON.stringify({ error: parentErr?.message || 'No parents with phone numbers found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Send SMS to each parent
    const results: { phone: string; ok: boolean; error?: string }[] = []
    for (const parent of parents) {
      const phone = normalizePhone(parent.phone)
      if (!phone) {
        results.push({ phone: parent.phone, ok: false, error: 'Invalid phone format' })
        continue
      }

      const result = await sendSms(phone, check.message)
      results.push({ phone, ok: result.ok, error: result.error })

      // Pre-seed a response row so admin can see who was texted (status: unknown until they reply)
      if (result.ok) {
        await supabase.from('availability_responses').upsert({
          check_id: checkId,
          profile_id: parent.profile_id,
          phone,
          player_name: parent.player_name,
          response: 'unknown',
          twilio_sid: result.sid,
        }, { onConflict: 'check_id,phone' })
      }
    }

    // Mark check as sent
    await supabase.from('availability_checks').update({
      status: 'sent',
      sent_at: new Date().toISOString(),
    }).eq('id', checkId)

    const sent = results.filter(r => r.ok).length
    const failed = results.filter(r => !r.ok).length

    return new Response(
      JSON.stringify({ ok: true, check_id: checkId, sent, failed, details: results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
