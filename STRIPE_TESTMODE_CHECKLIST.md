# Stripe Test-Mode Checklist — De-Risk the Go-Live Flip

**Purpose:** prove the card-payment flow auto-reconciles correctly **before** flipping
`STRIPE_LIVE = true` for real parents. Run this end-to-end in Stripe **test mode**.

**Owner:** Scott · **Related:** [STRIPE_GOLIVE_DECISIONS.md](STRIPE_GOLIVE_DECISIONS.md) · [DEPLOY_STRIPE_RUNBOOK.md](DEPLOY_STRIPE_RUNBOOK.md)

---

## 0. The two things you MUST understand first

1. **You do NOT need your EIN for test mode.** Stripe test mode works today with a free
   Stripe account. This whole checklist can be done now — the EIN only gates *live* payouts.

2. ⚠️ **Test-mode payments write to your REAL production database.** There is one Supabase
   project (`nnqokhqennuxalamnvps`), and the edge functions settle rows in the real
   `parent_dues_enrollment` / `dues_installments` / `dues_payments` tables with the
   service-role key. A test card will mark a **real family** paid. So you MUST test against a
   **throwaway test enrollment** you create and delete — never a real parent's row. Step 3 sets this up.

---

## 1. Get test-mode Stripe keys (no EIN needed)

- [ ] Log into the [Stripe Dashboard](https://dashboard.stripe.com) and confirm the toggle
      says **"Test mode"** (top-right). Everything below uses test-mode values.
- [ ] Copy the test **Secret key** → `sk_test_...`  (Developers → API keys)
- [ ] Register the webhook endpoint (Developers → Webhooks → **Add endpoint**):
  - URL: `https://nnqokhqennuxalamnvps.supabase.co/functions/v1/stripe-webhook`
  - Event to send: **`checkout.session.completed`**
  - [ ] After saving, copy the endpoint's **Signing secret** → `whsec_...`

---

## 2. Put the test keys on the Supabase functions

The functions read `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. Set the **test** values.
(`verify_jwt = false` is already set for `stripe-webhook` and `create-checkout` in
`supabase/config.toml`, so Stripe and the browser can reach them — nothing to change there.)

- [ ] Set the secrets (CLI):
```bash
supabase secrets set \
  STRIPE_SECRET_KEY=sk_test_XXXXXXXX \
  STRIPE_WEBHOOK_SECRET=whsec_XXXXXXXX \
  --project-ref nnqokhqennuxalamnvps
```
- [ ] Confirm `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` are already set (they are, since
      other functions use them): `supabase secrets list --project-ref nnqokhqennuxalamnvps`
- [ ] Redeploy the two functions so they pick up the new secrets:
```bash
supabase functions deploy create-checkout stripe-webhook --project-ref nnqokhqennuxalamnvps
```

> Safe because **production's `STRIPE_LIVE` flag is still `false`** — no real parent is routed
> to Stripe. Only your test surface (Step 4) will hit these test keys.

---

## 3. Create a throwaway TEST enrollment (protects real data)

Run in the Supabase SQL editor. Use a fake email you control so the webhook resolves by it.
**Validate column names against the live table first** (repo has no migration for these tables).

- [ ] Inspect the table shape:
```sql
select column_name, data_type
from information_schema.columns
where table_name = 'parent_dues_enrollment'
order by ordinal_position;
```
- [ ] Insert a test family with a tiny balance (adjust columns to match what you just saw):
```sql
insert into parent_dues_enrollment (parent_email, athlete_name, total_owed, total_paid, status)
values ('stripetest+godspeed@YOURDOMAIN.com', 'TEST Athlete', 20, 0, 'unpaid')
returning id;   -- copy this id → <ENR_ID>
```
- [ ] Add at least one matching installment (match FK + columns to the live schema):
```sql
insert into dues_installments (enrollment_id, amount, status)
values ('<ENR_ID>', 20, 'pending')
returning id;
```

---

## 4. Turn on the card flow for your test only (NOT production)

Do **not** flip the flag on `main` — that would show card checkout to real parents against test
keys. Use an isolated surface. Two options:

**Option A — Vercel preview deploy (recommended, matches our branch+PR flow):**
- [ ] Branch: `git checkout -b test/stripe-testmode`
- [ ] In `billing-view.js`, temporarily set the default to `true` (line ~726):
      `if (typeof window.STRIPE_LIVE === 'undefined') window.STRIPE_LIVE = true;`
- [ ] Push the branch → open the **Vercel preview URL** (never merge this branch).

**Option B — your browser only (fastest, no deploy):**
- [ ] Open the live parent portal, sign in as the test parent
      (`stripetest+godspeed@YOURDOMAIN.com`).
- [ ] Before the dues tab loads, in DevTools console run: `window.STRIPE_LIVE = true`
      then open the "AAU Season Dues" tab. (If the tab already rendered, set it, then
      re-open the tab so `_directCheckout` re-reads the flag.)

---

## 5. Run the test payment

- [ ] Click **Pay Now** (or Pay Full Balance) on the test enrollment. It should redirect to
      **Stripe Checkout** (test mode shows an orange "TEST MODE" banner).
- [ ] Pay with the Stripe **success test card**:
  - Number: `4242 4242 4242 4242` · Exp: any future date · CVC: any 3 digits · ZIP: any 5 digits
- [ ] Confirm the browser redirects back to `parent-portal.html`.

---

## 6. Verify the auto-reconcile cascade (the whole point)

In Stripe (test) → Payments, open the payment and copy its **PaymentIntent id** → `pi_...`.
Then in the Supabase SQL editor confirm all three tables settled:

- [ ] **Enrollment** now paid in full:
```sql
select total_paid, total_owed, status
from parent_dues_enrollment where id = '<ENR_ID>';
-- expect: total_paid = total_owed, status = 'paid_in_full'
```
- [ ] **Installment(s)** marked paid:
```sql
select status, paid_at from dues_installments where enrollment_id = '<ENR_ID>';
-- expect: status = 'paid', paid_at set
```
- [ ] **Receipt row** written with the Stripe id:
```sql
select id, amount, status, stripe_pi_id
from dues_payments where stripe_pi_id = '<pi_...>';
-- expect: exactly ONE row, status completed
```
- [ ] Reload the **parent portal** dues tab → shows paid.
- [ ] Reload the **admin-os** Season Dues / Family Balances panel → test family shows settled.

---

## 7. Verify idempotency (Stripe retries won't double-count)

- [ ] In Stripe (test) → Developers → Webhooks → your endpoint → the delivered event →
      **Resend**.
- [ ] Re-run the `dues_payments` query from Step 6 → still **exactly one** row.
- [ ] Re-check enrollment `total_paid` → unchanged (not doubled). ✅ idempotency works.

---

## 8. Verify a declined card fails cleanly

- [ ] Repeat Steps 3–5 with a fresh test enrollment, but pay with the **decline card**:
      `4000 0000 0000 0002`.
- [ ] Confirm the family is **NOT** marked paid (no cascade, no `dues_payments` row) and the
      parent can retry. A failed card must never settle a balance.

---

## 9. Clean up test data (leave prod pristine)

- [ ] Delete the throwaway rows (child tables first — FK order):
```sql
delete from dues_payments      where stripe_pi_id = '<pi_...>';
delete from dues_installments  where enrollment_id = '<ENR_ID>';
delete from parent_dues_enrollment where id = '<ENR_ID>';
```
- [ ] Discard the test surface: delete the `test/stripe-testmode` branch (Option A) or just
      close the tab / set `window.STRIPE_LIVE = false` (Option B). **Never merge the flag flip.**

---

## 10. Sign-off gate — only flip live when ALL are true

- [ ] Success card → all three tables settled (Step 6) ✅
- [ ] Webhook resend → no double-count (Step 7) ✅
- [ ] Decline card → no settlement (Step 8) ✅
- [ ] Test data cleaned up (Step 9) ✅
- [ ] EIN obtained + **live** Stripe account active
- [ ] **Live** `sk_live_...` + `whsec_...` set on the functions (repeat Steps 1–2 with live values)
- [ ] Live webhook endpoint registered on the same URL
- [ ] Then, and only then: set `STRIPE_LIVE = true` on `main` via a PR, deploy, and do **one
      real $1–ish payment** to a test enrollment as a final smoke test before announcing.

---

**Rollback at any point:** set `STRIPE_LIVE = false` (one flag) → "Pay Now" instantly reverts
to the Venmo flow. No parent is stranded.
