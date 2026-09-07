# Godspeed Raise — Decisions Contract
> Durable record for the in-house P2P fundraising platform (Vertical Raise replacement).
> Last updated: 2026-06-11. Transcript is disposable; this file is the record.

## Positioning
- Vertical Raise (for-profit LLC, Arbiter-owned) keeps 14-24% of donations; Godspeed keeps ~97% (Stripe processing only). This is the headline on every page and in every email.
- Receipts make NO tax-deductibility claims. Godspeed is an LLC, not a 501(c)(3). Future option: small sister 501(c)(3) booster entity (Vertical Raise NP Inc pattern) — revisit after EIN + one season of data.

## Architecture (deployed to production 2026-06-11)
- **Schema** (`supabase/migrations/v10_01_godspeed_raise.sql`): fundraising_campaigns (forward-only status: draft->live->ended->paid_out), campaign_participants, fundraiser_contacts, donations, fundraiser_email_log (insert-only ledger). security_invoker views. Completed donations auto-feed `fundraising_totals` (dues-credit model) via trigger; refunds decrement.
- **Public read path**: ONLY through `get_campaign_public(p_slug, p_preview default false)` SECURITY DEFINER RPC. No anon table policies. p_preview=true includes draft campaigns ONLY when the caller is staff (current_user_is_staff()); anonymous preview returns the public view.
- **Edge functions**: `fundraiser-checkout` (validated donate -> Stripe session + pending row; 503 = Stripe not configured), `fundraiser-engine` (the agent), `stripe-webhook` (fundraiser_donation branch + charge.refunded).
- **Engine auth**: NO caller auth (house cron pattern = no bearer tokens). Abuse resistance via ledger idempotency: every send path (cadence/receipt/impact/digest) dedupes against fundraiser_email_log; digest capped one per 20h; 48h rate limit per contact; donors leave the ask track. verify_jwt OFF on engine, ON on checkout.
- **Cron**: `fundraiser-engine-daily` 0 15 * * * UTC (9AM MT), created by cloning payment-reminders-daily command in SQL so the service key is never exposed in chat.
- **Cadence**: launch / 14 days / 7 days / 2 days left. Email shell: Helvetica Neue, black header bar, no logo, no emojis, BROTHERHOOD. HABITS. SUCCESS. footer, one-click unsubscribe.

## UX decisions
- Fundraise link lives in FOOTER ONLY (Programs column). Never in top nav (Scott, 2026-06-11).
- Public pages are dual-state: pre-launch teaser (status chip "Launching soon", sentence-case hero, no stats/dead CTAs) vs live campaign UI. Toggle: body.is-live + .live-only.
- Global styles.css h1 color/text-transform MUST be explicitly overridden on dark heroes (dark-on-dark bug).
- Copy: "We built our own" removed from comparison section (Scott, 2026-06-11).
- Preview mode: `?preview=1` renders full live experience for draft campaigns; donations intercepted client-side; bottom bar announces preview. All logic in fundraise.js only.
- Donation entry points when live: (1) cadence email "Support {athlete}" button -> player page (primary), (2) hub hero Donate now + player cards.

## Pilot campaign
- `fall-2026-season` (renamed from `10u-season-2026` by v19_02, 2026-09-07): one program campaign across all three current teams, 19 athletes @ $750 = $14,250 goal, status draft, 30-day window starts at launch (re-run the LAUNCH DAY block in v19_02 that day). Public names are first name + last initial.
- Pre-launch audit 2026-09-07 (v19_01 + fixes/2026-09-07-raise-prelaunch/): `p_preview` is honored only for staff sessions; `get_campaign_public` has exactly one signature; checkout inserts the pending row before creating the Stripe session; abandoned donations become `expired`, never deleted; donations status is forward-only; email ledger has unique (donation_id|contact_id, email_type).
- Parent linkage via parent_player_links junction: 7/12 linked (Aiden, Quest, Anton, Emory, Ashton, Khyrie, Khaliq). Unlinked (no junction rows): Cassius, A.D., Howard, Junior, Oliver — re-run the link UPDATE when their rows exist.

## Launch checklist (blocked on EIN/Stripe)
1. Set STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET in function secrets.
2. Parents upload 30-40 contacts each at fundraise-contacts.html.
3. Flip campaign to live in admin-fundraising.html (irreversible; starts 30-day clock + cadence).

## Ops notes
- Surfaces: fundraise.html (hub), fundraise-player.html?p={slug}, fundraise-contacts.html (parents), admin-fundraising.html (staff).
- Working pattern when Scott is away from terminal: SQL + function deploys via Supabase dashboard (Chrome), code via GitHub web editor direct to main, then sync local mount from raw.githubusercontent.
- Local repo may sit on stale feature/godspeed-raise: fix with `git stash && git checkout main && git pull`.
