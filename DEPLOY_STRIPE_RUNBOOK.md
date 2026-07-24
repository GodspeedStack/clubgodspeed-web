# Deploy Runbook — Stripe dues go-live

Copy-paste steps to ship PR #45 to production. Do them **in order**. Nothing here is
reversible-unfriendly except step 6 (the flag flip), which you control.

**Project ref:** `nnqokhqennuxalamnvps` · **Functions URL base:** `https://nnqokhqennuxalamnvps.supabase.co/functions/v1`

Prereqs: PR #45 merged to `main`, `supabase` CLI logged in (`supabase projects list` works),
your **EIN + live Stripe account** active, and your Supabase **DB password** handy.

---

## 1. Link the CLI to the project (one time)

```bash
cd /Users/cornerstone/clubgodspeed-web
supabase link --project-ref nnqokhqennuxalamnvps   # prompts for the DB password
```

## 2. Apply the settlement migration

> ⚠️ **Do NOT run `supabase db push`.** This repo's migrations were applied out-of-band
> (dashboard/scripts), so the CLI migration history is out of sync and a push would try to
> replay everything and fail. Apply **only the one new file**.

**Option A — Supabase Dashboard (simplest):** SQL Editor → paste the contents of
`supabase/migrations/v13_01_bulk_mark_paid.sql` → Run.

**Option B — psql (scripted):**
```bash
# Connection string: Dashboard → Project Settings → Database → Connection string (URI)
psql "postgresql://postgres:[DB_PASSWORD]@db.nnqokhqennuxalamnvps.supabase.co:5432/postgres" \
  -f supabase/migrations/v13_01_bulk_mark_paid.sql
```

**Verify:**
```sql
select proname from pg_proc where proname in
  ('mark_family_paid','mark_family_paid_by_email','mark_enrollments_paid');
-- expect 3 rows
```

Once this is applied, the admin **Family Balances** buttons work — and you can settle **Denis**:
```sql
select mark_family_paid_by_email('DenisBlyakhman@gmail.com');
```

## 3. Set the Stripe secrets on the functions

```bash
supabase secrets set \
  STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxxxxxxxxxxx \
  STRIPE_WEBHOOK_SECRET=whsec_PLACEHOLDER \
  --project-ref nnqokhqennuxalamnvps
```

> `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically into edge
> functions — you do **not** set those. `STRIPE_WEBHOOK_SECRET` is a placeholder for now;
> you get the real value in step 5 and re-run this command.

## 4. Deploy the two functions

`verify_jwt = false` for both is already in `supabase/config.toml` (PR #45), so a plain deploy
is enough:

```bash
supabase functions deploy create-checkout --project-ref nnqokhqennuxalamnvps
supabase functions deploy stripe-webhook  --project-ref nnqokhqennuxalamnvps
```

## 5. Register the Stripe webhook

Stripe Dashboard → **Developers → Webhooks → Add endpoint**
- **Endpoint URL:** `https://nnqokhqennuxalamnvps.supabase.co/functions/v1/stripe-webhook`
- **Events:** `checkout.session.completed`, `charge.refunded`
- Save → copy the **Signing secret** (`whsec_...`) → re-run step 3 with the real value:

```bash
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_realvalue --project-ref nnqokhqennuxalamnvps
supabase functions deploy stripe-webhook --project-ref nnqokhqennuxalamnvps   # redeploy to pick it up
```

## 6. Flip the frontend to card payments

In `billing-view.js`, change the default:
```js
if (typeof window.STRIPE_LIVE === 'undefined') window.STRIPE_LIVE = true;   // was false
```
Bump the cache-buster on the script tag in `parent-portal.html` (line ~1459,
`billing-view.js?v=...`) so browsers pick it up, then deploy the site (Vercel).

---

## 7. Smoke test (do this with a Stripe TEST key first if you can)

1. Log into the parent portal as a test family → **AAU Season Dues** → **Pay Now**.
2. Complete Stripe Checkout (test card `4242 4242 4242 4242`, any future expiry/CVC).
3. Confirm **all three** update automatically:
   - parent billing view shows the installment/‑balance as **Paid**,
   - admin **Season Dues → Family Balances** shows the family **paid_in_full**,
   - a `dues_payments` row exists with `status='completed'` and the `stripe_pi_id`.
4. In Stripe, resend the same webhook event → confirm the family is **not** double-credited
   (idempotency guard on `stripe_pi_id`).

## Rollback

- **Undo a payment:** admin **Delete** on the installment (calls `reverse_payment`), or reset
  `parent_dues_enrollment.total_paid` + set installments back to `pending`.
- **Turn card off:** set `window.STRIPE_LIVE = false` and redeploy — instantly back to Venmo.
- The functions and migration are additive; leaving them deployed with the flag off changes nothing.

## Quick reference

| Item | Value |
|---|---|
| Webhook endpoint | `.../functions/v1/stripe-webhook` |
| Events | `checkout.session.completed`, `charge.refunded` |
| Secrets to set | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Auto-injected | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| Go-live flag | `window.STRIPE_LIVE` in `billing-view.js` |
| Settle Denis | `select mark_family_paid_by_email('DenisBlyakhman@gmail.com');` |
