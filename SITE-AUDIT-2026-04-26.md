# Godspeed Basketball Site Audit

**Date:** April 26, 2026
**Auditor:** Claude (Principal Engineer)
**Scope:** All public pages at clubgodspeed.com + authenticated parent portal

---

## CRITICAL -- Broken Content & Logic Errors

### P0: Parent Portal -- Contradictory Billing State
The "Action Required" banner tells parents to select a payment plan, but directly below, the Payment Plan section says "All caught up! No open invoices." These cannot both be true. One or the other is wrong for every parent who sees this page.

### P0: Parent Portal -- Stuck Loading States (3 sections)
Three sections are stuck showing loading spinners with no data:
- "Loading performance data..." (Performance section)
- "Loading player cards..." (Vault section)
- "Loading schedule..." (Season Dues > Training Schedule)

These should either load real data or show a clean empty state. Indefinite spinners look broken.

### P0: Parent Portal -- Training Schedule Shows January 2026 Dates
The Training Schedule section shows hardcoded sessions from January (Jan 4, Jan 10, Jan 11). It is now late April. This data is stale mock data that was never replaced with live queries.

### P0: Parent Portal -- Training Hours Are Hardcoded Mock Data
"37.5 hours remaining" and "12.5" used are hardcoded values, not pulled from any database. For Aiden's parent account, this is inaccurate and misleading.

### P0: Parent Portal -- Sessions Completed / Upcoming / Active Programs Empty
These three stat cards show labels with zero or no values rendered. They appear as blank boxes.

### P0: About Page -- Broken Coach Gene Bio
Coach Gene's bio reads: "Coach Gene is a with decades of experience developing athletes both on and off the court. He bridge." The phrase "is a" is missing the noun (the word "coach and dedicated educator" appears as a styled child but may not be rendering inline correctly), and "bridge." is truncated mid-sentence.

### P0: About Page -- Broken Coach Scott Bio
"Coach Scott's coaching bridges biomechanics, cognitive skill-building, and identity-rooted in ..." -- sentence truncated with ellipsis. Incomplete thought.

---

## HIGH -- Text/Spacing Bugs Visible to Users

### P1: Homepage -- "BUILT DIFFERENT.TRAINEDDIFFERENT."
Missing spaces. Should be "BUILT DIFFERENT. TRAINED DIFFERENT."

### P1: Homepage -- "builds complete player"
Hero text is truncated. Missing the rest of the sentence.

### P1: Training Page -- "TRAIN WITHGODSPEED."
Missing space between "WITH" and "GODSPEED."

### P1: Training Page -- "Commit to the process.Elevate your game."
Missing space after period.

### P1: AAU Page -- "Travel Teams. Elite Schedule.The next generation"
Missing space after "Schedule."

### P1: AAU Page -- "Honoring the game.Elevating the player."
Missing space after "game."

### P1: AAU Page -- Broken Prose
"We believe basketball is more than a sport. It's an education. Club Godspeed exists to provide an .." -- truncated with double period. And: "We are building a culture where is the ultimate talent." -- the word "character" is a styled child element that may not render inline, making the sentence read nonsensically.

### P1: Parent Audit Page -- "PARENTINGTHE ELITE"
Missing space between "PARENTING" and "THE."

### P1: Contact Modal (all pages) -- "GET INTOUCH"
Missing space. Should be "GET IN TOUCH." Appears on every page that has the contact modal.

### P1: Calendar Page -- "Send Message_"
Button text has a trailing underscore character.

---

## HIGH -- Stale/Wrong Data

### P1: Copyright Year "2025" (site-wide)
Every page footer shows "Copyright 2025." It is 2026. This appears on: homepage, training, parent-audit, compare-programs, and several others. Some pages show the shorter "2025" variant.

### P1: AAU Page -- Season Shows "2024 / 2025 SEASON"
The team divisions section says "2024 / 2025 SEASON." The current season is Spring/Summer 2026.

### P1: Season Guide -- Past Tournament Dates
The tournament table lists events starting April 4, April 11-12, April 17-19, April 23-25. These dates have already passed. The guide should indicate which events are complete and which are upcoming.

### P1: Parent Portal -- Guard Academy Syllabus "Added 2025-01-01"
Document date is from January 2025. Likely placeholder.

### P1: Calendar Sync Modal -- "2025-26 Season"
Says "Add the 2025-26 Season to your device." Should reference the current 2026 season.

---

## MEDIUM -- Dead Links & Navigation Inconsistencies

### P2: Footer Dead Links (site-wide)
The following footer links point to "#" (dead) on most pages: Academy, AAU Camps, Contact (some pages), Careers, Privacy Policy, Terms of Use, Sales Policy, Legal, Site Map, Skill Assessment (some pages), Coach Portal (some pages).

### P2: Inconsistent Footer Across Pages
The footer content varies by page. Some pages have "Contact" linking to "#contact", others to "#", others to "contact.html". The "Academy" link is sometimes a dead "#", sometimes missing entirely. Shop items sometimes have links, sometimes are plain text. This creates an inconsistent experience.

### P2: Bottom Nav vs Top Nav Calendar Link Mismatch
Top nav links to `calendar-grid.html`. Bottom mobile nav links to `calendar-preview.html`. The "Season View" link on the calendar page also goes to `calendar-preview.html`. These should be consistent or the distinction should be intentional and clear.

### P2: Nav "Shop" Inconsistency
On the training page and AAU page, Shop shows "SOON" badge and is not a link. On the store page itself, Shop is a working link. On the parent portal, the sidebar links to store sections. The store page exists and has products. Remove the "SOON" badge or clarify that it's coming.

### P2: "Forgot Password" Link Dead
On the parent portal login form, "Forgot password" is `href="#"`. It should trigger the password reset form that already exists on the page.

### P2: "Join" Link Dead
The "Don't have an account? Join" link is `href="#"`. Should toggle to the signup form.

---

## MEDIUM -- Incorrect Contact Info

### P2: "info@godspeed.com" Across Multiple Pages
The contact modal (training, calendar, and others) shows "info@godspeed.com". This is almost certainly not a real email address you own. It should be the actual contact email (e.g., the one in Supabase or your personal coaching email).

---

## MEDIUM -- Parent Portal UX Issues

### P2: Emojis in Training Section
The Current Skills Programs section uses emoji characters: "Mon 6pm" and "Coach Scott". Per your design rules, no emojis in UI. These should be text/SVG/CSS icons.

### P2: "Premium Member" Badge
Sidebar shows "Premium Member" under the user's name. This appears to be a hardcoded string with no meaning in the system. Either remove it or tie it to actual membership tier data.

### P2: Venmo Billing Modal Shows $745 Without Fundraising Credit
The billing modal hardcodes "$745.00" as Balance Due. For parents with fundraising credit (e.g., Khyrie at $345, Khaliq at $285), this is wrong. The modal should pull the adjusted balance.

### P2: "Help Build Player Cards" Text Truncated
"Track your player's game stats (points, rebounds, assists, steals) and share them with Coach Scott o" -- cut off mid-word.

### P2: Gear Section -- Blue Shorts
"Game Shorts (Blue)" in the uniform package. Your brand colors are black/orange. Is blue correct? If not, this confuses parents ordering.

### P2: Training Programs Pricing Inconsistency
The parent portal shows: 1 Session $45, 5 Pack $200, 10 Pack $350, Unlimited $250/mo. The compare-programs page shows: Elite Guard Academy $150/mo, IQ School $120/mo, Strength + Movement $100/mo. These are different pricing structures with no clear relationship. A parent seeing both would be confused about what they're actually paying for.

---

## LOW -- Polish & Consistency

### P3: About Page -- Duplicate Quotes
"Champions aren't made in comfort zones." / "Built Different" appears twice consecutively.

### P3: Skill Audit Page -- "Mental Reps" Audio Guide
The gate screen mentions a "Mental Reps Audio Guide" as an incentive. Does this asset actually exist? If not, remove the reference.

### P3: Compare Programs -- "ADD TO CART" Non-Functional
The cart system appears to be a frontend-only mock. Adding programs to cart does nothing meaningful since there is no checkout integration. This sets false expectations.

### P3: Store -- Checkout Non-Functional
Same issue. The store has products, cart, and a Checkout button, but no payment processing. The "Pay with Venmo" link in the cart goes to venmo.com/Coachsco, which works, but there is no order tracking or confirmation flow.

### P3: Parent Portal -- "Confirm Order Request" for Gear
The gear order form has a submit button but no visible backend integration. Parents may think they've placed an order when nothing is recorded.

### P3: Season Guide -- "Synthesizing Database Config..." Text
A debug/loading message "Synthesizing Database Config..." is visible at the top of the season guide. Should be hidden or removed.

### P3: Season Guide -- Roster Size Missing
"Roster Size" label appears but no value is rendered next to it.

---

## Summary by Severity

| Severity | Count | Description |
|----------|-------|-------------|
| P0 Critical | 6 | Broken content, contradictions, stuck loaders, stale mock data |
| P1 High | 12 | Text spacing bugs, wrong dates/years, truncated copy |
| P2 Medium | 10 | Dead links, wrong email, emoji violations, pricing confusion |
| P3 Low | 6 | Polish items, non-functional cart, debug text |
| **Total** | **34** | |

---

## Recommended Fix Order

1. Fix all P0 items first -- these are what parents see when they log in
2. Global find-replace for copyright 2025 to 2026
3. Fix all missing-space text bugs (single regex pass through HTML files)
4. Consolidate footer into a shared partial or JS include to fix inconsistency everywhere at once
5. Replace "info@godspeed.com" with actual contact email
6. Remove emojis from parent portal training section
7. Wire Venmo billing modal to use adjusted balance (already computed in billing-view.js)
8. Address dead links by either building the pages or removing the links
