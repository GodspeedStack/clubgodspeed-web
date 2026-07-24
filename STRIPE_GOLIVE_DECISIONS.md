# Stripe Go-Live + Scalable Dues Settlement — Decisions Contract

**Owner:** Scott · **Status:** In progress · **Branch:** `stripe-golive-and-scalable-dues`
**Goal (Scott's words):** "Let all users pay via the site so I don't have to track who paid" +
"zero out Denis/Anton's balance the efficient, at-scale way."

---

## 1. What already exists (verified in code)

| Piece | Where | State |
|---|---|---|
| Parent self-serve pay page | `billing-view.js` → parent portal "AAU Season Dues" tab | **Live**, but pays via **Venmo**, not card |
| Admin who-paid tracker | `admin-os.html` / `admin-os.js` → "Season Dues" panel | **Live** — balances, outstanding total, live feed, Mark Paid |
| Stripe checkout function | `supabase/functions/create-checkout-session/index.ts` | Coded, **not live**, and **not dues-aware** |
| Stripe webhook | `supabase/functions/stripe-webhook/index.ts` | Coded, **not live**, and **misses the dues cascade** |
| Venmo interim flow | `billing-view.js` `openPaymentModal` / `_submitVenmoModal` | **Live** — writes `dues_payments` row `status='pending_venmo'` |

**Why Scott still tracks by hand:** payments arrive by **Venmo (`@Coachsco`)**. Parent taps "I Sent It"
→ a `pending_venmo` row appears → **Scott manually confirms** it (`markPaymentConfirmed`). Stripe would
remove that manual step entirely — but it's off because it needs an **EIN + live Stripe account**.

---

## 2. Canonical payment model (source of truth)

Derived from the working `markPaymentConfirmed` (admin-os.js) and the `reverse_payment` RPC.
A **settled family** = these three tables in sync:

1. `parent_dues_enrollment` — `total_paid = total_owed`, `status = 'paid_in_full'`
2. `dues_installments` (FK `enrollment_id`) — each `status='paid'`, `paid_at` set
3. `dues_payments` (FK `installment_id`) — an audit/receipt row

> ⚠️ `parent_dues_enrollment` and `dues_installments` are **NOT defined in any repo migration** —
> they were created directly in the Supabase dashboard. The repo is not a reliable schema source.
> Column names above are confirmed from the RPC/admin code, but any new SQL must be validated
> against the **live** schema before running in prod.

---

## 3. The two code gaps blocking Stripe auto-reconcile

**Gap A — checkout sets no metadata.** `create-checkout-session` never attaches
`metadata` (no `paymentType`, no `enrollmentId`, no installment ids). Without it the webhook
cannot know which family/installment a payment settles.

**Gap B — webhook ignores the dues cascade.** The webhook's AAU branch only updates the
`payments` table by `paymentId`. It does **not** touch `parent_dues_enrollment` /
`dues_installments` / `dues_payments` — the tables both dashboards actually read. So even
with live keys, a card payment would **not** show the family as paid.

**Fix — DONE on this branch (both functions `deno check`-clean):**
- ✅ **Gap A** — `create-checkout` now has an `aau_dues` branch setting
  `metadata = { paymentType:'aau_dues', enrollmentId, installmentIds, parentEmail, amount }`.
- ✅ **Gap B** — `stripe-webhook` now has an `aau_dues` branch running the full forward cascade
  (mirrors the proven `markPaymentConfirmed`): marks `dues_installments` paid, updates
  `parent_dues_enrollment.total_paid`/status, inserts a completed `dues_payments` receipt row.
  **Idempotent** — skips if a `dues_payments` row already exists for that `stripe_pi_id`
  (Stripe retries won't double-count).

**Remaining — frontend flip (small, not yet done):** gate `openPaymentModal` in `billing-view.js`
behind `window.STRIPE_LIVE`. When true → call `create-checkout` with the contract below and
redirect to `data.url`; when false → current Venmo modal. Venmo stays as fallback.

**Call contract (what the frontend passes to `create-checkout`):**
```js
await supabase.functions.invoke('create-checkout', { body: {
  paymentType: 'aau_dues',
  enrollmentId,                 // parent_dues_enrollment.id
  installmentIds: [...],        // specific dues_installments ids; [] = pay full balance
  amount,                       // dollars
  parentEmail, playerName, label
}});
// → { url } : redirect the browser to it
```

---

## 4. Scalable settlement (this branch delivers)

`supabase/migrations/v13_01_bulk_mark_paid.sql` adds director/coach-gated RPCs:

- `mark_family_paid(enrollment_id)` — settle one family, full cascade, atomic, reversible.
- `mark_family_paid_by_email(email)` — same, keyed by parent email.
- `mark_enrollments_paid(uuid[])` — **batch-settle a whole team** in one call.

Admin UI (follow-up, small): a "Mark family paid" button per row and a "Mark team paid"
button that passes the selected team's enrollment ids to `mark_enrollments_paid`.

**Undo a bulk settle:** call `reverse_payment()` per installment, or manually reset
`total_paid` + set installments back to `pending`.

---

## 5. Task 1 — Denis / Anton to $0 (the efficient way)

Denis Blyakhman (Anton). Run **after** confirming his enrollment id against live data:

```sql
-- Preview first:
select id, parent_email, athlete_name, total_owed, total_paid, status
from parent_dues_enrollment
where parent_email ilike '%blyakhman%' or athlete_name ilike '%anton%';

-- Then settle (uses the new RPC — full cascade, reversible):
select mark_family_paid_by_email('DenisBlyakhman@gmail.com');
```

This is the same one call Scott will use per family / per team going forward — not a Denis-specific hack.

---

## 6. Go-live checklist

### Only Scott can do (business / access — blockers)
- [ ] Obtain **EIN** (in progress per CLAUDE.md).
- [ ] Create/activate **live Stripe account**; get `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`.
- [ ] Set Supabase function secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, confirm `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Register the Stripe webhook endpoint → `.../functions/v1/stripe-webhook`.
- [ ] **Grant the agent write access** to run migrations/settle balances: put `VITE_SUPABASE_URL`
      + `SUPABASE_DB_PASSWORD` (or `SUPABASE_SERVICE_ROLE_KEY`) in a local **`.env`** (gitignored).

### Code (this branch / follow-up PR)
- [x] Scalable settlement RPCs (`v13_01_bulk_mark_paid.sql`).
- [ ] Apply migration to prod (needs write access).
- [ ] Denis → $0 via `mark_family_paid_by_email` (needs write access).
- [x] Dues-aware checkout metadata (Gap A).
- [x] Webhook dues-cascade branch (Gap B).
- [ ] `STRIPE_LIVE` frontend flag in `billing-view.js`.
- [ ] Admin "Mark family / team paid" buttons.
- [ ] End-to-end test with a Stripe **test-mode** key before flipping live.

---

## 7. Open decisions for Scott
1. **Interim:** keep Venmo live until EIN lands, or hold all online payment until Stripe is ready?
2. **Card fee (~2.9%+30¢):** absorb it, or add it to the parent's total?
3. **Team model:** is there a team column on `parent_dues_enrollment`, or do we scope teams via the roster? (Determines the "Mark team paid" UI.)
