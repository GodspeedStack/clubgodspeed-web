# GODSPEED BASKETBALL -- 6-Month Roadmap
> June 16 - December 14, 2026 | 26 weekly sprints | Owner: Scott Jewell | Operator: Claude
> Revenue target: $0/mo new margin -> $12,000+/mo by M6

---

## Current State (June 13, 2026)

| Asset | Status |
|-------|--------|
| Site (clubgodspeed.com) | Live, Vercel auto-deploy |
| Season dues ($745/athlete) | Live, billing system operational |
| Training packages ($400/10hr) | Live, tracking in Supabase |
| Parent portal | Live, Google OAuth |
| Admin dashboard | Live, docs/compliance/billing |
| Godspeed Raise (fundraising) | Built, gated on Stripe/EIN |
| Apparel (Shortbread Shorts) | Spec complete, no store |
| SMS availability checks | Built, blocked on A2P 10DLC |
| LLC | Filed via ZenBusiness, pending CO approval |
| EIN | Blocked on LLC |
| Stripe | Blocked on EIN |
| DPS permit (open enrollment) | Not yet inquired |
| Elite 2+2 program | Designed, not launched |

---

## Phase 1: FOUNDATION (Weeks 1-4 | June 16 - July 13)
*Unblock the money infrastructure. Everything downstream depends on EIN + Stripe.*

### Sprint 1 (June 16-22) -- Entity + Admin Hardening
- [ ] Chase ZenBusiness on LLC status, escalate if stalled
- [ ] Admin billing impersonation mode (view any parent's billing as them)
- [ ] Fix billing-view.js to read from dues_payments/parent_dues_enrollment (not defaults)
- [ ] Wire remaining 5 parent_player_links (Cassius, A.D., Howard, Junior, Oliver)
- [ ] Push COWORK_THREAD_HEALTH_POLICY.md and GODSPEED_RAISE_DECISIONS.md to repo

### Sprint 2 (June 23-29) -- Stripe Integration (Part 1)
- [ ] EIN application (immediate on LLC approval)
- [ ] Stripe account setup + identity verification
- [ ] Stripe checkout integration for season dues (replace Venmo flow)
- [ ] Stripe webhook handler for dues payments (extend existing stripe-dues-webhook)
- [ ] DPS Community Use office: inquire about open enrollment + charging under Contract 41338

### Sprint 3 (June 30 - July 6) -- Stripe Integration (Part 2) + Raise Launch
- [ ] Stripe live keys into Supabase secrets
- [ ] Training package online checkout (Stripe)
- [ ] Godspeed Raise: flip campaign to live, send first fundraising emails
- [ ] Payment migration plan: communicate Stripe option to parents, sunset Venmo timeline
- [ ] A2P 10DLC registration (complete Twilio Sole Proprietor profile, ~$21 total)

### Sprint 4 (July 7-13) -- Parent Experience Polish
- [ ] Parent portal: unified dashboard (dues + training + fundraising + documents in one view)
- [ ] Payment history page (all Stripe transactions, receipts)
- [ ] Mobile-responsive audit of all parent-facing pages
- [ ] Email receipt templates (Resend) for Stripe payments
- [ ] SMS availability checks: verify delivery post-A2P approval

**Phase 1 Exit Criteria:** EIN in hand, Stripe processing real payments, Godspeed Raise live with first campaign running, DPS permit status known.

---

## Phase 2: FLOOR BUSINESS (Weeks 5-8 | July 14 - August 10)
*Pack the gym floor. Launch the Elite 2+2 program and Open Dev hour.*

### Sprint 5 (July 14-20) -- Elite Program Infrastructure
- [ ] Elite membership product: $300/mo recurring billing (Stripe subscriptions)
- [ ] Enrollment/registration flow for new (non-roster) athletes
- [ ] Digital waiver system for non-roster participants
- [ ] Insurance requirements research + Scott decision gate
- [ ] Pricing page: Elite 2+2 ($300/mo), Open Dev ($30/session), Private ($75+/hr)

### Sprint 6 (July 21-27) -- Open Dev Hour
- [ ] Drop-in registration and payment (single-session Stripe checkout)
- [ ] Capacity management (max athletes per session)
- [ ] Open Dev landing page with schedule, pricing, what-to-bring
- [ ] Parent self-registration (no admin bottleneck)
- [ ] Training price increase: $40/hr -> $75/hr private, $30/session group

### Sprint 7 (July 28 - August 3) -- Launch Marketing
- [ ] Elite 2+2 launch page (Mon 5-7 skills + Tue 5-7 live play, schedule grid)
- [ ] Email campaign to existing families: Elite program announcement
- [ ] Referral mechanism (existing families invite friends to Open Dev)
- [ ] Athlete profile pages (public-facing, stats + highlights placeholder)
- [ ] Schedule management: admin tool for session creation/cancellation

### Sprint 8 (August 4-10) -- Multi-Cohort Operations
- [ ] Multi-team support in admin (10U, Elite, Open Dev as separate cohorts)
- [ ] Attendance tracking for Open Dev and Elite (extend existing system)
- [ ] Helper/assistant coach role in auth (station coaches for 7pm open hours)
- [ ] Weekly revenue dashboard (admin): dues + training + drop-in + memberships
- [ ] First month retrospective: actual vs projected enrollment

**Phase 2 Exit Criteria:** Elite 2+2 accepting members, Open Dev running drop-in sessions, pricing updated, new athlete registration operational. Target: 6+ elite signups, 8+ drop-in athletes.

---

## Phase 3: BRAND BUSINESS (Weeks 9-12 | August 11 - September 7)
*Build the revenue streams that scale without Scott's time.*

### Sprint 9 (August 11-17) -- Sponsorship Platform
- [ ] Sponsorship tiers page: Court ($300/mo), Baseline ($750/mo), Championship ($1,500/mo)
- [ ] Sponsor inquiry form + automated follow-up email sequence
- [ ] Sponsor logo placement system (site footer, event pages, jersey/apparel mockups)
- [ ] Sponsorship contract template (Scott reviews, attorney if needed)
- [ ] Denver youth sports business outreach list (first 20 prospects)

### Sprint 10 (August 18-24) -- Content System
- [ ] Media gallery infrastructure (Supabase Storage or CDN)
- [ ] Photo/video upload from training sessions (coach mobile flow)
- [ ] Player highlight pages with embedded media
- [ ] Content calendar system (admin: schedule posts, track cadence)
- [ ] Parent media consent tracking (extend document management)

### Sprint 11 (August 25-31) -- Apparel Store
- [ ] E-commerce storefront for 6 SKUs (Stripe checkout)
- [ ] Product pages with size charts, brand imagery
- [ ] Order management in admin dashboard
- [ ] Inventory tracking (manual entry, low-stock alerts)
- [ ] Team bulk-order flow (season gear packages)

### Sprint 12 (September 1-7) -- Exposure + Film Add-On
- [ ] Film/exposure premium service page ($TBD/session or monthly add-on)
- [ ] Highlight reel request system (parent-initiated)
- [ ] Player evaluation reports (extend existing player_evaluations, parent-facing)
- [ ] Brand partnership one-pager (PDF, for sponsor outreach meetings)
- [ ] Month 3 retrospective: revenue by stream, pipeline health

**Phase 3 Exit Criteria:** Sponsorship program live with first sponsor signed, apparel store accepting orders, content pipeline operational. Target: 1+ sponsor ($300+/mo), first apparel orders.

---

## Phase 4: SCALE (Weeks 13-18 | September 8 - October 19)
*Grow enrollment, add programs, systematize operations.*

### Sprint 13 (September 8-14) -- Season 2 Prep
- [ ] Fall/winter season configuration (new season_dues_config)
- [ ] Returning athlete re-enrollment flow (pre-filled, one-click)
- [ ] New athlete tryout registration page
- [ ] Season schedule builder (admin: generate calendar_events for full season)
- [ ] Early-bird pricing / sibling discount logic

### Sprint 14 (September 15-21) -- Analytics + Reporting
- [ ] Financial dashboard: MRR, revenue by stream, collection rate, churn
- [ ] Athlete development tracking (evaluations over time, parent-facing)
- [ ] Parent engagement metrics (portal logins, document compliance, payment timeliness)
- [ ] Automated monthly financial summary email to Scott
- [ ] Tax-prep data export (all revenue, expenses, by category)

### Sprint 15 (September 22-28) -- Retention + Engagement
- [ ] Parent communication center (announcements, schedule changes, in-portal)
- [ ] Athlete achievements/milestones system (badges, progress tracking)
- [ ] Season recap page (stats, highlights, team records)
- [ ] Parent satisfaction survey (in-portal, post-season)
- [ ] Referral tracking with credit (refer a friend -> $X off next month)

### Sprint 16 (October 1-7) -- Age Group Expansion
- [ ] 12U/14U program pages and registration
- [ ] Multi-age-group scheduling (avoid conflicts, maximize gym utilization)
- [ ] Age-group-specific pricing and program descriptions
- [ ] Coach assignment per age group (helper coaches)
- [ ] Tournament team builder (select roster from pool)

### Sprint 17 (October 8-14) -- Tournament Operations
- [ ] Tournament registration flow (team entry + parent payment split)
- [ ] Travel logistics page (hotel blocks, carpools, parent coordination)
- [ ] Tournament results tracking (extend player_game_stats)
- [ ] Tournament cost calculator (entry fee + travel + lodging, per-family share)
- [ ] Exposure value scoring for tournament selection

### Sprint 18 (October 15-19) -- Operational Efficiency
- [ ] Automated payment failure handling (retry logic, grace period, dunning emails)
- [ ] Batch operations in admin (bulk email, bulk status change, bulk enrollment)
- [ ] Admin audit log (who did what, when -- extend document_events pattern)
- [ ] Performance optimization pass (lazy loading, caching, CDN)
- [ ] Security audit (RLS review, input validation, rate limiting)

**Phase 4 Exit Criteria:** Season 2 enrollment open, multi-age-group support, financial reporting automated, 2+ age groups active. Target: 25+ total athletes across programs, $6,000+/mo MRR.

---

## Phase 5: OPTIMIZE (Weeks 19-22 | October 20 - November 16)
*Mature the platform. Reduce manual ops. Push toward $12k MRR.*

### Sprint 19 (October 20-26) -- Membership Maturity
- [ ] Annual membership option (commitment discount vs monthly)
- [ ] Membership pause/cancel self-service (parent portal)
- [ ] Upgrade/downgrade flows (Open Dev -> Elite, add training packages)
- [ ] Family account linking (multiple children, single parent login)
- [ ] Dues forgiveness / scholarship workflow (admin-initiated)

### Sprint 20 (October 27 - November 2) -- Automation
- [ ] Automated roster management (enrollment -> roster -> attendance pipeline)
- [ ] Smart scheduling (conflict detection, utilization optimization)
- [ ] Automated end-of-month financial close (revenue recognition, outstanding balances)
- [ ] Parent onboarding automation (welcome sequence, portal tour, document signing)
- [ ] Coach prep automation (pre-practice roster, attendance trends, development notes)

### Sprint 21 (November 3-9) -- Growth Levers
- [ ] Google Ads landing page (local SEO: "youth basketball Denver")
- [ ] Community partnerships page (rec centers, schools, churches)
- [ ] Free clinic events (lead gen for Open Dev -> Elite pipeline)
- [ ] Alumni/older player mentorship program page
- [ ] Sponsorship renewal automation (approaching expiration alerts)

### Sprint 22 (November 10-16) -- Platform Hardening
- [ ] Load testing (concurrent parent portal users, payment spikes)
- [ ] Disaster recovery plan (Supabase backups, Vercel rollback)
- [ ] GDPR/privacy compliance review (data deletion requests, export)
- [ ] Accessibility audit (WCAG 2.1 AA on all parent-facing pages)
- [ ] Documentation: API contracts, database schema, deployment runbook

**Phase 5 Exit Criteria:** Self-service membership management, automated operations, growth marketing live. Target: 35+ athletes, $8,000+/mo MRR.

---

## Phase 6: COMPOUND (Weeks 23-26 | November 17 - December 14)
*Hit the $12k target. Set up for Year 2.*

### Sprint 23 (November 17-23) -- Revenue Optimization
- [ ] Pricing optimization (A/B or survey-based, are we leaving money on table)
- [ ] Upsell engine (training package suggestions based on attendance patterns)
- [ ] Corporate sponsorship push (holiday season = budget season)
- [ ] Gift cards / holiday packages (training hours as gifts)
- [ ] Year-end fundraising campaign (Godspeed Raise, holiday giving)

### Sprint 24 (November 24-30) -- Year in Review
- [ ] Annual report generator (per-athlete development, team achievements)
- [ ] Parent year-in-review email (personalized stats, their child's growth)
- [ ] Financial year-end summary (total revenue, expenses, margin by stream)
- [ ] Tax document preparation (1099s if applicable, expense categorization)
- [ ] Season awards / recognition system

### Sprint 25 (December 1-7) -- Year 2 Planning
- [ ] Year 2 program structure (age groups, schedules, pricing)
- [ ] Facility expansion research (second gym location, outdoor courts)
- [ ] Staffing plan (paid assistant coaches, admin help)
- [ ] Technology roadmap v2 (mobile app, advanced analytics, video platform)
- [ ] 501(c)(3) evaluation (should Godspeed have a nonprofit arm for grants/deductions)

### Sprint 26 (December 8-14) -- Ship + Reflect
- [ ] Final security audit
- [ ] Performance baseline documentation
- [ ] Year 1 retrospective (what worked, what didn't, key learnings)
- [ ] Year 2 roadmap draft
- [ ] Celebrate

**Phase 6 Exit Criteria:** $12,000+/mo MRR, multi-program operations, Year 2 plan ready. Godspeed is a real business.

---

## Revenue Ramp (Pro Forma)

| Month | Period | New MRR Sources | Cumulative Target |
|-------|--------|-----------------|-------------------|
| M1 | June 16 - July 13 | Existing dues + training only | ~$900 baseline |
| M2 | July 14 - Aug 10 | +Stripe live, +Raise campaign | ~$1,800 |
| M3 | Aug 11 - Sep 7 | +Elite memberships (6x$300), +Open Dev, +sponsorship | ~$3,600 |
| M4 | Sep 8 - Oct 5 | +Apparel, +more Elite (10x$300), +S2 enrollment | ~$5,500 |
| M5 | Oct 6 - Nov 2 | +Age group expansion, +2nd sponsor | ~$8,000 |
| M6 | Nov 3 - Dec 14 | +Full enrollment, +holiday campaigns, +corporate sponsors | ~$12,000+ |

---

## Dependencies + Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| LLC/EIN delayed further | Blocks Stripe, Raise, sponsorships -- entire Phase 1 | Escalate ZenBusiness weekly, consider alternative filing |
| DPS denies open enrollment | Kills Elite 2+2 and Open Dev | Pivot to invite-only or secure alternative venue |
| <5 Elite signups by Week 10 | Revenue target at risk | Survey parents, adjust pricing, double down on Open Dev pipeline |
| Scott's time overstretched | Coaching quality drops, burnout | Buy hands earlier (Sprint 8), strict schedule boundaries |
| Stripe onboarding issues | Payment infrastructure delayed | Parallel-path: keep Venmo alive, add Zelle as interim |
| A2P 10DLC rejected | No SMS capability | Email-only communication (already functional) |

---

## Gate Decisions (Scott must decide, blocking downstream work)

| Decision | Blocks | Deadline |
|----------|--------|----------|
| LLC entity type (LLC vs LLC + 501c3) | EIN application, tax strategy | Sprint 2 |
| DPS permit inquiry result | Elite 2+2 launch, Open Dev | Sprint 3 |
| Insurance for non-roster athletes | Open Dev launch | Sprint 5 |
| Private training price ($75 vs $90) | Pricing page, marketing | Sprint 6 |
| Elite membership price ($275 vs $300 vs $325) | Membership billing | Sprint 5 |
| Apparel production vendor | Store launch | Sprint 10 |
| WINNING vs SUCCESS (tagline reconciliation) | Apparel print, brand consistency | Sprint 9 |

---

*Sprint 1 begins Tuesday, June 17, 2026. This document is the contract. Update it at each phase boundary.*
