# Godspeed Document Management & Compliance System

## Architecture Contract

### Files Delivered

| File | Purpose |
|------|---------|
| `godspeed_document_management_schema.sql` | Database migration — 5 tables, 2 views, 3 RPC functions, RLS policies |
| `supabase_edge_function_send_document_notification.ts` | On-demand email sender (admin-triggered or bulk) |
| `supabase_edge_function_document_reminder_cron.ts` | Automated "Bad Cop" — Tues/Thurs 8 AM escalation engine |
| `admin-documents.html` | Admin dashboard — compliance matrix, impersonation, bulk actions |
| `document-tracker.js` | Parent portal client module — view/download/sign event capture |

---

### Database Tables

```
documents                    — Master document registry (admin-managed)
document_versions            — Immutable content snapshots (SHA-256 hashed)
user_agreements              — Parent ↔ Document lifecycle ledger
document_events              — Immutable audit log (NEVER update, only insert)
document_notification_log    — Every email sent (mirrors dues_reminder_log)
```

### Views (Admin "God View")

```
document_compliance_summary  — Per-document: assigned, signed, pending, rate%
parent_compliance_status     — Per-parent: roster_at_risk flag, days_outstanding
```

### State Machine: `user_agreements.status`

```
pending → notified → viewed → downloaded → signed
                ↗                    ↗         ↗
         (can skip intermediate states — always forward, never backward)
```

### Audit Trail (Legally Binding Signatures)

Every signature captures and permanently locks:
- `parent_user_id` (who signed)
- `signed_at` (timestamp to the second)
- `version_id` (exact document content they signed — immutable)
- `signature_ip` (IP address at signing)
- `signature_user_agent` (browser fingerprint)
- `signature_value` (typed name or checkbox confirmation)

All recorded in both `user_agreements` (queryable) and `document_events` (immutable log).

---

### Escalation Ladder (Cron)

| Days Outstanding | Notification Type | Tone |
|-----------------|-------------------|------|
| 0–2 | `initial` | Friendly: "new document ready" |
| 3–6 | `reminder` | Nudge: "still needs your signature" |
| 7–13 | `escalation` | Firm: "playing time at risk" |
| 14–20 | `final_warning` | Urgent: "roster eligibility at risk" |
| 21+ | Manual admin action | Stop emailing, flag in dashboard |

Rate limit: Max 1 email per parent per 48 hours. Max sends per type enforced.

---

### Deployment Steps

#### 1. Run the SQL migration
```sql
-- In Supabase SQL Editor (role: postgres)
-- Run: godspeed_document_management_schema.sql
```

#### 2. Deploy edge functions
```bash
supabase functions deploy send-document-notification
supabase functions deploy document-reminder-cron
```

#### 3. Set secrets
```bash
supabase secrets set RESEND_API_KEY=re_xxxxx
# SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-available
```

#### 4. Schedule the cron
```sql
-- In Supabase SQL Editor
SELECT cron.schedule(
  'doc-reminders-tue',
  '0 8 * * 2',
  $$SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/document-reminder-cron',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  )$$
);

SELECT cron.schedule(
  'doc-reminders-thu',
  '0 8 * * 4',
  $$SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/document-reminder-cron',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  )$$
);
```

#### 5. Wire the admin dashboard
- Add Supabase client credentials to `admin-documents.html`
- Link from your admin nav

#### 6. Integrate tracking into parent portal (ONE line)

In `parent-portal.html`, add this script tag AFTER `auth-supabase.js` (line 1373)
and BEFORE `parent-portal.js` (line 1380):

```diff
  <script src="auth-supabase.js" defer></script>
  <script src="analytics.js" defer></script>
  <script src="security.js" defer></script>
+ <script src="document-tracker-integration.js" defer></script>
  <script type="module" src="src/lib/exposeServices.js" defer></script>
  <script src="portal-data.js" defer></script>
```

The integration script auto-detects the Supabase client, monkey-patches
`openDocModal` and `markDocumentSigned`, and handles email deep links.
No other files need to change.

Files delivered:
- `document-tracker-integration.js` -- drop-in script (adds tracking to existing portal)
- `document-tracker.js` -- standalone ES module (for future portal rewrites)

---

### Why Email Open Tracking is Not Used

Apple Mail Privacy Protection and enterprise spam filters pre-fetch tracking pixels. This creates false positives (shows "opened" when parent never saw it) and false negatives. The portal click-through is the only reliable signal. Every email CTA links to the portal with a tracking parameter (`aid=UUID`), and the `link_clicked` event is logged when the parent authenticates.

---

### Security Notes

- All tables have RLS enabled
- Parents can only see/modify their own agreements
- Signatures are one-shot (cannot re-sign — function returns error)
- Document versions are immutable once published
- Content hash prevents post-signature tampering claims
- Service role used only by edge functions (never client-side)
- Admin impersonation is read-only (loads parent data, does not modify)
