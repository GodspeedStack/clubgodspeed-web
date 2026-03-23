# Club Godspeed - Supabase Schema

## File Order

Run migrations in order against your Supabase project.

- `00_extensions.sql` - UUID / pgcrypto extensions
- `01_profiles.sql` - auth-linked user profiles, is_director() helper
- `02_login_requests.sql` - pending access queue + approve/deny RPCs
- `03_payments.sql` - season fees, payment ledger, payment_summary view
- `04_content.sql` - blog_posts, memos, memo_acknowledgments
- `05_comms.sql` - campaigns, campaign_events, campaign_stats view
- `06_seed.sql` - dev-only seed comments (no-op until uncommented)

## Deployment

### Option A - Supabase CLI (recommended)
```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

### Option B - SQL Editor in Dashboard
Paste each file in order into the Supabase SQL Editor and run.

---

## First Director Setup

After deploying schema, create your account via Supabase Auth
(Dashboard -> Authentication -> Users -> Invite user), then run:

```sql
update public.profiles
set role = 'director', approved = true, full_name = 'Scott G.'
where email = 'scott@clubgodspeed.com';
```

This is a one-time bootstrap. All subsequent approvals flow
through the admin panel.

---

## RLS Summary

| Table | Director | Coach (approved) | Parent (approved) | Anon |
|---|---|---|---|---|
| **profiles** | CRUD | own row R/U | own row R/U | - |
| **login_requests** | CRUD | own row R | own row R | - |
| **season_fees** | CRUD | - | own row R | - |
| **payments** | CRUD | - | own row R | - |
| **blog_posts** | CRUD | - | published R | published R |
| **memos** | CRUD | addressed R | - | - |
| **memo_acknowledgments** | R | own insert + R | - | - |
| **campaigns** | CRUD | - | - | - |
| **campaign_events** | R | - | - | - |

- *`campaign_events` inserts use `service_role` key via Edge Function webhook only*
- *`blog_posts` published rows are readable by anon (site CMS integration)*

---

## Key RPCs (callable from admin panel)

```typescript
// Approve a login request (atomically updates both tables)
await supabase.rpc('approve_login_request', { request_id: id })

// Deny with optional reason
await supabase.rpc('deny_login_request', { request_id: id, reason: 'Duplicate account' })
```

---

## Webhook Setup (Comms tracking)

Set your Resend webhook URL to a Supabase Edge Function:
`https://<project>.supabase.co/functions/v1/comms-webhook`

The edge function uses the `service_role` key to insert into
`campaign_events` - bypasses RLS intentionally since webhook
requests are server-to-server and cannot carry a user JWT.

---

## Type Generation

After schema is deployed, regenerate types:

```bash
npx supabase gen types typescript \
  --project-id <your-project-ref> \
  > supabase/types/database.ts
```
