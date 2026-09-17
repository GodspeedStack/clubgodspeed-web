# Parent Message Ledger — deploy runbook

Every message that leaves Godspeed for a parent is recorded in one place, and
the Messaging panel in the admin portal is that place.

Nothing here is deployed. Run the steps in order.

---

## What was built

| Piece | File | What it does |
|---|---|---|
| Ledger tables | `supabase/migrations/v22_01_parent_message_ledger.sql` | `parent_message_log` (one row per message) and `parent_message_events` (one row per provider event). Append-only. Staff read, nobody writes from the browser. |
| Chokepoint | `supabase/functions/_shared/parent-comms.ts` | `sendParentEmail()` / `sendParentSms()`. Opens the ledger row **before** the send and stamps its id onto the provider payload. If the ledger row cannot be written, the message is not sent. |
| Backstop | `supabase/functions/comms-webhook/index.ts` | Verifies the provider signature, then records **every** event. An event it cannot match to a logged send opens a row flagged `bypassed`, so a sender that skips the helper shows up in red instead of disappearing. |
| Admin view | `admin-os.html`, `admin-os.js` | Message Ledger card under Messaging: search, filters, unread count on the sidebar, and a per-message record showing exactly what the parent received plus the delivery trail. |

### Senders routed through the chokepoint

`send-welcome-email`, `send-onboarding-invite`, `send-onboarding-reminder`,
`resend-verification`, `send-payment-thank-you`, `send-document-notification`,
`send-payment-reminders`, `document-reminder-cron`, `send-calendar-update`,
`send-practice-update`, `send-tournament-reminders`, `send-broadcast`,
`send-email`, `send-availability-sms`, `fundraiser-engine`.

Left alone on purpose: `notify-admin-signup`, `health-check`,
`send-uniform-order-notification`. Those email the admin, not a parent.

---

## Step 1 — apply the migration

```
supabase db push
```

Or paste `supabase/migrations/v22_01_parent_message_ledger.sql` into the SQL
editor. It is idempotent: every object uses `if not exists` or
`create or replace`.

Verify:

```sql
select count(*) from public.parent_message_log;   -- 0
select * from public.parent_message_badge();      -- 0 | 0 | 0
```

## Step 2 — set the function secrets

```
supabase secrets set RESEND_WEBHOOK_SECRET='whsec_...'
supabase secrets set AUTH_EMAIL_FROM='noreply@clubgodspeed.com'
```

`RESEND_WEBHOOK_SECRET` is the signing secret Resend shows when you create the
webhook endpoint (Step 4). **Until it is set, the webhook rejects every event
with a 401 and delivery statuses stop updating.** Sends are still logged; only
the delivered/opened/bounced trail goes missing.

`AUTH_EMAIL_FROM` is the from-address Supabase Auth sends magic links and
password resets from. **Checked 2026-09-17: custom SMTP is already enabled on
this project and points at `smtp.resend.com`, sending as
`Godspeed Basketball <noreply@clubgodspeed.com>`.** So auth mail does reach the
webhook, and `noreply@clubgodspeed.com` is the value to set. Without it, every
magic link and password reset lands in the ledger flagged as a bypass.

That address is shared with several of our own senders, so the webhook does not
treat the address alone as proof: an event counts as auth mail only when it also
carries none of the tags a chokepoint send attaches. A genuine bypass from a
sender using `noreply@` therefore still shows up in red.

`TWILIO_AUTH_TOKEN` is already set and is reused to verify Twilio signatures.
Set `TWILIO_WEBHOOK_URL` only if Twilio's signature check fails, which happens
when the public URL Twilio signed differs from what the function sees.

## Step 3 — deploy the functions

```
supabase functions deploy comms-webhook
supabase functions deploy send-welcome-email
supabase functions deploy send-onboarding-invite
supabase functions deploy send-onboarding-reminder
supabase functions deploy resend-verification
supabase functions deploy send-payment-thank-you
supabase functions deploy send-document-notification
supabase functions deploy send-payment-reminders
supabase functions deploy document-reminder-cron
supabase functions deploy send-calendar-update
supabase functions deploy send-practice-update
supabase functions deploy send-tournament-reminders
supabase functions deploy send-broadcast
supabase functions deploy send-email
supabase functions deploy send-availability-sms
supabase functions deploy fundraiser-engine
```

`comms-webhook` must already be `verify_jwt = false` in `supabase/config.toml`:
Resend and Twilio sign with their own scheme, not a Supabase JWT.

## Step 4 — point Resend at the webhook

In the Resend dashboard, Webhooks, add an endpoint:

```
https://nnqokhqennuxalamnvps.supabase.co/functions/v1/comms-webhook
```

Subscribe to: `email.sent`, `email.delivered`, `email.delivery_delayed`,
`email.opened`, `email.clicked`, `email.bounced`, `email.complained`.

Copy the signing secret it gives you into `RESEND_WEBHOOK_SECRET` (Step 2) and
redeploy `comms-webhook`.

Twilio needs no dashboard change: `sendParentSms()` sets `StatusCallback` on
each message, with the ledger row id in the query string.

## Step 5 — ship the admin portal

`admin-os.html` and `admin-os.js` deploy with the site. Bump the cache-buster
on the script tag if the ledger card does not appear:

```html
<script src="admin-os.js?v=20260917" defer></script>
```

---

## Verifying it works

1. Open Messaging in the admin portal. The Message Ledger card loads empty.
2. Send one real message (a practice update to yourself is the safest test).
3. The row appears within a second or two at status `sent`.
4. Within about a minute Resend's webhook moves it to `delivered`, then
   `opened` when you open it. Click the row to see the delivery trail.
5. Tick **Only messages sent outside the logged path**. It should stay empty.
   Anything that appears there is a code path still sending directly.

## Reading the ledger

- **A bold row with a blue dot** has not been marked seen. **Mark all seen**
  clears them, and the count also shows on the sidebar next to Messaging.
- **unlogged** in red means a message reached a parent without going through
  `_shared/parent-comms.ts`. Open it, read `Origin`, and route that sender
  through the helper.
- **bounced / complained / failed** means the parent did not get it. The
  detail view carries the provider's reason.

## Adding a new sender

```ts
import { sendParentEmail } from "../_shared/parent-comms.ts";

const result = await sendParentEmail({
  source: "my-new-function",   // the function's own name
  purpose: "tryout_invite",    // why the parent is getting this
  trigger: "manual",           // manual | automated | cron | system
  to: parentEmail,
  recipientName: parentName,
  athleteId: athlete.id,       // optional, links the record to a player
  subject,
  html,
});
if (!result.ok) { /* result.error */ }
```

Do not call `api.resend.com` or `api.twilio.com` directly. A direct call still
lands in the ledger via the webhook, but as a red `unlogged` row with no
subject and no body.

## Things to know

- **The ledger cannot be edited or deleted.** Database triggers block `UPDATE`
  of any column describing what was sent to whom, and block `DELETE` outright.
  Only status, delivery fields and the seen-marker can change after insert.
- **Parents cannot see it.** RLS grants `SELECT` to staff only
  (`current_user_is_staff()`), and no client role has insert, update or delete.
- **Search is an RPC**, not a PostgREST filter string, so typed text is always
  a bound parameter.
- **Body storage.** The plain-text rendition of each email is kept, capped at
  20,000 characters, alongside a sha256 of the exact HTML handed to the
  provider. The verification email is the one exception: its body is not
  stored, because the link inside it is a single-use credential.
- **Retention.** Nothing prunes the ledger. It is the club's record of what
  families were told and when. If it ever needs trimming, archive rather than
  delete.
