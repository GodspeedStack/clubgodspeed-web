# Godspeed Raise — Go-Live Runbook

Everything a developer needs to take Godspeed Raise from the current
pre-launch state to live, in order. Nothing here can be done from the app
codebase alone — it all requires dashboard / CLI / third-party access.

**Project ref:** `nnqokhqennuxalamnvps`
**Public base URL:** `https://www.clubgodspeed.com`
**Functions base:** `https://nnqokhqennuxalamnvps.supabase.co/functions/v1`
**Pilot campaign slug:** `10u-season-2026`

## Access you need first
- Supabase **dashboard admin** for project `nnqokhqennuxalamnvps` (SQL editor, Functions, Vault, Secrets).
- Supabase **CLI** logged in (`supabase login`) — already installed (`supabase --version`).
- **Resend** account admin (to confirm the sending domain).
- **Stripe** account admin (live keys + webhook).
- A **staff Google account** (role `coach` or `director` in `profiles`) to use the admin console.

---

## Step 0 — Deploy the code (do this first)

The hardening changes are in the working tree but not deployed. Apply the DB
migration and redeploy the three functions.

### 0a. Apply migration `v10_03`
Two options — **the SQL editor is safest** (targets exactly this change; the
file is idempotent):

- **Dashboard → SQL Editor:** paste the full contents of
  [`supabase/migrations/v10_03_raise_hardening.sql`](../supabase/migrations/v10_03_raise_hardening.sql) and run.

- **Or CLI** (applies all pending migrations — only if this repo is your
  migration source of truth):
  ```bash
  supabase link --project-ref nnqokhqennuxalamnvps
  supabase db push
  ```

Verify:
```sql
-- functions exist
select proname from pg_proc
where proname in ('list_parent_profiles','link_participant_parent','get_campaign_public');
-- new column exists
select column_name from information_schema.columns
where table_name='fundraiser_email_log' and column_name='campaign_id';
```

### 0b. Redeploy the functions
```bash
supabase functions deploy fundraiser-engine    --project-ref nnqokhqennuxalamnvps
supabase functions deploy fundraiser-checkout  --project-ref nnqokhqennuxalamnvps
supabase functions deploy stripe-webhook       --project-ref nnqokhqennuxalamnvps
```
`verify_jwt=false` for the two fundraiser functions comes from
[`supabase/config.toml`](../supabase/config.toml) and is applied on deploy.

---

## Step 1 — Secrets & third-party config

### 1a. Function secrets
Set on the project (Supabase function secrets are project-wide, so one set
covers all three functions):
```bash
supabase secrets set --project-ref nnqokhqennuxalamnvps \
  RESEND_API_KEY=re_xxx \
  STRIPE_SECRET_KEY=sk_live_xxx \
  STRIPE_WEBHOOK_SECRET=whsec_xxx \
  CRON_SECRET=$(openssl rand -hex 32) \
  ADMIN_EMAIL=jewellsco@gmail.com
```
Notes:
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the runtime — **do not** set them.
- **Copy the `CRON_SECRET` value** you generate — you need the exact same value in Step 2b.
- `ADMIN_EMAIL` is optional (defaults to `jewellsco@gmail.com`); it's the daily-digest recipient.
- Until `STRIPE_SECRET_KEY` is set, `fundraiser-checkout` returns **503** and the donate form shows the intentional "opens soon" state — that's expected.

### 1b. Resend sending domain
- Resend → Domains → confirm **`clubgodspeed.com`** is **Verified** (SPF/DKIM green).
- The From address is hardcoded `Godspeed Basketball <noreply@clubgodspeed.com>`
  ([fundraiser-engine/index.ts](../supabase/functions/fundraiser-engine/index.ts)). If the
  domain isn't verified, every email silently fails.

### 1c. Stripe webhook
- Stripe → Developers → Webhooks → add endpoint:
  `https://nnqokhqennuxalamnvps.supabase.co/functions/v1/stripe-webhook`
- Subscribe to events: **`checkout.session.completed`** and **`charge.refunded`**.
- Copy the endpoint's **Signing secret** → that's the `whsec_...` value in `STRIPE_WEBHOOK_SECRET` above.
- Use **live** keys for production (test keys for a dry run first — see Step 5).

---

## Step 2 — Schedule the daily engine (cron)

The engine (cadence emails, receipts, impact emails, admin digest, pending
cleanup) only runs when scheduled. Auth is a shared secret read from Vault —
**no key is stored in git.**

### 2a. Store the secret in Vault
In **Dashboard → SQL Editor**, using the **same value** you set for `CRON_SECRET` in Step 1a:
```sql
select vault.create_secret('<paste-the-same-CRON_SECRET-value>', 'fundraiser_cron_secret');
```

### 2b. Schedule the job
Run the (idempotent) scheduler — paste
[`supabase/migrations/v10_02_raise_cron.sql`](../supabase/migrations/v10_02_raise_cron.sql)
into the SQL editor and run it. It unschedules any prior job and re-creates
`fundraiser-engine-daily` at `0 15 * * *`.

> Schedule is **15:00 UTC** = 9:00 AM Mountain during MDT (summer), 8:00 AM during MST (winter). Adjust the cron expression if you need a fixed local hour year-round.

Verify:
```sql
select jobname, schedule, active from cron.job where jobname='fundraiser-engine-daily';
```

### 2c. Smoke-test the engine
```bash
# With the secret → runs, returns a JSON summary
curl -s -X POST https://nnqokhqennuxalamnvps.supabase.co/functions/v1/fundraiser-engine \
  -H 'content-type: application/json' -H 'x-cron-secret: <CRON_SECRET>' \
  -d '{"action":"cron"}'
# Expect: {"cadence_sent":0,...,"note":"no active campaigns"}  (campaign still draft)

# Without the secret → rejected once CRON_SECRET is set
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://nnqokhqennuxalamnvps.supabase.co/functions/v1/fundraiser-engine \
  -H 'content-type: application/json' -d '{"action":"cron"}'
# Expect: 401
```

---

## Step 3 — Link parents to athletes (unblocks the email cadence)

Until each athlete's `campaign_participants.parent_id` is set, that parent
**cannot** open the contact-upload page and the cadence has **zero** recipients.

1. Sign in at **`https://www.clubgodspeed.com/admin-fundraising.html?c=10u-season-2026`** with a staff Google account.
2. In the **Athletes** table, each row's **Parent linked** column is a dropdown of parent profiles. Pick the right parent per athlete — it saves immediately (shows "Saved").
   - A parent only appears in the list if they have a `profiles` row with `role = 'parent'`. If someone's missing, get them to sign up / be approved first.
3. Tell each linked parent to build their supporter list at
   **`https://www.clubgodspeed.com/fundraise-contacts.html`** (same Google login as the Parent Portal). Target: 30–40 contacts each.

Verify a parent is linked:
```sql
select athlete_name, parent_id from campaign_participants
where campaign_id = (select id from fundraising_campaigns where slug='10u-season-2026')
order by display_order;
```

---

## Step 4 — Launch the campaign

When secrets, cron, parent links, and contacts are in place:

1. In the admin console (Step 3 URL), **Campaign control → Launch campaign** → Confirm.
   This flips `draft → live`; the next engine run emails uploaded contacts.
2. The public pages go live automatically:
   - Hub: `https://www.clubgodspeed.com/fundraise.html`
   - Player: `https://www.clubgodspeed.com/fundraise-player.html?p=<slug>&c=10u-season-2026`

To end it later: **End campaign** (`live → ended`) — stops ask emails and, on the
next run, sends the one-time impact email to donors. Status is forward-only
(`draft → live → ended → paid_out`); it cannot move backward.

---

## Step 5 — Recommended dry run before real money

Do a full loop in **Stripe test mode** first (set test `STRIPE_*` secrets, use
card `4242 4242 4242 4242`):
1. Launch the campaign, make a $5 test donation on a player page.
2. Confirm: redirect to Stripe → back to the page with the thank-you banner.
3. Confirm the donation row completes and the donor wall updates:
   ```sql
   select donor_name, amount, status, completed_at from donations order by created_at desc limit 5;
   ```
4. Confirm the receipt email arrives (check `fundraiser_email_log` for a `receipt` row).
5. Refund the test charge in Stripe → confirm the donation flips to `refunded`
   and `fundraising_totals` decrements.
6. Swap test keys for live keys, re-verify one small live donation, then open the floodgates.

---

## Rollback / kill switches
- **Stop all emails immediately:** `select cron.unschedule('fundraiser-engine-daily');`
- **Stop new donations:** set the campaign back is not allowed (forward-only); instead
  remove `STRIPE_SECRET_KEY` (checkout → 503) or set status to `ended`.
- **Lock the engine down harder:** rotate `CRON_SECRET` (Step 1a) **and** the Vault
  secret (Step 2a) together.

## Quick reference — required secrets
| Secret | Where | Notes |
|---|---|---|
| `RESEND_API_KEY` | function secret | email sending |
| `STRIPE_SECRET_KEY` | function secret | unset ⇒ checkout 503 (pre-launch) |
| `STRIPE_WEBHOOK_SECRET` | function secret | from the Stripe endpoint |
| `CRON_SECRET` | function secret | must equal the Vault secret |
| `ADMIN_EMAIL` | function secret | optional; digest recipient |
| `fundraiser_cron_secret` | Supabase Vault | must equal `CRON_SECRET` |
