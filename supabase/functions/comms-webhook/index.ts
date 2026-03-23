import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Initialize Supabase Client with the Service Role Key to bypass RLS and insert events securely
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  try {
    // Read the raw body text
    const body = await req.text();
    let payload;
    
    // Parse JSON (Resend) or URL-Encoded (Twilio)
    try {
      payload = JSON.parse(body);
    } catch {
      const params = new URLSearchParams(body);
      payload = Object.fromEntries(params);
    }

    let eventType = 'delivered';
    let recipient = '';
    let campaignId = null;
    const metadata = payload;

    // ──────────────────────────────────────────────────────────
    // RESEND PAYLOAD PARSING
    // ──────────────────────────────────────────────────────────
    // Expected format: { type: 'email.delivered', data: { to: ['parent@email.com'], tags: [{name: 'campaign_id', value: 'uuid'}] } }
    if (payload.type && payload.type.startsWith('email.')) {
      const typeMap: Record<string, string> = {
        'email.delivered': 'delivered',
        'email.opened': 'opened',
        'email.clicked': 'clicked',
        'email.bounced': 'bounced',
        'email.complained': 'failed'
      };
      
      eventType = typeMap[payload.type] || 'delivered';
      recipient = payload.data?.to?.[0] || 'unknown';
      
      const tags = payload.data?.tags || [];
      const campTag = tags.find((t: any) => t.name === 'campaign_id');
      if (campTag) campaignId = campTag.value;
    } 
    
    // ──────────────────────────────────────────────────────────
    // TWILIO PAYLOAD PARSING
    // ──────────────────────────────────────────────────────────
    // Expected format: URL Encoded form data with MessageStatus=delivered
    else if (payload.MessageStatus) {
      const status = payload.MessageStatus.toLowerCase();
      if (status === 'undelivered' || status === 'failed') {
        eventType = 'failed';
      } else {
        eventType = 'delivered';
      }

      recipient = payload.To || 'unknown';
      
      // Twilio often passes custom parameters back via status callback URL query parameters
      const url = new URL(req.url);
      campaignId = url.searchParams.get('campaign_id');
    }

    // ──────────────────────────────────────────────────────────
    // VALIDATION & INSERTION
    // ──────────────────────────────────────────────────────────
    if (!campaignId) {
      // If no campaign id is attached, we drop the event silently with a 200 so the provider stops retrying, or log an error.
      console.warn("Webhook received without a valid campaign_id attached.", payload);
      return new Response(JSON.stringify({ error: 'Missing campaign_id in payload tags/url' }), { status: 400 });
    }

    // Attempt to lookup profile_id by email or phone to link the event strictly to a user
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .or(`email.eq.${recipient},phone.eq.${recipient}`)
      .limit(1)
      .maybeSingle();

    // Insert into campaign_events table!
    const { error } = await supabase.from('campaign_events').insert({
      campaign_id: campaignId,
      profile_id: profile?.id || null,
      recipient: recipient,
      event_type: eventType,
      metadata: metadata
    });

    if (error) {
      console.error("Supabase Insertion Error:", error);
      throw error;
    }

    return new Response(JSON.stringify({ success: true }), { 
      headers: { "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error("Fatal Webhook Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
})
