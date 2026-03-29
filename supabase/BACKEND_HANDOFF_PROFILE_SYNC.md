# Backend Handoff: Real-Time Profile Sync
**Feature:** Admin edits to parent/player profile data propagate instantly to the parent portal via Supabase Realtime.
**Date:** 2026-03-28 | **Status:** Frontend complete — backend config required.

---

## What Was Built (Frontend)

### Admin Portal (admin-os.js)
- `viewPlayer(id)` modal is now **editable** — fields: Parent Name, Player Name, Grade, Phone.
- `savePlayerProfile()` calls `supabase.from('profiles').update(payload).eq('id', id)`.
  Updates local cache and shows toast confirming live update.

### Parent Portal (parent-portal.js)
- `updateDashboardProfile(email)` now fetches the profiles row on login, calls
  `applyProfileToUI()` and `initProfileRealtime()`.
- `applyProfileToUI(profile)` patches: sidebar name, banner, welcome message,
  settings form inputs, and any element with `data-profile-field` attribute.
- `initProfileRealtime(supabase, profileId)` opens a Supabase postgres_changes channel
  filtered to the logged-in user's profile row. On UPDATE fires `applyProfileToUI(payload.new)`
  in ~200ms. Channel is safely torn down on re-login.

---

## Required Backend Configuration

### 1. Enable Realtime on profiles table

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
```

Without this, the frontend subscribes but never receives push events.
Data still loads on refresh — just no live push.

### 2. RLS: Parent can read own profile (required for Realtime delivery)

```sql
CREATE POLICY "parent_read_own_profile" ON profiles FOR SELECT
USING (auth.uid() = id);
```

### 3. RLS: Director can UPDATE any profile

```sql
CREATE POLICY "director_update_profiles" ON profiles FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role = 'director' AND p.approved = true
  )
);
```

---

## Fields Written by Admin

| Column      | Type | Notes                        |
|-------------|------|------------------------------|
| full_name   | text | Parent's display name        |
| player_name | text | Child/athlete name           |
| grade       | text | e.g. "4th", "5th"           |
| phone       | text | Parent contact number        |

Email, role, and approved are NOT editable via this flow.

---

## Data Flow

Admin saves form
  → supabase.update('profiles')
      → Postgres fires UPDATE event
          → Supabase Realtime delivers to parent's channel
              → applyProfileToUI(payload.new) patches DOM live

---

## Adding More Fields Later

1. Add column to savePlayerProfile() payload in admin-os.js
2. Add assignment in applyProfileToUI() in parent-portal.js
3. Or add data-profile-field="column_name" to any HTML element for auto-binding

---

## QA Checklist

- [ ] Parent portal open and logged in
- [ ] Admin edits name/player name in Players and Parents panel → Save Changes
- [ ] Parent portal DOM updates within ~200ms (no page reload)
- [ ] "[Realtime] Profile updated by admin:" appears in parent portal devtools console
- [ ] Toast "Your profile was updated by your coach." shows in parent portal
- [ ] Supabase Dashboard → Realtime Inspector confirms the event fires
