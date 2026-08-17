# Onboarding Coach Wash — click-by-click

**Goal:** Brandon Wash (`brandonwash14@gmail.com`) can log into the coach portal by Sept 1.

**Time:** about 10 minutes.

Do Part 1 and Part 2 in order. Part 3 is optional and can wait.

---

## Part 1 — Create his account (Supabase)

You never need to know or type his password. The invite lets him pick his own.

1. Go to **https://supabase.com/dashboard**
2. Click the project **`nnqokhqennuxalamnvps`** (the Godspeed one).
3. In the left sidebar click **Authentication**.
4. Under it, click **Users**.
5. Top right, click the green **Add user** button. A small menu drops down.
6. Choose **Send invitation**.
7. Type `brandonwash14@gmail.com` and confirm.

He gets an email with a link. He clicks it, picks his own password, and he's set.

> **If you'd rather test it yourself first**, pick **Create new user** instead of
> Send invitation. Then you type an email and a password you choose, and you must
> turn **Auto Confirm User** ON. Use a throwaway address like
> `testcoach@clubgodspeed.com` for this — not Brandon's — so his password stays
> his. Delete the throwaway when you're done.

### Why the invite matters

If you create the user without confirming the email, Supabase refuses the login
until the link is clicked. The invite handles that for you.

---

## Part 2 — Make him a coach (SQL)

**This step is not optional.** When you add a user through the dashboard, the
signup trigger looks for a role, finds none, and files him as a **parent**.
A parent gets turned away at the coach portal door. This fixes that.

1. Left sidebar → click **SQL Editor**.
2. Click **New query**.
3. Paste the block below and click **Run** (bottom right).

```sql
-- Check he exists first. Expect exactly one row.
SELECT id, email, email_confirmed_at
  FROM auth.users
 WHERE lower(email) = 'brandonwash14@gmail.com';
```

**Read the result before going on:**

- **No rows?** Part 1 didn't finish. Go back and redo it.
- **`email_confirmed_at` is empty?** He hasn't clicked the invite link yet.
  He can still be set up now, but he can't log in until he clicks it.
- **One row with a date?** Good. Continue.

4. Clear the box, paste this, click **Run**:

```sql
-- Backstop: build a profile row if the signup trigger didn't.
INSERT INTO public.profiles (id, email, full_name, role, approved)
SELECT u.id, u.email, 'Brandon Wash', 'coach'::public.app_role, true
  FROM auth.users u
 WHERE lower(u.email) = 'brandonwash14@gmail.com'
ON CONFLICT (id) DO NOTHING;

-- Make him a coach and approve him.
UPDATE public.profiles
   SET role      = 'coach'::public.app_role,
       approved  = true,
       full_name = COALESCE(NULLIF(full_name, ''), 'Brandon Wash')
 WHERE lower(email) = 'brandonwash14@gmail.com';
```

5. Clear the box, paste this, click **Run** to confirm it worked:

```sql
SELECT email, full_name, role, approved
  FROM public.profiles
 WHERE lower(email) = 'brandonwash14@gmail.com';
```

**You want to see exactly this:** `role` = `coach`, `approved` = `true`.

If `role` still says `parent`, the UPDATE didn't match — check the email for typos.

This is the same content as
[`supabase/migrations/v14_01_add_coach_wash.sql`](supabase/migrations/v14_01_add_coach_wash.sql).
Running it twice is harmless.

---

## Part 3 — Optional: let me check the preview

Only needed so I can verify the Supabase connection on the preview build. Skip it
if you're short on time; it doesn't block Coach Wash.

1. Go to **https://vercel.com** and open the **clubgodspeed-web** project.
2. Click the **Settings** tab (top row).
3. In the left menu click **Deployment Protection**.
4. Find **Vercel Authentication** and switch it to **Disabled**.
5. Click **Save**.

Tell me when it's off and I'll run the checks. **Turn it back on afterward** —
it's what keeps preview builds off the open internet.

---

## Part 4 — The actual test

Once Parts 1 and 2 are done, this is the whole test. Brandon should do it on
**his own laptop** — the bug I fixed this session only showed up on a browser
that had never logged in before, so testing from your machine could hide it.

Preview URL:
**https://clubgodspeed-96gsm21he-quntum24.vercel.app/coach-portal.html**

(If Part 3 is skipped, this only opens for someone logged into Vercel. In that
case wait until the PR is merged and test on the live site instead.)

1. Open the page. You should see **Staff Login** with **Email address** and
   **Password** boxes. If you instead see a single "Enter Access Code" box,
   you're on the old version — the PR hasn't been merged.
2. Enter his email and password. **Expected: the dashboard opens.**

### If it fails, the message tells you which part broke

| What it says | What it means | Fix |
|---|---|---|
| "This account is not set up as a coach" | Still filed as a parent | Redo Part 2 |
| "Your coach account is still waiting to be approved" | `approved` is false | Redo Part 2 |
| "That email and password did not match" | Wrong password, or no account | Redo Part 1 |
| "Email not confirmed" | Invite link never clicked | Have him click it |
| "We couldn't load your staff profile" | Account exists, profile row missing | Redo Part 2 |

Send me the exact wording if it fails and I'll take it from there.

---

## Still open (not blocking his login)

- **His bio on the About page.** Needs a headshot and 2–3 sentences. The section
  is at [`about.html:103`](about.html:103).
- **Parent-facing text.** [`welcome.html:738`](welcome.html:738) and the email
  templates still say "text Coach Scott or Coach Gene." Decide whether Brandon
  goes on that list.
- **Every coach sees every team.** No per-coach filter
  ([`coach-portal.js:289`](coach-portal.js:289)). He'll see all rosters and
  grades on day one. A decision, not a bug.
- **The shared access code still works.** Once True and Gene have their own
  accounts, delete `LEGACY_ACCESS_CODES`, `toggleLegacyLogin()`, and
  `#coach-legacy-fields`. Until then a shared password sits in the site's code.
