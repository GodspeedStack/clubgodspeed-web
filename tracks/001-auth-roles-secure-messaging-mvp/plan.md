# Track 001 — Auth + Roles + Secure Messaging MVP (Plan)

## Working Agreement for This Track
- We do not write UI until the data model + RLS are executable and verified.
- Every permission rule is enforced in two places:
  1) server route checks (defense in depth)
  2) Supabase RLS (source of truth)
- Tasks are written to be observable, reversible, and testable.

## Phase 0 — Repo Recon + Decision Lock
### Task 0.1 — Identify current auth entry point
- Inspect: `auth.js`, `auth-supabase.js`, any middleware, API routes.
- Output: short note in this plan under “Decision Log” with:
  - current auth mechanism
  - where session is stored
  - where role is currently derived (if at all)

### Task 0.2 — Confirm security/RBAC assumptions
- Inspect: `SECURITY.md`, `security.js` (role constants, permissions matrix).
- Output: Decision Log entries:
  - canonical roles
  - any existing permission mapping worth reusing

### Task 0.3 — Confirm Supabase conventions
- Inspect: `supabase/` migrations, RLS patterns, naming conventions.
- Output: Decision Log entries:
  - migration folder convention
  - how policies are structured
  - any helper SQL functions already used

#### Checkpoint
- If auth + RBAC conventions conflict with this spec, update spec before proceeding.

## Phase 1 — Data Model + RLS (Foundation)
### Task 1.1 — Create/align tables
- Implement migrations for:
  - `profiles`
  - `teams`
  - `team_memberships`
  - `conversations`
  - `conversation_participants`
  - `messages`
  - (Optional) `message_reads` or `conversation_last_seen`
- Ensure foreign keys and unique constraints exist (especially direct conversation uniqueness).

### Task 1.2 — Implement RLS policies
- Enable RLS on all messaging + membership tables.
- Policies (minimum):
  - profiles: self read/update
  - team_memberships: self read; coaches/admin manage for team
  - teams: visible if member; manage if coach/admin
  - conversations: select if participant (direct) or team member (team)
  - conversation_participants: select if in conversation; insert only via server path or constrained policy
  - messages: select if participant; insert if participant and allowed by relationship rules

### Task 1.3 — Add eligibility rule enforcement
- Decide how to encode “who can DM whom”.
- Options:
  - SQL helper function used in policy
  - server-only creation of direct conversations + participant rows, then RLS gates reads/inserts
- Implement chosen approach and document it in Decision Log.

### Task 1.4 — Seed minimal test data
- Add seed script or SQL seed:
  - one admin, one coach, one parent, one player
  - one team with memberships
  - team conversation and one direct conversation
- Validate RLS by running as different users and confirming expected access.

#### Checkpoint (Must Pass)
- Attempt unauthorized reads/writes and confirm blocked at DB level.
- Confirm membership removal revokes access immediately.

## Phase 2 — Server Contracts (API + Session Enforcement)
### Task 2.1 — Create server endpoints (or server actions)
Minimum endpoints:
- `GET /api/conversations`
- `GET /api/conversations/:id/messages?cursor=...`
- `POST /api/conversations/:id/messages`
- `POST /api/direct-conversations` (create or reuse direct conversation)
- `GET /api/teams/:id/conversation` (resolve team chat)

### Task 2.2 — Enforce session on server
- Implement server middleware/guard:
  - validate Supabase session
  - attach `userId` to request context
- Ensure no endpoint relies on client-provided user ids.

### Task 2.3 — Validate inputs and shape outputs
- Message length limits, trimming, empty checks.
- Pagination parameters validated.
- Standard error shapes:
  - 401 unauthenticated
  - 403 unauthorized
  - 404 not found
  - 429 rate limit (optional)
  - 500 fallback

#### Checkpoint
- All endpoints return correct codes and never leak sensitive internals.

## Phase 3 — UX and UI Implementation (Thin Client)
### Task 3.1 — Inbox UI (conversation list)
- List team conversation(s) + direct conversations.
- Empty state.
- Loading and error states.

### Task 3.2 — Conversation view UI
- Paginated message list.
- Composer with send action.
- Send pending/error states (retry).
- Auto-scroll behavior for new messages (basic, not fancy).

### Task 3.3 — New direct message flow
- Role-aware recipient selector:
  - coach can pick players/parents on their teams
  - parent/player can pick coach(es) on their teams
- Create or reuse direct conversation, then navigate to it.

### Task 3.4 — Navigation integration
- Add “Messages” entry where appropriate.
- Team page includes “Team Chat” entry point.

#### Checkpoint
- A coach can message team; parent/player can message coach; all within UI without manual URL hacks.

## Phase 4 — Hardening, Tests, and “No Surprises”
### Task 4.1 — Automated checks (minimum)
- Unit tests for:
  - conversation creation rules
  - message send validation
- Integration test (or script) that verifies RLS restrictions across roles.

### Task 4.2 — Security review pass
- Confirm:
  - no service role key exposure
  - no logging of message bodies
  - server enforces auth on all routes
  - RLS enabled and not bypassed

### Task 4.3 — Performance pass
- Add pagination defaults.
- Confirm indexes exist:
  - messages(conversation_id, created_at)
  - conversation_participants(user_id)
  - team_memberships(team_id, user_id)

### Task 4.4 — Accessibility pass
- Focus order, labels, keyboard send (Enter), screen reader checks.

#### Final Checkpoint (Definition of Done)
- Unauthorized access is blocked at DB level.
- MVP flows work for all roles.
- Messaging is stable under basic use.
- No secrets shipped client-side.

## Decision Log (Fill as you go)
- Auth mode chosen:
- Session storage chosen:
- Role source of truth:
- Parent-child linkage approach (if needed):
- Realtime vs non-realtime:
- Soft delete policy for messages:
