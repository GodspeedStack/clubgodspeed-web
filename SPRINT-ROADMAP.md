# Godspeed 90-Day Sprint Roadmap

**Owner:** Claude (autonomous)
**Methodology:** gStack (Think > Plan > Build > Review > Test > Ship)
**North Star:** Error-free site, top-tier parent portal, functional store, frictionless auth
**Start:** April 26, 2026

---

## Phase 1: Foundation (Weeks 1-2)
*Fix what's broken, wire what exists, unblock everything else.*

### Sprint 1A: Parent Login Rebuild
**Status:** Auth works (email+password) but is friction-heavy. Google OAuth exists in onboarding.js but not on the login form. No magic link.

**Deliverables:**
- [ ] Add Google OAuth button to parent-portal.html login form (code already exists in onboarding.js, needs to be surfaced)
- [ ] Add magic link / passwordless login via Supabase `signInWithOtp()` -- email-based, no password required
- [ ] Redesign login screen: Google button primary, magic link secondary, email+password tertiary (progressive disclosure)
- [ ] Auto-link new OAuth signups to existing profiles (match on email)
- [ ] Remove approval gate friction -- parents auto-approved via handle_new_user() trigger (already deployed)
- [ ] Add "Remember me" / persistent session (extend Supabase session TTL)
- [ ] First-time onboarding flow: after first login, prompt for athlete name + phone if missing from profile
- [ ] Error states: clear, actionable messages for every failure mode (wrong password, unverified email, account not found)

### Sprint 1B: Store -- Wire Frontend to Backend
**Status:** Full Supabase schema exists (products, variants, orders, inventory). Frontend is hardcoded. Stripe pending EIN.

**Deliverables:**
- [ ] Replace hardcoded product arrays in store.html and product.html with live Supabase queries against `storefront_products` view
- [ ] Wire product variant selection (sizes) to `product_variants` table with real inventory counts
- [ ] Show "Out of Stock" / "Low Stock" badges from inventory data
- [ ] Cart persists in localStorage (already works) but validates against live inventory on checkout
- [ ] Checkout flow: Venmo interim (same pattern as season dues -- QR + "I Sent It" confirmation)
- [ ] Order creation: on Venmo confirmation, insert into `orders` + `order_items`, decrement inventory
- [ ] Admin order view: add orders tab to admin-os.html showing pending/confirmed/shipped orders
- [ ] Seed remaining products into Supabase (currently only 3 seeded, store shows 5)

### Sprint 1C: Site Cleanup
- [ ] Commit + push all audit fixes from today's session
- [ ] Deploy shared-footer.js, billing-view.js fixes, emoji removal, copyright updates
- [ ] Hide contact email behind server-side form handler (Resend edge function)
- [ ] Fix "Synthesizing Database Config..." debug text on season-guide.html
- [ ] Fix roster size missing value on season-guide.html

---

## Phase 2: Polish (Weeks 3-5)
*Take every flow from "works" to "delights."*

### Sprint 2A: Parent Portal -- Production Grade
- [ ] Performance section: wire to `player_evaluations` table (renderer exists, needs data connection for each parent's athlete)
- [ ] Player Cards: wire to `player_game_stats` (renderer exists in player-cards-renderer.js)
- [ ] Training hours: wire to real package/attendance data (training_sessions + training_attendance)
- [ ] Sessions Completed / Upcoming / Active Programs: live counts from Supabase
- [ ] Document signing: end-to-end flow (view > sign > confirm) with signature canvas already built
- [ ] Gear ordering: wire "Confirm Order Request" to create order in Supabase + notify admin
- [ ] Settings: wire Save Changes to update profiles table
- [ ] Mobile responsive pass -- every section tested at 375px

### Sprint 2B: Store -- Checkout & Fulfillment
- [ ] When Stripe goes live (EIN + biz bank): swap Venmo checkout for Stripe Checkout Sessions
- [ ] Order confirmation page with order number + estimated fulfillment
- [ ] Order history in parent portal (new "Orders" sidebar section)
- [ ] Admin fulfillment UI: mark orders shipped, add tracking number
- [ ] Email receipt on order confirmation (via Resend)
- [ ] Inventory alerts: edge function notifies admin when stock < threshold

### Sprint 2C: Auth Hardening
- [ ] Rate limiting on login attempts (Supabase edge function or RLS-based)
- [ ] CAPTCHA on signup (hCaptcha or Turnstile, not reCAPTCHA)
- [ ] Session management: show active sessions in settings, allow sign-out-all
- [ ] 2FA opt-in for admin/coach accounts (TOTP already scaffolded in security.js)
- [ ] Audit log: log all auth events (login, logout, password reset, OAuth link)

---

## Phase 3: Scale (Weeks 6-10)
*Build for the next season, not just this one.*

### Sprint 3A: Multi-Season Support
- [ ] Season config management in admin (not hardcoded $745)
- [ ] Tournament schedule live from Supabase (replace any remaining hardcoded dates)
- [ ] Season archive: parents can view past season data

### Sprint 3B: Communication Layer
- [ ] In-portal notifications (bell icon, unread count)
- [ ] Admin broadcast: send announcement to all parents from admin dashboard
- [ ] SMS when A2P 10DLC clears (Twilio already built, blocked on registration)

### Sprint 3C: Store Expansion
- [ ] Product management admin UI (add/edit/remove products, upload images, set prices)
- [ ] Category pages with filtering/sorting
- [ ] Product image gallery with zoom
- [ ] Size guide page
- [ ] Wishlist / saved items

---

## Phase 4: Launch Ready (Weeks 11-13)
*Final QA, load testing, documentation.*

- [ ] Full accessibility audit (WCAG 2.1 AA)
- [ ] Performance audit (Lighthouse 90+ on all pages)
- [ ] Security review (OWASP Top 10 check, RLS audit, CSP headers)
- [ ] SEO basics (meta tags, OG images, sitemap.xml, robots.txt)
- [ ] Error monitoring (Sentry or equivalent)
- [ ] Analytics (basic event tracking for key flows)
- [ ] Documentation: ARCHITECTURE.md, updated DESIGN-DEV-RULES.md
- [ ] Retrospective

---

## Escalation Triggers (always)
These ALWAYS require Scott's approval before deploy:
- Any email/SMS sent to parents
- Auth flow changes that affect existing accounts
- Payment logic changes (Stripe integration, pricing)
- Database migrations that modify existing data
- Security policy changes (RLS, CORS, CSP)

## Velocity Tracking
| Week | Shipped | Notes |
|------|---------|-------|
| W1   |         |       |
| W2   |         |       |
| ...  |         |       |
