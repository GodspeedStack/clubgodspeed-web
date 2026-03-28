# Frontend Development Spec: Admin Portal Features (v3.01)

**Date:** 2026-03-28
**Backend Migration:** `v3_01_admin_features.sql` (deployed)
**Edge Functions:** `send-broadcast/index.ts`, `send-welcome-email/index.ts`
**Scope:** Admin OS (`admin-os.html` / `admin-os.js`) + Coach Portal (`coach-portal.html` / `coach-portal.js`)

---

## 1. Separate Dues from Orders

### Current State
The "Orders & Dues" panel (`panel-dues`) in `admin-os.js` loads from `payment_summary` view and mixes everything together. The sidebar label is `"Orders & Dues"`.

### Target State
Split into two distinct panels with independent data sources.

### Panel A: Season Dues

**Sidebar Label:** `Dues`
**Panel ID:** `panel-dues`
**Data Sources:**
- `season_dues_config` -- active season configs
- `parent_dues_enrollment` -- who is enrolled
- `dues_installments` -- individual installment rows (column is `amount`, NOT `amount_due`)
- `dues_payments` -- payment records
- `payment_summary` view (existing) -- rollup per parent

**UI Sections:**

1. **Summary Cards (top row)**
   - Total Enrolled (count of active enrollments)
   - Total Collected (sum of `dues_payments.amount` where `status = 'completed'`)
   - Outstanding Balance (sum of `dues_installments.amount` where `status IN ('pending','overdue')`)
   - Overdue Count (count of installments where `status = 'overdue'`)

2. **Installment Table**
   - Columns: Parent Name, Player Name, Installment #, Amount, Due Date, Status, Paid Date
   - Sortable by Due Date (default: ascending, nearest due first)
   - Filter chips: All | Pending | Overdue | Paid
   - Row actions: Mark Paid (manual override), Send Reminder (invokes `send-email` edge function with type `due_today`)
   - Join path for parent name: `dues_installments` -> `parent_dues_enrollment` (enrollment_id) -> `profiles` (user_id, select full_name)
   - Join path for player name: `parent_dues_enrollment` -> `athletes` (via `parent_accounts`)

3. **Season Config Section (collapsible)**
   - Shows active season name, total amount, installment count, start/end dates
   - "Edit Season" button (future -- not in v3.01 scope)

**Queries:**
```javascript
// Summary
const { data: installments } = await supabase
  .from('dues_installments')
  .select(`
    id, amount, due_date, status, paid_at,
    enrollment:parent_dues_enrollment!enrollment_id (
      id,
      user:profiles!user_id ( full_name, email )
    )
  `)
  .order('due_date', { ascending: true });
```

### Panel B: Pro Shop Orders

**Sidebar Label:** `Orders`
**Panel ID:** `panel-orders`
**Data Sources:**
- `orders` table (from v3.01 migration)
- `order_items` table
- `products`, `product_variants` (existing 002_ecommerce_schema)

**UI Sections:**

1. **Summary Cards (top row)**
   - Total Orders (count)
   - Revenue (sum of `total_amount` where `payment_status = 'paid'`)
   - Pending Fulfillment (count where `fulfillment_status = 'unfulfilled'` and `payment_status = 'paid'`)
   - Refunded (sum of `total_amount` where `payment_status = 'refunded'`)

2. **Orders Table**
   - Columns: Order #, Customer, Total, Payment Status, Fulfillment Status, Date
   - Sortable by Date (default: descending)
   - Filter chips: All | Unfulfilled | Shipped | Delivered
   - Row click: expand to show `order_items` (product title, variant, qty, price at purchase)
   - Row actions:
     - Update Fulfillment (dropdown: processing -> shipped -> delivered)
     - Add Tracking # (text input, updates `tracking_number`)

**Queries:**
```javascript
const { data: orders } = await supabase
  .from('orders')
  .select('*, order_items(*)')
  .order('created_at', { ascending: false })
  .limit(50);
```

### Sidebar Update
Replace the single `"Orders & Dues"` entry with two entries:
```javascript
const PANEL_TITLES = {
  dashboard: 'Dashboard',
  players: 'Players & Parents',
  requests: 'Login Requests',
  dues: 'Season Dues',       // was "Orders & Dues"
  orders: 'Pro Shop Orders',  // NEW
  comms: 'Messaging',         // renamed
  blog: 'Blog Posts',
  memos: 'Coach Memos',
};
```

### Admin Financial Summary View
The migration created `admin_financial_summary` which returns a single row:
```
dues_collected, dues_outstanding, dues_overdue_count,
order_revenue, order_count, orders_pending_fulfillment
```
Use this for the Dashboard panel top-level financial metrics instead of computing client-side.

---

## 2. Messaging (Broadcast to Parents)

### Current State
The "Email / SMS" panel (`panel-comms`) exists but has limited functionality.

### Target State
Full broadcast messaging with audience targeting, backed by `broadcast_messages` and `broadcast_recipients` tables.

### Panel: Messaging

**Panel ID:** `panel-comms`
**Data Sources:**
- `broadcast_messages` -- messages created by admin
- `broadcast_recipients` -- per-recipient delivery status
- `profiles` -- for recipient selection
- `parent_accounts` + `athletes` + `team_rosters` -- for team-scoped targeting

**UI Sections:**

1. **Compose Form**
   - Subject (text input, required, max 200 chars)
   - Body (textarea, required, supports plain text -- newlines become `<p>` tags in email)
   - Audience selector (radio group):
     - `all_parents` -- all approved parents
     - `team:<team_id>` -- parents of athletes on a specific team (dropdown populates from `teams` table)
   - Channel (radio): `email` | `internal` | `both` (default: `both`)
   - "Send Broadcast" button
   - Confirmation modal before send: "Send to X parents?"

2. **Sent Messages List**
   - Columns: Subject, Audience, Sent At, Recipients, Delivered, Read
   - Click to expand: shows per-recipient delivery status
   - Sort: newest first

**Send Flow (client-side):**
```javascript
// 1. Call the RPC to create message + populate recipients
const { data: msg, error } = await supabase.rpc('send_broadcast', {
  p_sender_id: session.user.id,
  p_subject: subject,
  p_body: body,
  p_channel: channel,
  p_audience: audience  // 'all_parents' or 'team:<uuid>'
});

// 2. Invoke edge function to process email delivery
await supabase.functions.invoke('send-broadcast', {
  body: { message_id: msg }
});
```

**Key RPC `send_broadcast` returns:** the new `broadcast_messages.id` (uuid).

The edge function processes recipients in batches of 50. If there are more than 50 recipients, the frontend should poll or re-invoke until `still_pending = 0`.

**Polling pattern:**
```javascript
async function sendAndPoll(messageId) {
  let pending = true;
  while (pending) {
    const { data } = await supabase.functions.invoke('send-broadcast', {
      body: { message_id: messageId }
    });
    pending = (data?.still_pending || 0) > 0;
    if (pending) await new Promise(r => setTimeout(r, 2000));
  }
}
```

3. **Message Detail / Analytics**
   - When a sent message is clicked, show:
     - Subject, body, sent_at, audience
     - Recipient table: Name, Email, Status (pending/sent/delivered/read), Timestamps
     - Summary: X sent, Y delivered, Z read

---

## 3. Training / Game Data Entry

### Current State
No data entry UI exists. Data must be entered via SQL.

### Target State
Admin and Coach portals both get a Data Entry section for logging training sessions and games. Both call the same SECURITY DEFINER RPCs which handle inserts + auto-calendar-event creation.

### Panel: Data Entry (Admin OS)

**Panel ID:** `panel-data-entry`
**Sidebar Label:** `Data Entry`

Add to sidebar and PANEL_TITLES:
```javascript
PANEL_TITLES.dataEntry = 'Data Entry';
```

**Sub-tabs within panel:** Training | Games

#### Sub-tab: Log Training Session

**Form Fields:**
| Field | Type | Source | Required |
|-------|------|--------|----------|
| Team | Select | `teams` table | Yes |
| Session Type | Select | practice, shooting, conditioning, scrimmage, film | Yes |
| Date | Date picker | default: today | Yes |
| Start Time | Time picker | | Yes |
| End Time | Time picker | | Yes |
| Location | Text | | No |
| Notes | Textarea | | No |
| Attendance | Checkbox list | Athletes from selected team via `team_rosters` | Yes (at least 1) |

**On Team Select:** Fetch roster:
```javascript
const { data: roster } = await supabase
  .from('team_rosters')
  .select('athlete_id, athletes!inner(id, first_name, last_name)')
  .eq('team_id', selectedTeamId)
  .eq('status', 'active');
```
Render checkboxes with "Select All" toggle.

**On Submit:** Call RPC:
```javascript
const { data, error } = await supabase.rpc('log_training_session', {
  p_team_id: teamId,
  p_session_type: sessionType,
  p_session_date: date,
  p_start_time: startTime,
  p_end_time: endTime,
  p_location: location,
  p_notes: notes,
  p_coach_id: session.user.id,
  p_attendance: JSON.stringify(
    checkedAthletes.map(id => ({ athlete_id: id, status: 'present' }))
    .concat(uncheckedAthletes.map(id => ({ athlete_id: id, status: 'absent' })))
  )
});
```

**Success feedback:** Toast notification "Training session logged. Calendar event created."

#### Sub-tab: Log Game

**Form Fields:**
| Field | Type | Source | Required |
|-------|------|--------|----------|
| Team | Select | `teams` table | Yes |
| Opponent | Text | | Yes |
| Game Date | Date picker | default: today | Yes |
| Game Time | Time picker | | No |
| Location | Text | | No |
| Team Score | Number | | No (can add later) |
| Opponent Score | Number | | No |
| Game Type | Select | league, tournament, scrimmage, showcase | Yes |
| Season | Text | e.g. "Spring 2026" | No |
| Player Stats | Dynamic form (see below) | | No |

**Player Stats Sub-form:**
When team is selected, render a stats grid (one row per athlete):

| Player | MIN | PTS | FGM | FGA | 3PM | 3PA | FTM | FTA | OREB | DREB | AST | STL | BLK | TO | PF | Notes |
|--------|-----|-----|-----|-----|-----|-----|-----|-----|------|------|-----|-----|-----|----|----|-------|

All numeric fields default to 0. The grid should be horizontally scrollable on smaller screens. Include a "Clear All" button.

**On Submit:** Call RPC:
```javascript
const { data, error } = await supabase.rpc('log_game', {
  p_team_id: teamId,
  p_opponent_name: opponent,
  p_game_date: gameDate,
  p_game_time: gameTime,
  p_location: location,
  p_team_score: teamScore || null,
  p_opponent_score: opponentScore || null,
  p_game_type: gameType,
  p_season: season,
  p_coach_id: session.user.id,
  p_player_stats: JSON.stringify(playerStats)
  // playerStats = [{ athlete_id, minutes_played, points, fgm, fga, ... }]
});
```

**Success feedback:** Toast notification "Game logged. Calendar event created."

### Coach Portal: Data Entry

Mirror the same two forms in `coach-portal.html` under a new "Log Data" tab. The coach portal uses an iOS-inspired card-based layout, so wrap each form in a `.ios-card` container. Same RPCs, same field set. The only difference: the `p_coach_id` comes from the coach's session.

**Coach portal integration:**
```javascript
// In coach-portal.js, add to the tab system:
// Tab: "Log Data" with sub-sections for Training and Games
// Reuse the same RPC call patterns as admin
```

---

## 4. Calendar Management

### Current State
No calendar data management. Events are created automatically by the `log_training_session` and `log_game` RPCs (they insert into `calendar_events`).

### Target State
Admin can view, create, edit, and delete calendar events. Auto-created events from training/games appear alongside manually created events.

### Panel: Calendar (Admin OS)

**Panel ID:** `panel-calendar`
**Sidebar Label:** `Calendar`
**Data Source:** `calendar_events` table

**UI Sections:**

1. **Month View (default)**
   - Standard calendar grid
   - Events rendered as colored chips on their date
   - Color coding by `event_type`: practice=blue, game=red, meeting=green, deadline=orange, other=gray
   - Click date: shows event list for that day in a side drawer
   - Click event chip: opens event detail/edit modal

2. **List View (toggle)**
   - Chronological list of upcoming events
   - Columns: Date, Time, Title, Type, Location, Team
   - Filter by: event_type, team_id

3. **Create Event Modal**
   - Title (text, required)
   - Event Type (select: practice, game, meeting, deadline, other)
   - Date (date picker, required)
   - Start Time / End Time (time pickers)
   - Location (text)
   - Description (textarea)
   - Team (select, optional -- from `teams` table)
   - All Day toggle (boolean)
   - Recurring (future scope -- not v3.01)

4. **Edit Event Modal**
   - Same fields as Create
   - Show source badge: "Auto-created from training session" or "Auto-created from game" if `source_type` is set
   - Delete button with confirmation

**Queries:**
```javascript
// Fetch month range
const { data: events } = await supabase
  .from('calendar_events')
  .select('*')
  .gte('event_date', startOfMonth)
  .lte('event_date', endOfMonth)
  .order('event_date', { ascending: true });

// Upsert (create or edit)
const { data, error } = await supabase.rpc('upsert_calendar_event', {
  p_id: existingId || null,
  p_title: title,
  p_event_type: eventType,
  p_event_date: date,
  p_start_time: startTime,
  p_end_time: endTime,
  p_location: location,
  p_description: description,
  p_team_id: teamId || null,
  p_all_day: allDay,
  p_created_by: session.user.id
});

// Delete
const { error } = await supabase
  .from('calendar_events')
  .delete()
  .eq('id', eventId);
```

### Coach Portal: Calendar (Read-only)
Coaches see the calendar in read-only mode. They can view events but cannot create/edit/delete them directly (they create events indirectly by logging training sessions and games through the Data Entry tab).

### Parent Portal: Calendar (Read-only)
Parents see their team's calendar events. Filter by their athlete's `team_id` via the join path:
```javascript
// Get parent's team IDs
const { data: teams } = await supabase
  .from('parent_accounts')
  .select('athletes!inner(team_rosters!inner(team_id))')
  .eq('user_id', session.user.id);

const teamIds = [...new Set(teams.flatMap(t =>
  t.athletes.flatMap(a => a.team_rosters.map(r => r.team_id))
))];

const { data: events } = await supabase
  .from('calendar_events')
  .select('*')
  .in('team_id', teamIds)
  .gte('event_date', today)
  .order('event_date', { ascending: true });
```

---

## 5. Welcome Email (Auto on Approval)

### Trigger
When admin clicks "Approve" on a login request (existing `approveReq()` function in `admin-os.js`), the backend trigger `queue_welcome_email` fires automatically when `profiles.approved` flips to `true`. No frontend changes needed for the trigger.

### Edge Function Deployment
The `send-welcome-email` function must be deployed to Supabase and scheduled via cron (every 2 minutes) or invoked after each approval:

**Option A (Recommended): Invoke after approval**
In `approveReq()`, after the profile update succeeds, add:
```javascript
// After profiles.update({ approved: true })
await supabase.functions.invoke('send-welcome-email');
```

**Option B: Cron**
Schedule `send-welcome-email` to run every 2 minutes via Supabase Dashboard > Edge Functions > Cron.

---

## 6. admin-os.html Sidebar Updates

Add new sidebar entries. Current sidebar has: Dashboard, Players & Parents, Login Requests, Orders & Dues, Email / SMS, Blog Posts, Coach Memos.

**New sidebar order:**
1. Dashboard
2. Players & Parents
3. Login Requests
4. Season Dues
5. Pro Shop Orders
6. Messaging
7. Data Entry
8. Calendar
9. Blog Posts
10. Coach Memos

Each new panel needs a `<div id="panel-{id}" class="panel">` in the HTML and corresponding `sb-link` button in the sidebar.

---

## 7. Implementation Order

Priority order for frontend dev:

1. **Dues/Orders split** -- highest business value, cleanest data separation
2. **Data Entry (Training + Games)** -- unblocks coach workflow, populates calendar
3. **Calendar** -- depends on data entry creating events
4. **Messaging** -- standalone, can be done in parallel with 2/3
5. **Welcome Email invocation** -- one line added to `approveReq()`

---

## 8. Shared Patterns

### Toast Notifications
Use a global toast function (add if not present):
```javascript
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
```

### Loading States
Every panel load should show a spinner overlay and disable action buttons until data returns.

### Error Handling
All Supabase calls must handle errors:
```javascript
if (error) {
  console.error('Context:', error);
  showToast(error.message || 'Something went wrong', 'error');
  return;
}
```

### Date Formatting
Use consistent date formatting:
```javascript
const fmt = (iso) => new Date(iso).toLocaleDateString('en-US', {
  month: 'short', day: 'numeric', year: 'numeric'
});
```

### Status Badges
Reuse the existing badge pattern in admin-os for statuses:
```css
.badge-pending  { background: #fef3c7; color: #92400e; }
.badge-paid     { background: #d1fae5; color: #065f46; }
.badge-overdue  { background: #fee2e2; color: #991b1b; }
.badge-sent     { background: #dbeafe; color: #1e40af; }
.badge-shipped  { background: #e0e7ff; color: #3730a3; }
.badge-delivered { background: #d1fae5; color: #065f46; }
```
