# Uniform Ordering — Build + Ship Handoff

Parent-facing uniform ordering with live jersey-number availability, first-come
number locking, Stripe checkout, an admin dashboard, and admin-email
notification that cannot be silently lost.

Decisions locked (from you): jersey + shorts set, numbers 0–99, Stripe checkout,
number locks the instant an order is placed.

---

## What's built

| Piece | File | Status |
|---|---|---|
| DB schema + RPCs + RLS | `supabase/migrations/v13_01_uniform_orders.sql` | **Applied to live DB.** File is the record. |
| Multi-team + swing logic | `supabase/migrations/v13_02_uniform_multiteam.sql` | **Applied to live DB.** Adds 6th/5th/4th teams, per-team number locks, team-aware availability. Verified. |
| Parent order page | `order-uniform.html` | Ready. Shows team scope (single vs swing). Linked from portal → Gear & Uniforms. |
| Admin orders dashboard | `admin-uniform-orders.html` | Ready. KPIs, filters, CSV export, manual "mark paid". |
| Admin roster tool | `admin-team-rosters.html` | Ready. Assign players to teams; check two teams = swing player. |
| Admin player details | `admin-player-details.html` | Ready. Edit birthday, sizes, allergies, emergency contact per player. |
| Player profile fields | `supabase/migrations/v13_03` + `v13_04` | **Applied.** athletes gains jersey_size, shorts_size, allergies, medical_notes, emergency_contact, emergency_phone; orders auto-write sizes; admin RPCs to read/write. |
| Master roster sheet | `private/Godspeed_Team_Roster_Master.xlsx` | Generated from the DB (gitignored — family PII). Ask to refresh anytime. |
| Admin-email notifier | `supabase/functions/send-uniform-order-notification/` | Needs deploy. |
| Stripe checkout | `supabase/functions/create-uniform-checkout/` | Needs deploy. Degrades gracefully if no Stripe key. |
| Stripe webhook | `supabase/functions/uniform-order-webhook/` | Needs deploy + webhook secret. |

**Swing-player rule (verified live):** a number must be free on EVERY team a player is
on; first-come locks it on all of them. Proven with a test — a swing player on 6th+5th
saw a number locked on 6th *and* a teammate's number on 5th as taken, while a 5th-only
player did not see the 6th-only lock. Single-team players are only limited by their own team.

**Rosters are seeded** (2026-08-23) from your lists — 6th (12), 5th (8), 4th/5th (5),
with swing players Anton, Ashton, Gene, Quest, Zach (5th/6th) and Zay (5th & 4th/5th) on
two teams each. Eight new players were created as placeholder athlete records (Sumear,
Phyer, Zach, Zay, Carter, Romeo, K.D., Dennis) — they have no last name / parent link yet;
add those details when ready. The two open Center slots (5th, 4th/5th) are still TBD.
Review or adjust anytime in `admin-team-rosters.html`.

**How "email without fail" works:** placing an order writes a durable
`uniform_orders` row AND a `uniform_order_notifications` row. The order is
therefore never lost and always shows in the admin dashboard. The email is sent
immediately by the parent page, and a cron drains any that didn't send, retrying
up to 5 times. Email is the notification; the database + dashboard are the
guarantee.

**Number lock (first-come):** enforced by a unique partial index on
`(team_id, jersey_number) where status in ('pending_payment','paid')`. Two
parents submitting the same number at the same instant → the DB rejects the
second, and the RPC returns a clean "that number was just taken" error.
Verified: duplicate insert was rejected in a live test.

---

## Ship steps (you run — Tier 0: git, deploy, secrets, money)

parent-portal.js shows as modified from an earlier session — it is **not** part
of this work. The commands below stage only uniform files.

### 1. Commit (scoped)
```bash
cd ~/clubgodspeed-web
git add order-uniform.html admin-uniform-orders.html admin-team-rosters.html admin-player-details.html .gitignore \
  supabase/migrations/v13_01_uniform_orders.sql \
  supabase/migrations/v13_02_uniform_multiteam.sql \
  supabase/migrations/v13_03_athlete_profile_fields.sql \
  supabase/migrations/v13_04_athlete_profile_rpc.sql \
  supabase/functions/create-uniform-checkout \
  supabase/functions/send-uniform-order-notification \
  supabase/functions/uniform-order-webhook
git add -p parent-portal.html   # review: adds only the "Start order" banner in the Gear view
git commit -m "feat(uniform): parent uniform ordering with multi-team/swing number locking, Stripe checkout, admin dashboard + roster tool, and durable admin-email notification"
git push origin main
```

### 2. Deploy edge functions
```bash
supabase functions deploy send-uniform-order-notification --project-ref nnqokhqennuxalamnvps
supabase functions deploy create-uniform-checkout        --project-ref nnqokhqennuxalamnvps
supabase functions deploy uniform-order-webhook          --project-ref nnqokhqennuxalamnvps
```
`RESEND_API_KEY` and `RESEND_FROM_EMAIL` are already set (welcome-email pipeline).
Optional: set the admin recipient explicitly (defaults to jewellsco@gmail.com):
```bash
supabase secrets set ADMIN_NOTIFY_EMAIL=jewellsco@gmail.com --project-ref nnqokhqennuxalamnvps
```

### 3. Schedule the notifier drain (retry backstop) — run this SQL after deploy
```sql
select cron.schedule(
  'uniform-notify-drain', '*/5 * * * *',
  $$ select net.http_post(
       url:='https://nnqokhqennuxalamnvps.supabase.co/functions/v1/send-uniform-order-notification',
       headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer <ANON_KEY>'),
       body:='{}'::jsonb) $$
);
```
(Use the project anon key, same pattern as `welcome-email-drain`.)

### 4. Stripe (money — your gate; works today without it)
Until these are set, an order is placed and the number is reserved; the parent
sees a "we'll follow up for payment" confirmation and you collect via Venmo and
click **Mark paid** in the dashboard. To turn on in-app checkout:
```bash
supabase secrets set STRIPE_SECRET_KEY=sk_live_xxx --project-ref nnqokhqennuxalamnvps
# In Stripe Dashboard → Developers → Webhooks: add endpoint
#   https://nnqokhqennuxalamnvps.supabase.co/functions/v1/uniform-order-webhook
#   event: checkout.session.completed  → copy the signing secret:
supabase secrets set STRIPE_UNIFORM_WEBHOOK_SECRET=whsec_xxx --project-ref nnqokhqennuxalamnvps
```

---

## Confirm before launch

- **Price:** defaults to **$55.00** for the jersey + shorts set. Change any time
  without code:
  ```sql
  update public.uniform_config set set_price = 60.00, updated_at = now() where id = 1;
  ```
- **Sizes:** YS, YM, YL, AS, AM, AL, AXL (jersey and shorts). Edit `jersey_sizes`
  / `shorts_sizes` on `uniform_config` to change.
- **Number range:** 0–99. Edit `number_min` / `number_max` on `uniform_config`.

Currently-taken numbers (assigned to active players): 1, 2, 4, 5, 6, 7, 8, 9,
10, 11, 12. Available at launch: 0, 3, 13–99.
