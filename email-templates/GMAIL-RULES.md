# Godspeed email templates

Three branded templates for mail we send to families and coaches, plus the
Supabase auth templates that ship with the portal.

| File | Use |
|---|---|
| `standard.html` | Everyday sends. Gray page, white card, blue hero. |
| `announcement.html` | Big news only. Black page. Season launch or a major deadline. |
| `coach-welcome.html` | Coach invite. Black header bar. |
| `confirm-signup.html`, `magic-link.html`, `reset-password.html` | Supabase auth mail. |

## The Gmail rule (do not "simplify" this back to divs)

Gmail strips CSS backgrounds off plain `<div>` elements. White text sitting on
a div with `style="background:#1A3A8F"` therefore renders white on white, and
the whole block disappears. This shipped to a live parent send on 2026-09-06.

Every colored block must be a `<table>` / `<td>` carrying **both** a `bgcolor`
attribute **and** a `style` background-color:

```html
<!-- correct -->
<td bgcolor="#1A3A8F" style="background-color:#1A3A8F;">

<!-- forbidden -->
<div style="background:#1A3A8F">
```

Use spacer divs for vertical rhythm rather than margins, which collapse
unpredictably across mail clients:

```html
<div style="height:16px;font-size:16px;line-height:16px;">&nbsp;</div>
```

## Brand tokens

| Token | Value |
|---|---|
| Blue (hero, highlight, buttons) | `#1A3A8F` |
| Orange (accent rule, labels) | `#FF5722` |
| Black | `#0A0A0A` |
| Page gray | `#f5f5f7` |
| Body ink | `#3a3a3c` |
| Heading | `#1d1d1f` |
| Muted | `#6e6e73` |
| Eyebrow on blue | `#c3cfea` |
| Sub-text on blue | `#dbe3f5` |

Font stack is `'Helvetica Neue', Helvetica, Arial, sans-serif`. No emojis and
no em dashes. The tagline is **BROTHERHOOD. HABITS. SUCCESS.** and never uses
the word "Winning". Signature is always Coach Scott / Godspeed Basketball.
Links point at `https://clubgodspeed.com/...` directly, never a redirect
wrapper.

## Before sending

Send yourself a test and open it in the Gmail web client, not only on iOS.
iOS Mail honors CSS backgrounds and will hide this class of bug.
