# UI Rules

## Purpose
This document is the canonical UI behavior contract for Track 001. It defines conditional display logic, state handling, and guardrails. Styling and components are governed by README.md.

## Scope
- Applies to: Track 001 UI unless explicitly marked as Global.
- Not included: visual design beyond README.md.

## Sources of Truth
- README.md: UI components + styling patterns
- api-contract.md: endpoint shapes + data fields
- ui-rules.md: behavior rules + display logic

## Rule Format (Scalable Standard)
Every rule MUST follow this structure:

### [RULE-ID] Rule name
- **Status:** Proposed | Active | Deprecated
- **Applies to:** Screen(s) / Component(s)
- **Driven by:** API field(s) (source of truth)
- **Behavior:** Clear pass/fail behavior
- **Non-goals:** What must NOT happen
- **Edge cases:** Any special handling
- **Owner:** Frontend | Backend | Both
- **Added:** YYYY-MM-DD

## Change Log
- YYYY-MM-DD: [RULE-ID] Added/Updated/Deprecated — reason

## Training Rules (Track 001)

### [TRN-001] Hide athlete selector unless multiple athletes
- **Status:** Active
- **Applies to:** Training Dashboard
- **Driven by:** `athletes_count`
- **Behavior:** If `athletes_count < 2`, hide selector and do not show "All Athletes". Default to the single athlete.
- **Non-goals:** Never show multi-athlete UI for single-athlete accounts.
- **Owner:** Frontend
- **Added:** 2026-01-20

### [TRN-002] Schedule visibility is data-driven only
- **Status:** Active
- **Applies to:** Training Dashboard, Training Details
- **Driven by:** `has_schedule` OR `start_time`
- **Behavior:** Render "Training Schedule" only when `has_schedule = true` or `start_time != null`.
- **Non-goals:** Do not infer schedule existence from strings (e.g., "Mon 6pm").
- **Owner:** Both
- **Added:** 2026-01-20

### [TRN-003] Individual sessions suppress schedule + aggregation
- **Status:** Active
- **Applies to:** Individual training session views
- **Driven by:** `has_schedule = false` OR `start_time = null`
- **Behavior:** Do not render "Training Schedule", do not render "All Athletes", do not aggregate across programs/sessions.
- **Owner:** Frontend
- **Added:** 2026-01-20
