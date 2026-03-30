# Godspeed Admin Portal

## Architecture

Single-page admin dashboard (`admin-os.html` + `admin-os.js`) powered by Supabase (PostgreSQL, Auth, Edge Functions, RLS). No build step -- vanilla JS loaded via Vite dev server in development, served statically via Vercel in production.

Authentication: email/password via Supabase Auth. Only users with `role = 'director'` and `approved = true` in the `profiles` table can access the dashboard.

## Panels

| Panel | Sidebar Label | Data Source |
|-------|--------------|-------------|
| Dashboard | Dashboard | `profiles`, `login_requests`, `parent_dues_enrollment` |
| Players & Parents | Players & Parents | `profiles`, RPC `get_roster_with_parents` |
| Login Requests | Login Requests | `login_requests` |
| Dues | Dues | `parent_dues_enrollment`, `dues_installments`, `dues_payments` |
| Fundraising | Fundraising | `fundraising_totals`, `parent_dues_enrollment` |
| Orders | Orders | Pro shop order tables |
| Messaging | Messaging | `broadcasts` |
| Data Entry | Data Entry | `training_sessions`, `training_attendance`, `games`, `player_game_stats` |
| Calendar | Calendar | `calendar_events`, `calendar_push_log` |
| Blog | Blog Posts | `blog_posts` |
| Memos | Coach Memos | `coach_memos` |

## Calendar

Events are stored in `calendar_events` with columns: `id`, `title`, `event_type`, `start_date`, `end_date`, `start_time`, `end_time`, `location`, `cost`, `notes`, `visibility`, `published_at`, `admin_checklist` (JSONB), `registration_url`, `grade_level`, `source_type`.

Multi-day events (where `end_date != start_date`) are expanded client-side to appear on every date in the range. List view deduplicates them.

Tournament events use `admin_checklist` JSONB to track a to-do list. The `register` checklist item determines the "NOT REG" indicator.

### Publish Flow

1. Admin clicks "Publish to Parents"
2. All events with `published_at IS NULL` and `visibility IN ('public', 'team_only')` are selected
3. `published_at` is set to `now()` on those events
4. Edge function `send-calendar-update` is invoked with the event IDs
5. The edge function sends branded emails via Resend to all active parents
6. A record is inserted into `calendar_push_log` for audit

### Bulk Tournament Import

"Paste Tournaments" accepts free-text with tournament names and date ranges. The parser handles cross-month ranges, ordinal suffixes, yearless dates, and slash-delimited ranges.

## Fundraising

Combines data from `fundraising_totals` (amount raised per athlete) and `parent_dues_enrollment` (dues owed/paid). Displays a stacked bar per player showing total owed, amount paid, and amount raised. When raised >= remaining balance, shows "COVERED".

## Edge Functions

| Function | Trigger | Purpose |
|----------|---------|---------|
| `send-payment-reminders` | Daily cron | Escalation ladder for overdue dues |
| `stripe-dues-webhook` | Stripe events | Payment event handler |
| `create-dues-checkout` | On demand | Creates Stripe checkout session |
| `send-document-notification` | On demand | Document-related emails |
| `document-reminder-cron` | Tue/Thu 8 AM | Unsigned document reminders |
| `send-calendar-update` | On demand | Calendar publish email notifications |

## Design Principles

Color is used only when it conveys meaning: status tags (paid/pending/overdue), error/success feedback, and the "NOT REG" indicator for unregistered tournaments. Metric cards, action buttons, navigation, and decorative elements use neutral tones.

State machines advance forward only. Audit logs (`document_events`, `dues_reminder_log`, `calendar_push_log`) are insert-only. Email is the messenger; the portal is the source of truth. 48-hour rate limit on parent notifications.

## File Map

```
admin-os.html    -- markup + CSS (single file)
admin-os.js      -- all panel logic, calendar, fundraising, data entry
supabase/
  functions/
    send-calendar-update/index.ts
    send-payment-reminders/index.ts
    send-document-notification/index.ts
    document-reminder-cron/index.ts
    create-dues-checkout/index.ts
    stripe-dues-webhook/index.ts
```
