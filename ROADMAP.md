# Platform Backlog — parents, documents, dues

> The backlog Claude pulls from when working autonomously. Business-level goals live in
> `GODSPEED_ROADMAP.md`; this file is the engineering queue.
>
> Owner: Scott Jewell · Operator: Claude · Opened 2026-09-17
> Diagnosis and measurements: `claude/PLAN-scale-to-8-teams.md` (project docs)

## Why this exists

Parent identity is keyed by **email strings**, by **individual guardians**, and by a
**single-value `profiles.role`** rather than by **families**. Every sign-in, document and dues failure traces back to that, and each one costs
manual repair that grows linearly with roster size. 3 teams / 24 athletes / 44 guardians works
because one person can fix it with SQL. 8 teams is ~96 athletes and ~175 guardians.

## Decisions already made (2026-09-17)

| Fork | Decision |
|---|---|
| Dues re-key | **Proper migration.** Add `payer_profile_id`, move RLS onto `parent_player_links`, drop the email dependency. Not a compatibility view. |
| Sequencing | **Data model first, then flow.** Do not build onboarding on the broken model. |
| Stranded parents | **Repair links now** (no email, reversible). One clean re-invite run after the model is fixed. |
| Admin notification of parent messages | **Portal only.** No new outbound email. (Shipped, `41e5347`.) |

## How Claude works this list

1. Take the topmost `TODO` task whose gate is clear.
2. Build it, verify it against **Done when**, mark it `DONE` with the evidence.
3. Move to the next. Do not stop after one task.
4. On a `GATE` task: prepare everything, stage it, write the exact command, mark `BLOCKED`,
   and move on to the next task that is not blocked.

**Gates — never done without Scott:** applying a migration to production, sending any message to
a parent, committing, pushing, deploying, anything touching money or credentials. Claude stages
the work and leaves the command.

---

## NOW — stop the bleeding

### N0. Stop defining "is a parent" by `profiles.role` · TODO
`profiles.role` holds one value, so a coach who is also a parent cannot be both. Five places ask
`role = 'parent'` to decide who gets parent communication: `send-practice-update`,
`send-calendar-update`, `send-tournament-reminders`, and two admin queries
(`admin-os.js:4188`, `:4265`).

Measured today: **Steven Ware is `role='coach'` and is the father of Jazsias and Zion.** He is
excluded from every practice update, schedule change and tournament reminder about his own sons.
Scott is `role='director'` with a linked child and is excluded the same way. At 8 teams most
coaches will be parents too.

The definition of "is a parent of this athlete" must be *has a row in `parent_player_links`*, not
a role string. Role stays for staff permissions only.

- **Done when:** the three senders and both admin queries resolve recipients through
  `parent_player_links`; a coach-parent appears in the recipient set for their own child and not
  for anyone else's; proven on a scratch DB with Steven Ware's exact shape.
- **Gate:** deploy functions.

### N1. Repair the broken family links · TODO
4 active athletes have no guardian: **Samire B, Nehemiah Fields, Jazsias Ware, Zion Ware.** All
four carry a synthetic `unassigned+<athlete-id>@clubgodspeed.com` dues email, so nobody is billed
and nobody can sign.

Evidence available for three of them:
- **Jazsias Ware, Zion Ware** → Steven Ware (`bigstevejr@yahoo.com`), stated in
  `parent_dues_enrollment.parent_name`, account exists but is `role='coach'`. Depends on N0.
- **Nehemiah Fields** → Tashaun (`Tashaun0817@yahoo.com`). **No account exists yet** — the welcome
  email was drafted 2026-09-15 and never sent. Blocked on that invite going out.
- **Samire B** → unknown. Needs Scott.

Reconnect from evidence only. Never infer a relationship from a surname.

- **Done when:** Jazsias and Zion are linked to Steven Ware, Nehemiah is linked once Tashaun has
  an account, Samire is on Scott's list, and the double-`is_primary` athlete is resolved.
- **Gate:** apply to production.

### N2. Documents: the family rule already works — re-scoped · MOSTLY DONE
**Corrected 2026-09-17 after measuring.** An earlier session shipped `v21_01`/`v21_02`, which
added `agreement_is_family_covered()`, `reminder_candidates()` and family-aware admin views.
Reads already honor the rule, so the phantom-outstanding problem is largely closed. Verified
against the three-guardian families:

| Athlete | Raw unsigned rows | Genuinely outstanding |
|---|---|---|
| Quest Scott | 6 | **0** — fully compliant |
| Ashton Bowman | 10 | **2** (Medical Consent only) |
| Khyrie Dixion | 10 | **2** (Medical Consent only) |
| Aiden Candies | 6 | **3** |

What is actually left here:
- `user_agreements` RLS is still `parent_user_id = auth.uid()`. Low impact because the portal
  reads through SECURITY DEFINER functions that apply the family rule, but any new screen that
  queries the table directly will show the wrong thing. Tighten it to match the functions.
- The surplus rows (165 where 120 is right) still inflate anything that counts raw rows.
  Dedupe is now cosmetic, not behavioural — do it, but it is not urgent.

- **Done when:** RLS on `user_agreements` matches the family rule the functions already use, and
  no screen counting raw rows disagrees with `agreement_is_family_covered()`.
- **Gate:** apply to production.

### N2b. Confirm the Medical Consent policy · BLOCKED (needs Scott)
`Medical Consent` is the one document flagged `requires_each_guardian = true`. That flag is now
the single largest source of remaining outstanding items — in a three-guardian family it demands
three separate signatures. Every other form is satisfied by one guardian.

This is a policy question, not a bug. If one guardian's medical consent is sufficient, clearing
the flag closes most of what is left outstanding today.

- **Done when:** Scott confirms, and the flag matches the decision.

### N3. Assign the missing document sets · TODO
6 active athletes have zero agreements — never asked. Assignment is manual, so new players got 1
row instead of 5. This is now the largest real compliance gap, ahead of anything in N2.

- **Done when:** every active athlete has exactly the current required set, and a trigger assigns
  it on roster insert so this cannot recur.
- **Gate:** apply to production.

### N4. Re-key dues from email to ids · TODO
RLS is `parent_email = auth.jwt()->>'email'`. Billing is joined to people by string equality.
17 guardians can never see dues, 5 active athletes have a payer email matching no account, 8 have
no payer at all, and siblings already break the admin's `.eq('parent_email', …).maybeSingle()`.

Add `payer_profile_id` (FK to profiles), grant through `parent_player_links`, keep `parent_email`
as a display field only, replace the sibling-breaking lookup with a per-athlete one.

- **Done when:** on a scratch DB, every guardian with full access can read their family's
  enrollment and installments; a two-child family returns two enrollments without error; a parent
  from another family reads zero rows.
- **Gate:** apply to production.

### N5. Retire the legacy billing path · TODO
Three parallel systems: `parent_dues_enrollment`+`dues_installments` (live, 28/66),
`payment_plans`+`payments` (legacy, 14/21 with 19 still pending), `season_fees` (empty).
`api/cron-reminders.js` and `send-payment-reminders` both read the legacy table, so ghost
reminders can fire off stale rows.

- **Done when:** nothing in the codebase reads `payments` or `payment_plans` for live billing, the
  legacy tables are marked read-only, and a grep proves no remaining reference.
- **Gate:** apply to production.

### N6. Add the guardrail constraints · TODO
Stop the gaps from re-opening: at most one `is_primary` per athlete; no active athlete without a
guardian, without a payer, or without its document set.

- **Done when:** each constraint is proven to reject the bad case and accept the good one on a
  scratch DB. Depends on N1, N3, N4.
- **Gate:** apply to production.

### N7. Collapse `athlete_parents` into `parent_player_links` · TODO
Split-brain pair, 37 rows vs 4. `get_my_team_ids()` read the wrong one once already.

- **Done when:** the 4 legacy rows are merged or proven redundant, nothing reads
  `athlete_parents`, and it is dropped or renamed `_deprecated`.
- **Gate:** apply to production.

### N8. Get the test accounts out of production · TODO
**7 of the 44 parent accounts are test accounts** living in the production `profiles` table:
`jewellsco+e2etest@`, `jewellsco+livetest@`, `fresh-test-…@test.invalid`,
`test-director+imp@godspeedtest.dev`, `test-director+impersonation@clubgodspeed.com`,
`testparent_demo@example.com`, `testparent.april2026@gmail.com`.

Two of those are **real deliverable inboxes**, so a broadcast to "all parents" mails them. They
also inflate every count: the real parent number is 37, not 44, and real never-signed-in is 10,
not 15.

- **Done when:** test accounts are marked non-production (flag, not delete, so nothing cascades),
  every recipient query excludes them, and the admin counts show 37.
- **Gate:** apply to production.

---

## NEXT — make it scale

### X1. Self-serve onboarding, invite to signed · TODO
One path: invite → claim account → link athlete → sign documents → set up payment, with no admin
SQL anywhere in it. This is what removes the per-family manual work.
- **Done when:** a brand-new family completes the whole path on a preview deploy with zero admin
  action, captured as screenshots of every screen.

### X2. Automatic assignment on roster change · TODO
New athlete gets the document set and the season's dues enrollment automatically.
- **Done when:** inserting a test athlete on a scratch DB produces the full document set and an
  enrollment with installments, with no manual step.

### X3. Family-centric admin view · TODO
One screen per family — every child, guardian, document and balance — instead of per-row tables.
At 175 guardians the current per-row screens stop being usable.
- **Done when:** the view renders a 3-guardian, 2-child family correctly; screenshot as evidence.

### X4. Nightly integrity check · TODO
Report drift into the admin portal instead of letting it accumulate silently: athletes without
guardian/payer/documents, orphan parents, multiple primaries, enrollment emails matching no
account.
- **Done when:** the check runs, and today's known gaps appear in it before they are fixed.

### X5. Recover the 15 stranded parents · BLOCKED (needs Scott)
All 15 were created 2026-03-25 to 2026-08-03, the bulk-seed era. Every parent created since June
has signed in, so the auth mechanism is fine — this is a cohort, not a bug.
- **Done when:** Scott has reviewed and sent one re-invite run. Drafts only, never sent by Claude.
- **Blocked on:** N1–N4 landing, so they arrive to a portal that works.

### X6. Jersey number picker · BLOCKED
`supabase/migrations/20260915030000_jersey_number_picker.sql` is written but never applied —
`teams.jersey_pool` does not exist live.
- **Gate:** apply to production.

---

## LATER — durability

### L1. Stripe and a real payer-of-record · BLOCKED (needs EIN)
Replaces Venmo reconciliation. Gated on LLC → EIN → Stripe.

### L2. Test coverage on the three paths that keep breaking · TODO
Auth, documents, dues. There is currently no automated test on any of them, which is why the same
class of bug keeps returning.
- **Done when:** a test run covers sign-in, family document completion and dues visibility, and
  fails if RLS regresses.

### L3. Season rollover as one operation · TODO
Rolling a season should be one action, not a migration.

### L4. Migration naming collision · TODO
`2026…` timestamped files sort before `v20_*`, so a fresh replay lets an older vulnerable version
overwrite a hardened one. Pick one convention and renumber.

### L5. Attendance policy vs. code · TODO
The signed parent agreement and what the code enforces disagree. Add the `unexcused` state to the
CHECK constraint and remove the fabricated attendance percentage at `parent-portal.js:2102`.

---

## Done

- **2026-09-17 · Parent message ledger** (`41e5347`) — every message to a parent recorded exactly
  once, 15 senders on a shared chokepoint, webhook records every provider event so a bypass shows
  up flagged. Closed three holes in `comms-webhook`: no signature verification, PostgREST filter
  injection from the payload recipient, silent 400-drops of every non-campaign event.
- **2026-09-17 · Date handling** — Postgres `date` columns were parsed as UTC midnight, so parents
  saw invoice due dates one day early and payments were flagged overdue on their own due date.
  Fixed at 12 call sites. Calendar's baked-in windows replaced with a rolling lookback. Repaired a
  hard syntax error that stopped `training-report-pdf.js` parsing at all.
