# Training Sessions API - Contract Confirmation

## ✅ Backend Contract Confirmation

This document confirms the backend contract implementation for training sessions API.

---

## 1. Schedule Presence Indicator (SOURCE OF TRUTH)

### ✅ Implementation Confirmed

**Field**: `has_schedule` (boolean) - **EXPLICIT SOURCE OF TRUTH**

- **Always included** in all training session responses
- **Computed column**: `has_schedule BOOLEAN GENERATED ALWAYS AS (start_time IS NOT NULL) STORED`
- **Explicit in response**: Every session object includes `has_schedule` field

**Response Format**:
```json
{
    "sessions": [
        {
            "id": "uuid",
            "athlete_id": "p1",
            "program_name": "Elite Guard Academy",
            "focus": "Ball handling",
            "status": "scheduled",
            "start_time": "2024-01-15T10:00:00Z",  // nullable
            "end_time": "2024-01-15T11:30:00Z",    // nullable
            "has_schedule": true,                   // EXPLICIT SOURCE OF TRUTH
            "created_at": "...",
            "updated_at": "..."
        }
    ]
}
```

### Frontend Contract

- **Frontend MUST use `has_schedule` field** to determine whether to render "Training Schedule" section
- If `has_schedule === false`, frontend **MUST NOT** show schedule UI
- `has_schedule` is the **single source of truth** - do not derive from `start_time` directly

---

## 2. Unscheduled Sessions

### ✅ Implementation Confirmed

**Rule**: Individual training sessions without predetermined times return `has_schedule = false` (or `start_time = null`)

**Implementation**:
- When `start_time IS NULL`, `has_schedule` is automatically `false` (computed column)
- Unscheduled sessions are valid and can be created/retrieved
- Frontend receives `has_schedule: false` and must not show schedule UI

**Example Unscheduled Session**:
```json
{
    "id": "uuid",
    "athlete_id": "p1",
    "program_name": "Elite Guard Academy",
    "focus": "Ball handling",
    "status": "scheduled",
    "start_time": null,        // No predetermined time
    "end_time": null,          // No predetermined time
    "has_schedule": false,     // EXPLICIT: No schedule
    ...
}
```

---

## 3. Multi-Athlete Aggregation (SCHEDULED ONLY)

### ✅ Implementation Confirmed

**Contract**: Multi-athlete aggregation is **ONLY valid for scheduled group programs**

**Backend Enforcement**:
- When `p_include_all = true` AND `athletes_count > 1`:
  - Backend **ONLY returns sessions where `has_schedule = true`**
  - Query includes: `WHERE athlete_id = ANY(v_athlete_ids) AND has_schedule = true`
  - Unscheduled sessions are **excluded** from multi-athlete aggregation

**Code Reference** (`012_training_sessions_api.sql`):
```sql
IF p_include_all AND v_athletes_count > 1 THEN
    -- Multi-athlete aggregation: ONLY return scheduled group programs
    -- ...
    WHERE athlete_id = ANY(v_athlete_ids)
    AND has_schedule = true;  -- CRITICAL: Only scheduled sessions
```

**Frontend Contract**:
- When requesting aggregated schedule (`includeAll = true`), expect **only scheduled sessions**
- Unscheduled sessions will not appear in aggregated view
- To see unscheduled sessions, query individual athlete (`athleteId` specified)

---

## 4. Response Structure Guarantees

### ✅ Always Included Fields

Every training session response **ALWAYS includes**:

1. ✅ `has_schedule` (boolean) - **EXPLICIT SOURCE OF TRUTH**
2. ✅ `start_time` (timestamptz | null) - Nullable, matches `has_schedule`
3. ✅ `end_time` (timestamptz | null) - Nullable, matches `has_schedule`
4. ✅ `id`, `athlete_id`, `program_name`, `focus`, `status`, `created_at`, `updated_at`

### Response Examples

**Scheduled Session**:
```json
{
    "has_schedule": true,
    "start_time": "2024-01-15T10:00:00Z",
    "end_time": "2024-01-15T11:30:00Z"
}
```

**Unscheduled Session**:
```json
{
    "has_schedule": false,
    "start_time": null,
    "end_time": null
}
```

---

## 5. API Function Contracts

### `get_training_sessions()`

**Parameters**:
- `p_user_id`: UUID (required)
- `p_athlete_id`: VARCHAR | NULL (optional)
- `p_include_all`: BOOLEAN (default: false)

**Contract Rules**:
1. ✅ If `p_include_all = true` AND `athletes_count > 1`: **ONLY returns `has_schedule = true` sessions**
2. ✅ If `p_athlete_id` specified: Returns all sessions (scheduled and unscheduled)
3. ✅ All responses include `has_schedule` field
4. ✅ `has_schedule` is computed from `start_time IS NOT NULL`

**Response**:
```json
{
    "sessions": [...],  // Always includes has_schedule field
    "athletes_count": 2,
    "athlete_ids": ["p1", "p2"]
}
```

---

## 6. Frontend Implementation Checklist

### ✅ Required Checks

- [x] Check `has_schedule` field (not `start_time`) to determine schedule UI visibility
- [x] If `has_schedule === false`, do NOT render "Training Schedule" section
- [x] When requesting multi-athlete aggregation, expect only scheduled sessions
- [x] Use `has_schedule` as single source of truth (do not derive from `start_time`)

### Code Pattern

```javascript
// ✅ CORRECT: Use has_schedule as source of truth
if (session.has_schedule === true) {
    renderScheduleUI(session);
} else {
    // Do NOT show schedule UI
    renderSessionInfoOnly(session);
}

// ❌ WRONG: Don't derive from start_time
if (session.start_time !== null) {  // Don't do this
    renderScheduleUI(session);
}
```

---

## 7. Database Schema Confirmation

### Table: `training_sessions_v2`

```sql
CREATE TABLE training_sessions_v2 (
    id UUID PRIMARY KEY,
    athlete_id VARCHAR(100) NOT NULL,
    program_name VARCHAR(255) NOT NULL,
    focus TEXT,
    status VARCHAR(20) NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE,  -- Nullable
    end_time TIMESTAMP WITH TIME ZONE,    -- Nullable
    has_schedule BOOLEAN GENERATED ALWAYS AS (start_time IS NOT NULL) STORED  -- SOURCE OF TRUTH
);
```

### Key Points

- ✅ `has_schedule` is a **computed stored column** (always accurate)
- ✅ `start_time` and `end_time` are **nullable** (unscheduled sessions allowed)
- ✅ `has_schedule` automatically reflects `start_time` state

---

## Summary

✅ **All contract requirements confirmed and implemented:**

1. ✅ `has_schedule` field is **always included** in responses (explicit source of truth)
2. ✅ Unscheduled sessions return `has_schedule = false` (or `start_time = null`)
3. ✅ Multi-athlete aggregation **ONLY returns scheduled sessions** (`has_schedule = true`)
4. ✅ Frontend contract: Use `has_schedule` to determine schedule UI visibility
5. ✅ Database enforces contract via computed column and query filters

**The backend contract is complete and ready for frontend integration.**
