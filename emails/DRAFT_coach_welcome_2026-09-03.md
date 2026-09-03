# DRAFT: Coach welcome email

Status: DRAFT for Scott. Sent by Scott from his own account when he invites a
coach (Tier 0: outbound send). Two versions below; the second is what the
Supabase invite email should say once the invite template is updated.

Fill in: {coach_first}, {team_name}, {first_practice_date}.

---

## Version A: Scott's personal note (send right after the Supabase invite)

**Subject:** Welcome to the Godspeed staff, {coach_first}

Hey {coach_first},

Glad to have you with us. You are coaching {team_name}. First practice is {first_practice_date}.

Two things to do today, about five minutes total:

1. Check your inbox for an email from Godspeed Basketball with a link that says "Accept the invite". Tap it. It signs you in and walks you through setup: a password, a short bio and photo, four coach documents to read and sign, and your team.
2. When you land in the portal, open the Welcome Kit in the left sidebar. It is a one page guide to your first two weeks: schedule, gym rules, how grading works, and who to text for what.

If the link does not work, reply to this email and I will send a fresh one. Links expire after 24 hours.

Brotherhood. Habits. Success.

Coach Scott
720-693-3266

---

## Version B: Supabase "Invite user" email template

Where: Supabase Dashboard, Authentication, Emails, Invite user.
Confirmation URL must point at the coach portal so the setup wizard opens:
`{{ .SiteURL }}/coach-portal.html` as the redirect (set in the template link).

**Subject:** You are invited to coach with Godspeed Basketball

Hey Coach,

You have been invited to the Godspeed Basketball staff. Tap the button to accept. It signs you in and takes about five minutes to finish setup.

[ ACCEPT THE INVITE ]  ->  {{ .ConfirmationURL }}

This link works one time and expires in 24 hours. If it has expired, reply to Coach Scott for a fresh one.

Godspeed Basketball. Brotherhood. Habits. Success.

---

## Notes

- The wizard detects an invite link and starts on the Set Password step, so the coach never needs a password from you.
- After the coach finishes, they show as Done in Coach Portal, Staff, Staff Onboarding (director view).
- Reminder cadence if a coach stalls: one text after 3 days, one email after 7 days. Both are yours to send.
