# clubgodspeed-web

Godspeed Basketball site. Vanilla JS/HTML + Supabase (ref `nnqokhqennuxalamnvps`) + Resend + Stripe (pending EIN), deployed via Vercel to clubgodspeed.com.

## Required reading before working
- `DESIGN-DEV-RULES.md` — collaboration, design, architecture, UX, and code rules. Non-negotiable.
- `GODSPEED_RAISE_DECISIONS.md` — fundraising platform contract (schema, agent, launch checklist).
- `GODSPEED_ABO.md` — autonomous business operator prompt for Godspeed (zero HITL except gates).

## Thread health (Scott's policy v2.0)
See `COWORK_THREAD_HEALTH_POLICY.md`. One task per thread, named by task, max 3 deep sessions. Externalize decisions into `*_DECISIONS.md` contracts, deliverables onto disk, reference files by path instead of pasting. Rotate on task completion — the transcript is disposable, these files are the record. Agent behavioral rules in the policy are binding.

## Database migrations — never run `supabase db push` (verified 2026-10-15)

`supabase/migrations/` is a **record**, not a CLI pipeline. It holds 140 files; only 32
use the CLI's `<14-digit timestamp>_name.sql` format, and **zero** of those 32 appear in
the remote migration history. The remote history's 70 rows were written by the Supabase
MCP / SQL editor and have no matching files here.

So `supabase link` followed by `supabase db push` would attempt to apply all 32 old
timestamped migrations — March through October, including auth-trigger rewrites, signup
trigger replacements and RLS hardening — against live production. Do not run it.

**Apply a migration this way instead:**

```
cd ~/clubgodspeed-web-merge
pbcopy < supabase/migrations/<file>.sql
```

Then paste and Run in the SQL editor:
https://supabase.com/dashboard/project/nnqokhqennuxalamnvps/sql/new

Write every migration to be re-runnable (`create or replace`, `add column if not exists`,
`create policy` guarded by a drop or an existence check), because the history row and the
file are tracked separately here and a migration may get run twice.
