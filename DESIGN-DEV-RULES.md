# Godspeed Basketball -- Design & Development Rules

Living document. These rules govern all design decisions, development patterns, and collaboration between Scott and Claude.

---

## Collaboration Rules

**Rule A: Pushback required.**
Claude gives better options and pushes back when a request would produce a weaker product. Lead with the stronger alternative and explain why in one line. Execute the better path unless Scott overrides.

**Rule B: Frontend and backend ship together.**
Every frontend feature must have backend logic and architecture. Every backend feature must have a frontend surface. No orphaned UI that doesn't talk to the database. No database work that's invisible to the user.

**Rule 1: If Claude can do it, Claude does it.**
No asking, no spec documents, no "should I proceed?" -- just execute. Default to doing the work, not describing the work.

**Rule 2: If Scott can do it faster, he will.**
Don't block on him. Keep moving on other work.

**Rule 3: SQL goes to Scott.**
He runs queries in Supabase SQL Editor. Provide copy-paste-ready SQL. Never ask Scott to install CLI tools or run migrations locally.

---

## Design Standards

**Design bar: iOS / Dive Club / Linear.**
Every screen, component, and interaction must meet this standard. No compromise. No "good enough for now."

**No emojis. Ever.**
No emoji characters in rendered HTML, labels, headings, pills, status indicators, toasts, or data displays. Use text labels, SVG icons, or CSS-based indicators.

**No em dashes in parent-facing content.**
Use double hyphens (--) in code and docs. Parent-facing communications use standard dashes or rewrite the sentence.

**Font: Helvetica Neue for parent-facing.**
Admin portal uses the system font stack (Inter/system-ui). Parent portal and parent communications use Helvetica Neue.

**No logo on parent-facing documents.**
Parent letters, emails, and exported docs do not include the Godspeed logo unless explicitly requested.

**Table actions: text-only links.**
Blue for constructive actions (add, edit, view). Red for destructive actions (remove, delete). No background, no border, no box-shadow. Opacity fade on hover. Never use btn-xs btn-primary for table row actions.

**Tags and badges: flat, borderless chips.**
Subtle tinted background, 6px radius, muted color palette. No heavy colored borders.

**Buttons: rounded-full pills for CTAs.**
Primary actions get pill-shaped buttons. Inline and table actions are text-only. Ghost buttons (transparent bg, border) for secondary actions.

**Schedule views: events-first.**
Show event cards grouped by month. No raw calendar grids for admin. Parent calendar is an iframe embed and is locked -- never modify it.

---

## Architecture Rules

**Backend is the source of truth.**
The portal reads from the database. Email is the messenger. No pixel tracking. No client-side state that the server doesn't know about.

**Atomic operations for financial actions.**
Payment recording and reversal use server-side RPCs (plpgsql functions), not multi-step client cascades. Single transaction, all-or-nothing.

**RLS: coach/director = full access, parent = own data only.**
Service role is reserved for edge functions. Admin UI authenticates as a real user with director/coach role, never service_role from the client.

**State machines advance forward only.**
Never downgrade a status (e.g., paid_in_full back to active) unless it's an explicit reversal operation through a dedicated function. No casual status overwrites.

**Immutable audit logs.**
Tables like document_events and dues_reminder_log are insert-only. Never update or delete audit rows.

**48-hour rate limit on parent notifications.**
No parent receives more than one notification per 48-hour window. Edge functions enforce this.

**Dual billing schema stays in sync.**
Admin tables (parent_dues_enrollment, dues_installments, dues_payments) and portal tables (payment_plans, payments) must both be updated on every payment action. If one updates, both update. The quick-pay cascade and reverse_payment RPC enforce this.

---

## UX Rules

**Admin portal: smart, helpful, fast, 1-2 steps for repetitive tasks.**
If a coach does something more than twice a week, it should take one click (or two max). Quick-pay bar, bulk actions, keyboard shortcuts.

**Intentional friction for destructive and financial actions.**
Confirmation panels (not browser confirm() dialogs) for: recording payments, deleting payments, removing roster members, sending bulk communications. Show the exact details being acted on.

**Confirmation panels, not browser dialogs.**
Use inline confirmation UI with the same design system (card, grid layout, colored action buttons). Never use window.confirm() or window.alert() for production features.

**Design for scale.**
Every feature should work for 12 athletes or 120. Pagination, batching, and lazy loading where data can grow. No hardcoded limits in UI rendering.

**Minimal friction by default.**
Don't add confirmation steps, extra clicks, or warnings unless the action is destructive, financial, or irreversible. Speed matters for daily admin work.

---

## Code Rules

**No spec documents for frontend work.**
Implement directly in the codebase. Write working HTML/CSS/JS, not .docx files describing what code should exist.

**Reference DESIGN-SYSTEM-COMPLETE.md before building any UI.**
Check spacing, typography, color, and component patterns before writing new components.

**Edge functions handle external integrations.**
Resend (email), Stripe (payments), and any future third-party calls go through Supabase Edge Functions, not client-side fetch to external APIs.

**SECURITY DEFINER for sensitive RPCs.**
Database functions that cross RLS boundaries (like reverse_payment) use SECURITY DEFINER with an explicit role check inside the function body. Grant EXECUTE to authenticated, not public.

**Cache-bust on deploy.**
Append ?v=YYYYMMDD[letter] to URLs when testing new deploys. Vercel caching can serve stale JS.

---

## Content Rules

**Brand tagline: BROTHERHOOD. HABITS. SUCCESS.**
Use in branded communications. All caps, periods between words.

**Venmo handle: @Coachsco.**
Interim payment method until Stripe goes live (requires EIN + business bank account).

**Events > 3 days are "season", not "tournament".**
Terminology matters for parent communication and scheduling context.

---

*Last updated: 2026-04-03*
