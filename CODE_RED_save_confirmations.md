# CODE RED — "Saved" confirmations that don't save

**Status:** Reported bug FIXED + verified. Money-path fixed. Product-wide sweep
audited & classified; remaining fixes prioritized below. **Severity:** CODE RED
(data loss + trust). **Opened:** 2026-08-23 by Scott.

> Environment note: during this work the file-editor tool silently reverted some
> edits to existing files. All fixes below were re-applied and verified **on disk
> via the shell** (`grep` / `node --check`). Commit promptly to make them durable.

---

## The invariant (product law)
No success/"saved"/toast/checkmark may be shown for a write unless it (a) reached
Supabase, (b) was awaited, (c) is confirmed to have changed the intended row(s) —
proven by an error check **and** a returned row / rows-affected check — and (d)
failures are surfaced. "No error" is **not** proof: a Supabase `.update()`/`.delete()`
without `.select()` returns `{error:null}` on **zero rows** (RLS, wrong PK, or a
generated column). Proof is a read-back.

Three failure modes: **A STUB** (localStorage/memory only, no backend), **B
UNVERIFIED** (write with no rows-affected check), **C FIRE-AND-FORGET** (success
shown without awaiting / independent of the write).

---

## FIX LOG

### #1 Parent Settings save — FIXED, verified (parent-facing)
Was a localStorage mock (`handleSettingsSave`/`loadSettings`) showing "Profile
Linked & Saved ✓" with no DB call. Rewritten: reads via `get_my_settings()`;
writes parent fields to own `profiles` row with `.select()` + zero-row check;
writes athlete name/DOB via `update_my_athlete()` RPC (parents have no direct
UPDATE on athletes) which RETURNS the row; UI repaints from server values;
failures show "Not saved" and keep the form dirty. Migration `v13_05` (applied).
Verified by SQL jwt-impersonation of the real linked parent (row persisted &
returned). `node --check parent-portal.js` OK.

### #2 Admin money confirmations — FIXED, verified (financial)
`admin-os.js` `markDuesPaymentPaid` and `confirmVenmoPayment` marked dues
payments completed with **no rows-affected check**, then showed success — a
silent no-op corrupted financial state under a green toast. Now each update uses
`.select('id')`, aborts with an honest error if zero rows changed, and only then
confirms. `node --check admin-os.js` OK.

### #3 Parent document signing — FIXED, verified (legal/PII)
The signing had NO backend: the `signatures` table did not exist, `documents`
and `user_agreements` were empty, and "Signed Successfully!" fired on a timer
regardless — no signature was ever recorded. Built the full compliance flow:
seeded the 5 documents + current versions (content from the portal's
`DOCUMENT_TEMPLATE`), added `get_my_documents()` (auto-assigns each mandatory doc
to every linked parent x athlete, returns real agreements + content), and rewired
the portal to load real agreements, render DB content, and record signatures via
`record_document_signature` gated on its result (honest error, nothing marked
signed on failure). Migration `v13_06` (applied). Verified by SQL jwt-impersonation
of a real parent: get_my_documents returned 5 assigned docs; record_document_signature
set status=signed with the value stored (read-back), rolled back. `node --check` OK.
Note: signatures are captured as a drawn image (`signature_type='drawn'`); a
multi-athlete parent currently signs one athlete's copy per card (per-athlete cards
are a follow-up).

---

## Prioritized remaining fixes (exact, from the full audit)

### P1 — parent legal signature — BLOCKED ON BACKEND (legal) — `parent-portal.js` ~1851
INVESTIGATED 2026-08-23: there is NO signing backend. The `signatures` table the
portal inserts into **does not exist**; `documents` is empty; `user_agreements`
has 0 rows. So every "Signed Successfully!" has been false and no parent signature
has ever been recorded anywhere but localStorage. `record_document_signature`
exists but needs an `agreement_id` that does not exist. "Wiring the RPC" is
therefore not possible without first BUILDING the compliance system: (1) create
the 5 `documents` rows with Scott's real legal text, (2) assign to parents
(`assign_document_to_roster`), (3) load real agreements in the portal, (4) sign
via `record_document_signature` gated on `{success}`. This needs Scott's actual
document content + go-ahead (legal). DO NOT fabricate legal document text. Until
then the "Signed Successfully" copy is a live lie and should be made honest.
"…Signed Successfully!" fires on a `setTimeout` regardless of the DB write, and
the `signatures` insert error is only `console.error`'d — parent signatures may
never reach the system of record. **Fix:** wire to the proven RPC
`record_document_signature` (already used correctly by `document-tracker.js`
`trackSignature`), mapping the doc to its `agreement_id`; gate the confirmation
on `{success, signed_at}` and show an honest error otherwise. (Do not ship a
half-fix that breaks signing — integrate the RPC.)

### P1 — parent uniform/gear "order" stub (Class A, money) — `parent-portal.js` ~2190
Legacy "Order Request Sent ✓" writes only localStorage. **Fix:** remove it — the
real flow is `order-uniform.html` (`create_uniform_order`). Point the button
there or delete the stub so no parent believes a phantom order exists.

### P1 — legacy Venmo toast on return (Class A) — `parent-portal.js` ~118
`showToast('Venmo payment recorded…')` fires purely on a URL param, no write.
**Fix:** remove or reconcile against a real `dues_payments` row.

### P2 — money Class B (add `.select()` + row check, then confirm)
- `coach-portal.js` ~3052 fee waive (`payments.update status=completed`).
- `admin-uniform-orders.html` ~182 mark uniform order paid.
- `admin-fundraising.html` ~232 participant goal ("Saved" with NO error check).

### P2 — admin inline edits Class B (add `.select().single()` + row check)
`admin-os.js` ~408 athlete name, ~434 profile field, ~458 remove athlete, ~628
approve profile; ~421 & ~444 fire-and-forget sync (`.then(()=>{})` — check
`{error}`). `admin-analytics.html` ~332/~365 approve/deny (verify table name too).

### P2 — admin login approve/deny optimistic (Class C) — `admin-os.js` ~704/~730
Toast precedes the rpc. **Fix:** await + verify, then toast.

### P3 — Class A feature stubs (real backend builds, not one-liners)
These show success but have no backend at all; each needs a real write path +
verify. Track as separate tasks:
- `coach-portal.js`: publish box score (~1374 → `player_game_stats`), save eval
  (~982 → `player_evaluations`), save report (~860), save event (~1435), bulk
  grade import (~1079), share/email/push report (~883/916/923), focus tag (~632).
- `admin-documents.html`: send reminder / bulk / escalation / notify
  (~783/791/799/807/857 → `send-document-notification` edge function).
- `enrollment.js` ~215 program enrollment ("status PAID", zero backend).
- `admin-analytics.html` ~357 mock deny branch.

### Correct reference patterns already in the repo (copy these)
`document-tracker.js` `trackSignature` (rpc + `{error}`/`data.error` checks) ·
`order-uniform.html` `placeVerified` · `billing-view.js` enroll (`.insert().select().single()`) ·
`parent-portal.js` `bookSlot` (rpc returns `{ok}`).

---

## Counts (at audit time)
Class A (stub): ~19 · Class B (unverified): ~15 · Class C (fire-and-forget): ~6 ·
OK: ~18. FIXED so far: Settings (A→OK), admin dues money (B→OK).

## Definition of done
Every save persists-and-proves-it or shows an honest error — no third state —
verified per surface by a read-back, by someone who didn't write the fix.
