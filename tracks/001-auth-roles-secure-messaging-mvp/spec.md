# Track 001 — Auth + Roles + Secure Messaging MVP (Spec)

## Objective
Ship a secure, minimal messaging system for Club Godspeed that is governed by clear roles and permissions and enforced at the database layer using Supabase **Row Level Security (RLS)**. The MVP must be production-credible: no “client-side security” theater.

## Problem Statement
The team needs reliable, secure communication without scorekeeping or feature bloat. Current repo security/auth assets exist (SECURITY.md, security.js, auth.js, auth-supabase.js), but the product lacks an end-to-end, enforced model for:
1) who a user is, 2) what they’re allowed to do, and 3) how messages are stored and accessed safely.

## Users and Roles
### Roles (MVP)
- **Admin**: full control across org; manages teams, membership, and can view/report abuse; limited ability to read private conversations unless explicitly granted (see Privacy).
- **Coach**: manages their team rosters; can message players/parents on their teams.
- **Parent**: can message coaches on their child’s teams; can participate in team chats where included.
- **Player (Athlete)**: can message coaches; can participate in team chats where included.

Definition: **Role-Based Access Control (RBAC)** is enforced by server checks + database RLS policies, not UI conditions.

### Role Assignment Source of Truth
- Canonical role definitions and any existing role constants in SECURITY.md remain authoritative unless this spec overrides with explicit decisions.
- Roles are stored in the DB as app-level roles in `user_profiles` (not Supabase Auth “role”).

## MVP Messaging Scope
### Conversation Types (MVP)
1) **Team Chat (Group)**
   - One conversation per team.
   - Members are team roster: coach(es), players, parents (based on team membership relationship).
2) **Direct Message (1:1)**
   - Coach ↔ Player (Athlete)
   - Coach ↔ Parent
   - Player ↔ Player: **NO** for MVP.

### Message Types (MVP)
- Text only (no images/files/attachments).
- No reactions.
- No threaded replies.
- No typing indicators.
- No voice/video.

### Retention and Moderation (MVP)
- Messages are retained indefinitely initially (explicit limitation) OR configurable later via retention policy.
- Minimal moderation:
  - Admin can deactivate a user.
  - “Report message” is out of scope unless already partially implemented.
- Audit trail: create/update timestamps on message rows; soft delete optional (see Tradeoffs).

## Privacy and Access Rules
- Only participants of a conversation can read messages.
- Admin reading private DMs is NOT automatic. If admin needs access, implement explicit “admin access reason” workflow later. MVP: admins can manage teams and membership, but cannot read private DMs by default.
- Team chat visibility follows team membership.

## Auth Requirements
### Authentication
Use Supabase Auth as identity provider.
- Current repo behavior: email/password via `auth-supabase.js` with Supabase client persisted in localStorage.
- Session handling must be secure:
  - Prefer server-managed session using **JWT** from Supabase and httpOnly cookies where feasible.
  - Do not rely on localStorage as the sole session store for anything privileged.

### Authorization Enforcement
- App server routes must validate the user session and derive app role(s).
- Database must enforce access using **RLS** policies in Supabase.
- Never expose the Supabase **Service Role Key** to the client.

### Account Lifecycle (MVP)
- Signup/signin flow per existing implementation.
- Basic signout.
- Basic “forgot password” if already present; otherwise deferred.
- User profile includes display name and role associations.

## Data Model (Proposed MVP)
Actual implementation must align with existing `supabase/` schema conventions and migrations.

### Core Tables
1) `user_profiles` (existing)
- `id` (uuid, PK, references auth.users)
- `email`, `role`, `first_name`, `last_name`
- `created_at`, `updated_at`

2) `teams`
- `id` (uuid, PK)
- `name` (text)
- `created_at`, `updated_at`

3) `team_memberships`
- `id` (uuid, PK)
- `team_id` (uuid, FK teams)
- `user_id` (uuid, FK auth.users)
- `role` (text enum: admin/coach/parent/athlete)
- `status` (active/inactive)
- timestamps

Notes:
- Parent-child linkage uses `player_guardians` if needed:
  - `player_id`, `guardian_user_id`, `team_id` (optional), status, timestamps.

4) `conversations`
- `id` (uuid, PK)
- `type` (text enum: team/direct)
- `team_id` (uuid nullable, for team)
- `created_by` (uuid)
- `created_at`

5) `conversation_participants`
- `conversation_id` (uuid)
- `user_id` (uuid)
- `role_in_conversation` (optional)
- `joined_at`
- unique(conversation_id, user_id)

6) `conversation_messages`
- `id` (uuid, PK)
- `conversation_id` (uuid)
- `sender_id` (uuid)
- `body` (text)
- `created_at`
- Optional: `deleted_at` (soft delete)

7) `direct_conversation_pairs`
- `user1_id`, `user2_id`, `conversation_id`, `created_by`, timestamps
- Ensures uniqueness for direct conversations.

8) Optional: `conversation_last_seen`
- `conversation_id`, `user_id`, `last_seen_at`

### RLS Expectations (High Level)
- user_profiles: user can read/update their own.
- teams: visible if user is a member; coaches/admin can manage.
- team_memberships: visible to user, coaches/admin for their team.
- conversations:
  - team conversations visible if team member
  - direct conversations visible if participant
- conversation_messages: visible if participant in the conversation or team member for team chat; insert allowed only if participant and allowed by role rules.

## UX Flows (MVP)
### Entry Points
- “Messages” in nav
- Team page → “Team Chat”
- Member roster → “Message Coach” / “Message Parent” / “Message Player” (role-aware)

### Screens
1) Auth: Sign in / Sign up (reuse existing patterns)
2) Messages Inbox:
   - list conversations (team + direct)
3) Conversation View:
   - message list
   - composer (text only)
   - basic empty/error states
4) New Message (Direct):
   - select eligible recipient(s)
   - creates conversation or reuses existing direct conversation

### Accessibility
- Keyboard navigation supported (tab order, focus visible).
- Screen reader labels for send, input, conversation list items.
- Color contrast compliance for text and status.

## Failure States and Edge Cases
- User not in team: cannot see team chat.
- Membership removed mid-session: access must be revoked by RLS (no stale UI access).
- Attempt to message someone outside allowed relationship: server + RLS block.
- Duplicate direct conversations: must enforce uniqueness (participant pair uniqueness).
- Rate limiting / spam: not fully solved in MVP; at least add basic throttling at API layer.
- Offline/latency: show send pending/error states; do not lose composed text.

## Performance Expectations (MVP)
- Conversation list loads under 1s for typical user (<50 conversations).
- Conversation view paginates (infinite scroll) at 25–50 messages per page.
- Realtime updates: **NO** for MVP (pagination + refresh/polling).

## Security Constraints (Non-Negotiable)
- Authorization enforced by RLS + server checks.
- No client-side-only permission gating.
- No service role key in browser.
- Input validation on message body length and content.
- Logging: do not log message bodies in server logs.

## Non-Goals (Explicit)
- Scorekeeping, stats, schedules.
- File attachments, media sharing.
- Push notifications (can backlog).
- Read receipts, typing indicators (optional later).
- Admin “shadow access” to DMs without explicit workflow.
- E2E encryption (future scope).

## Tradeoffs (Consciously Accepted)
- MVP text-only messaging to reduce abuse surface and complexity.
- Limited moderation features; focus on correct access control first.
- Retention policy deferred unless already required.
- Realtime deferred; correctness > realtime polish.

## Success Criteria (Measurable)
- Role rules enforced: attempt to access unauthorized conversation/messages fails at DB level.
- A coach can create and use team chat for their team.
- A parent/player can message their coach and see replies.
- Removed members lose access immediately (on next query) due to RLS.
- No secrets exposed client-side; service role key never shipped to browser.

## Decisions (Locked for MVP)
- Conversation types: Team chat, Coach↔Parent, Coach↔Player (Athlete). Player↔Player: **NO**.
- Realtime: **NO** (pagination + refresh/polling).
- Composer behavior: **Single-line input, Enter sends.**
- Soft delete: **YES** for conversation messages via `deleted_at`.
- Parent-child linkage: **Optional** via `player_guardians` (only if required for eligibility rules).

## Implementation Notes
- API contract is defined in `tracks/001-auth-roles-secure-messaging-mvp/api-contract.md`.
- UI behavior is defined in `tracks/001-auth-roles-secure-messaging-mvp/ui-rules.md`.
