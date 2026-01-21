# Training Sessions API Documentation

## Overview

Backend data model and API for training sessions with optional schedule support. The system provides athlete context management and enforces UI display rules based on `has_schedule` flag and `athletes_count`.

## Database Schema

### Table: `training_sessions_v2`

```sql
CREATE TABLE training_sessions_v2 (
    id UUID PRIMARY KEY,
    athlete_id VARCHAR(100) NOT NULL,
    program_name VARCHAR(255) NOT NULL,  -- e.g., "Elite Guard Academy"
    focus TEXT,                           -- Training focus/description
    status VARCHAR(20) NOT NULL,          -- 'completed' | 'scheduled' | 'tentative' | 'canceled'
    start_time TIMESTAMP WITH TIME ZONE,  -- Nullable
    end_time TIMESTAMP WITH TIME ZONE,    -- Nullable
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    has_schedule BOOLEAN GENERATED ALWAYS AS (start_time IS NOT NULL) STORED
);
```

### Key Fields

- **`has_schedule`**: **EXPLICIT SOURCE OF TRUTH** - Computed boolean flag. `true` if `start_time IS NOT NULL`, `false` otherwise.
  - **Frontend MUST use this field to determine whether to render "Training Schedule" section**
  - If `has_schedule === false`, frontend **MUST NOT** show schedule UI
  - Individual training sessions without predetermined times return `has_schedule = false`
- **`start_time` / `end_time`**: Nullable timestamptz. If null, session has no predetermined schedule.
  - When `start_time IS NULL`, `has_schedule` is automatically `false`
- **`status`**: Enum: `completed`, `scheduled`, `tentative`, `canceled`

### Table: `parent_athletes`

Links parents to their athletes for context management:

```sql
CREATE TABLE parent_athletes (
    id UUID PRIMARY KEY,
    parent_id UUID REFERENCES parent_accounts(id),
    athlete_id VARCHAR(100) NOT NULL,
    athlete_name VARCHAR(255),
    UNIQUE (parent_id, athlete_id)
);
```

## API Contract

### 1. Athlete Context

**Function**: `get_athlete_context(p_user_id UUID)`

**Returns**:
```json
{
    "athletes_count": 2,
    "athletes": [
        { "id": "p1", "name": "Aiden" },
        { "id": "p2", "name": "Quest" }
    ]
}
```

**Rules**:
- `athletes[]` is always returned (frontend decides usage)
- If `athletes_count > 1`, frontend can show "All Athletes" aggregation
- If `athletes_count === 1`, single athlete view only

### 2. Training Sessions

**Function**: `get_training_sessions(p_user_id UUID, p_athlete_id VARCHAR, p_include_all BOOLEAN)`

**Returns**:
```json
{
    "sessions": [
        {
            "id": "uuid",
            "athlete_id": "p1",
            "program_name": "Elite Guard Academy",
            "focus": "Ball handling and shooting",
            "status": "scheduled",
            "start_time": "2024-01-15T10:00:00Z",
            "end_time": "2024-01-15T11:30:00Z",
            "has_schedule": true,
            "created_at": "2024-01-10T12:00:00Z",
            "updated_at": "2024-01-10T12:00:00Z"
        }
    ],
    "athletes_count": 2,
    "athlete_ids": ["p1", "p2"]
}
```

**Parameters**:
- `p_athlete_id`: Specific athlete ID, or `NULL` for default/all
- `p_include_all`: If `true` AND `athletes_count > 1`, returns aggregated schedule

**Rules**:
- **Multi-athlete aggregation**: If `athletes_count > 1` AND `p_include_all = true`: 
  - **ONLY returns scheduled sessions** (`has_schedule = true`)
  - This is the contract: multi-athlete aggregation is only valid for scheduled group programs
- **Single athlete query**: If `p_athlete_id` is provided: Returns all sessions for that athlete (scheduled and unscheduled)
- **Default behavior**: If `athletes_count === 1`: Returns all sessions for the single athlete
- **Response ALWAYS includes `has_schedule` field** as explicit source of truth for schedule presence

### 3. Create Session

**Function**: `create_training_session(...)`

**Parameters**:
- `p_user_id`: UUID (from auth)
- `p_athlete_id`: VARCHAR (required)
- `p_program_name`: VARCHAR (required)
- `p_focus`: TEXT (optional)
- `p_status`: VARCHAR (default: 'scheduled')
- `p_start_time`: TIMESTAMPTZ (optional)
- `p_end_time`: TIMESTAMPTZ (optional)

**Returns**:
```json
{
    "id": "uuid",
    "success": true
}
```

### 4. Update Session

**Function**: `update_training_session(...)`

**Parameters**:
- `p_user_id`: UUID
- `p_session_id`: UUID
- `p_program_name`: VARCHAR (optional)
- `p_focus`: TEXT (optional)
- `p_status`: VARCHAR (optional)
- `p_start_time`: TIMESTAMPTZ (optional, can set to NULL)
- `p_end_time`: TIMESTAMPTZ (optional, can set to NULL)

**Returns**:
```json
{
    "id": "uuid",
    "success": true
}
```

## Frontend API Client

### Usage

```javascript
// Get athlete context
const context = await TrainingSessionsAPI.getAthleteContext();
// { athletes_count: 2, athletes: [...] }

// Get sessions for specific athlete
const sessions = await TrainingSessionsAPI.getTrainingSessions('p1', false);

// Get aggregated schedule (all athletes)
const allSessions = await TrainingSessionsAPI.getTrainingSessions(null, true);

// Create session
const newSession = await TrainingSessionsAPI.createTrainingSession({
    athlete_id: 'p1',
    program_name: 'Elite Guard Academy',
    focus: 'Ball handling',
    status: 'scheduled',
    start_time: '2024-01-15T10:00:00Z',
    end_time: '2024-01-15T11:30:00Z'
});

// Update session
await TrainingSessionsAPI.updateTrainingSession(sessionId, {
    status: 'completed',
    focus: 'Updated focus'
});

// Delete session
await TrainingSessionsAPI.deleteTrainingSession(sessionId);
```

## UI Display Rules

### Rule 1: Training Schedule Visibility (SOURCE OF TRUTH)

**Field**: `has_schedule` (boolean) - **EXPLICIT SOURCE OF TRUTH**

**Condition**: `has_schedule === false` OR `start_time === null`

**Action**: Frontend **MUST NOT** show "Training Schedule" section/UI

**Implementation**:
```javascript
// has_schedule is the explicit source of truth
if (session.has_schedule === true) {
    // Show "Training Schedule" section
    // Display start_time, end_time, calendar view, etc.
} else {
    // MUST NOT show schedule UI
    // Only show program_name, focus, status (no time/date)
}
```

**Note**: Individual training sessions without predetermined times will have `has_schedule = false` (or `start_time = null`). Frontend must respect this.

### Rule 2: All Athletes Aggregation (SCHEDULED ONLY)

**Condition**: `athletes_count > 1` AND request is for aggregated schedule

**Contract**: Multi-athlete aggregation is **ONLY valid for scheduled group programs**

**Action**: 
- Show "All Athletes" view/endpoint
- Backend **ONLY returns sessions where `has_schedule = true`** (scheduled sessions only)
- Unscheduled sessions are excluded from multi-athlete aggregation

**Implementation**:
```javascript
const context = await TrainingSessionsAPI.getAthleteContext();

if (TrainingSessionsAPI.shouldShowAllAthletes(context, isAggregatedRequest)) {
    // Show "All Athletes" aggregation
    // Backend automatically filters to only scheduled sessions (has_schedule = true)
    const allSessions = await TrainingSessionsAPI.getTrainingSessions(null, true);
    // allSessions will ONLY contain sessions with has_schedule = true
} else {
    // Show single athlete view (all sessions: scheduled and unscheduled)
    const sessions = await TrainingSessionsAPI.getTrainingSessions(athleteId, false);
    // sessions may contain both scheduled (has_schedule = true) and unscheduled (has_schedule = false)
}
```

### Rule 3: Multi-Athlete UI

**Condition**: `athletes_count > 1`

**Action**: Show athlete selector/switcher

```javascript
const context = await TrainingSessionsAPI.getAthleteContext();

if (TrainingSessionsAPI.hasMultipleAthletes(context)) {
    // Show athlete selector
    // Show "View All" option
} else {
    // Single athlete view (no selector)
}
```

## Security (RLS Policies)

- **Training Sessions**: Parents can only see/update sessions for their own athletes
- **Parent Athletes**: Parents can only see their own athlete links
- All functions use `SECURITY DEFINER` with user_id validation

## Migration

Run migration file: `supabase/migrations/012_training_sessions_api.sql`

```bash
# Via Supabase CLI
supabase db push

# Or via SQL Editor in Supabase Dashboard
# Copy and paste the migration SQL
```

## Example Workflows

### Workflow 1: Single Athlete Parent

1. User logs in
2. `getAthleteContext()` returns `{ athletes_count: 1, athletes: [...] }`
3. Frontend shows single athlete view (no selector)
4. `getTrainingSessions(null, false)` returns sessions for that athlete
5. If `has_schedule === true`, show schedule UI

### Workflow 2: Multi-Athlete Parent

1. User logs in
2. `getAthleteContext()` returns `{ athletes_count: 2, athletes: [...] }`
3. Frontend shows athlete selector
4. User selects athlete → `getTrainingSessions(athleteId, false)`
5. User clicks "View All" → `getTrainingSessions(null, true)` (aggregated)
6. For each session: if `has_schedule === true`, show schedule UI

### Workflow 3: Unscheduled Session

1. Create session without `start_time`/`end_time`
2. `has_schedule === false` (computed)
3. Frontend hides schedule UI
4. Session appears in list without time/date

## Notes

- `has_schedule` is a **computed column** - automatically set based on `start_time`
- `athletes_count` determines multi-athlete UI behavior
- "All Athletes" aggregation is only valid when `athletes_count > 1` AND `p_include_all = true`
- All timestamps are in UTC (TIMESTAMP WITH TIME ZONE)
