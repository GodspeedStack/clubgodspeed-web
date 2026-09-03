# Onboarding a new coach. Click by click.

Replaces COACH_WASH_ONBOARDING.md (Brandon Wash did not join; that file is stale).

**Who:** Steven, 5th and 4th grade coach (teams: Godspeed 5th Grade Black, Godspeed 5th Grade White, Godspeed 4th Grade).
**Email:** bigstevejr@yahoo.com (no account exists yet, checked 2026-09-03). Full name is set to `Steven` for now; he types his full name in the setup wizard and it overwrites this.
**Time:** about 4 minutes of your hands. Steven does the rest himself in the portal (about 5 minutes).

Do Part 1, then Part 2, then send Part 3. In that order.

---

## Part 0. One-time settings (skip if already done)

1. Supabase Dashboard, project `nnqokhqennuxalamnvps`, **Authentication**, **URL Configuration**. Make sure Redirect URLs includes `https://www.clubgodspeed.com/coach-portal.html`. Save.
2. **Authentication**, **Emails**, **Invite user**. Paste the Version B text from `emails/DRAFT_coach_welcome_2026-09-03.md` and make the button link `{{ .SiteURL }}/coach-portal.html` so the invite lands in the setup wizard. Save.
3. The coach portal branch (`fix/document-email-one-tap-signin`) must be merged, or the invite lands on the plain Staff Login with no wizard.

## Part 1. Create the account (Supabase, 1 minute)

You never type or know his password. The invite lets him set his own.

1. **Authentication**, **Users**.
2. Top right, **Add user**, then **Send invitation**.
3. Type `bigstevejr@yahoo.com` and confirm.

He gets the invite email. Do Part 2 right away, before he clicks it, so he lands as a coach, not a parent.

## Part 2. Make him a coach (SQL Editor, 1 minute)

The signup trigger files every new account as a parent. This flips him to coach and approves him. Running it twice is harmless.

```sql
-- 1. Confirm he exists. Expect exactly one row.
select id, email, email_confirmed_at, last_sign_in_at
  from auth.users
 where lower(email) = lower('bigstevejr@yahoo.com');

-- 2. Backstop the profile row, then make him a coach.
insert into public.profiles (id, email, full_name, role, approved)
select u.id, u.email, 'Steven', 'coach'::public.app_role, true
  from auth.users u
 where lower(u.email) = lower('bigstevejr@yahoo.com')
on conflict (id) do nothing;

update public.profiles
   set role = 'coach'::public.app_role,
       approved = true,
       full_name = coalesce(nullif(full_name, ''), 'Steven')
 where lower(email) = lower('bigstevejr@yahoo.com');

-- 3. Proof. Want: role = coach, approved = true.
select email, full_name, role, approved from public.profiles where lower(email) = lower('bigstevejr@yahoo.com');
```

If step 1 returns no rows, Part 1 did not finish. If `role` still says `parent`, check the email for a typo.

## Part 3. Send the personal note (your email, 1 minute)

Send Version A from `emails/DRAFT_coach_welcome_2026-09-03.md` with `{coach_first}` = Steven, `{team_name}` = 5th and 4th grade, and the first practice date.

## What happens on his side

1. He taps **Accept the invite**. It signs him in and opens the setup wizard.
2. Password, then profile (name, phone, headshot, bio), then four documents to read and sign, then teams (he picks 5th Black, 5th White, 4th), then done.
3. He lands in the Coach Portal with the Welcome Kit in the sidebar.

## How you know it worked

Coach Portal, left sidebar, **Staff**, **Staff Onboarding**. Steven's row shows a green check in every column and 4/4 documents. If a column is still "Open" after two days, text him; the invite link dies after 24 hours and "Email me a sign-in link" on the Staff Login gets him a fresh one.

## If it fails

| What he sees | Meaning | Fix |
|---|---|---|
| "This account is not set up as a coach" | Still filed as a parent | Redo Part 2 |
| "Your coach account is still waiting to be approved" | `approved` is false | Redo Part 2 |
| "That link has expired or was already used" | Invite older than 24 hours or clicked twice | Authentication, Users, his row, **Send magic link**; or he uses "Email me a sign-in link" |
| Wizard never appears, plain dashboard opens | Branch not merged yet | Merge the branch; he can finish setup on his next sign-in |
