-- =====================================================
-- SEED: Messaging MVP (safe to re-run)
-- =====================================================
-- Requires existing users in user_profiles with roles:
-- admin, coach, parent, athlete.
-- This script is no-op if required users are missing.

WITH
seed_team AS (
    INSERT INTO teams (id, name)
    SELECT uuid_generate_v4(), 'Seed Team'
    WHERE NOT EXISTS (SELECT 1 FROM teams WHERE name = 'Seed Team')
    RETURNING id
),
team AS (
    SELECT id FROM seed_team
    UNION ALL
    SELECT id FROM teams WHERE name = 'Seed Team' LIMIT 1
),
admin_user AS (
    SELECT id FROM user_profiles WHERE role = 'admin' LIMIT 1
),
coach_user AS (
    SELECT id FROM user_profiles WHERE role = 'coach' LIMIT 1
),
parent_user AS (
    SELECT id FROM user_profiles WHERE role = 'parent' LIMIT 1
),
athlete_user AS (
    SELECT id FROM user_profiles WHERE role = 'athlete' LIMIT 1
)
INSERT INTO team_memberships (team_id, user_id, role)
SELECT team.id, admin_user.id, 'admin' FROM team, admin_user
ON CONFLICT DO NOTHING;

WITH
team AS (SELECT id FROM teams WHERE name = 'Seed Team' LIMIT 1),
coach_user AS (SELECT id FROM user_profiles WHERE role = 'coach' LIMIT 1),
parent_user AS (SELECT id FROM user_profiles WHERE role = 'parent' LIMIT 1),
athlete_user AS (SELECT id FROM user_profiles WHERE role = 'athlete' LIMIT 1)
INSERT INTO team_memberships (team_id, user_id, role)
SELECT team.id, coach_user.id, 'coach' FROM team, coach_user
ON CONFLICT DO NOTHING;

WITH
team AS (SELECT id FROM teams WHERE name = 'Seed Team' LIMIT 1),
parent_user AS (SELECT id FROM user_profiles WHERE role = 'parent' LIMIT 1)
INSERT INTO team_memberships (team_id, user_id, role)
SELECT team.id, parent_user.id, 'parent' FROM team, parent_user
ON CONFLICT DO NOTHING;

WITH
team AS (SELECT id FROM teams WHERE name = 'Seed Team' LIMIT 1),
athlete_user AS (SELECT id FROM user_profiles WHERE role = 'athlete' LIMIT 1)
INSERT INTO team_memberships (team_id, user_id, role)
SELECT team.id, athlete_user.id, 'athlete' FROM team, athlete_user
ON CONFLICT DO NOTHING;

-- Create team conversation if missing
WITH
team AS (SELECT id FROM teams WHERE name = 'Seed Team' LIMIT 1),
coach_user AS (SELECT id FROM user_profiles WHERE role = 'coach' LIMIT 1)
INSERT INTO conversations (id, type, team_id, created_by)
SELECT uuid_generate_v4(), 'team', team.id, coach_user.id
FROM team, coach_user
WHERE NOT EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.type = 'team' AND c.team_id = team.id
);

-- Create direct conversation between coach and parent if possible
WITH
coach_user AS (SELECT id FROM user_profiles WHERE role = 'coach' LIMIT 1),
parent_user AS (SELECT id FROM user_profiles WHERE role = 'parent' LIMIT 1),
existing AS (
    SELECT conversation_id
    FROM direct_conversation_pairs
    WHERE (user1_id = (SELECT id FROM coach_user) AND user2_id = (SELECT id FROM parent_user))
       OR (user2_id = (SELECT id FROM coach_user) AND user1_id = (SELECT id FROM parent_user))
    LIMIT 1
),
direct_conversation AS (
    INSERT INTO conversations (id, type, created_by)
    SELECT uuid_generate_v4(), 'direct', coach_user.id
    FROM coach_user, parent_user
    WHERE NOT EXISTS (SELECT 1 FROM existing)
    RETURNING id
),
direct_id AS (
    SELECT id FROM direct_conversation
    UNION ALL
    SELECT conversation_id FROM existing
)
INSERT INTO conversation_participants (conversation_id, user_id)
SELECT direct_id.id, coach_user.id FROM direct_id, coach_user
ON CONFLICT DO NOTHING;

WITH
coach_user AS (SELECT id FROM user_profiles WHERE role = 'coach' LIMIT 1),
parent_user AS (SELECT id FROM user_profiles WHERE role = 'parent' LIMIT 1),
direct_id AS (
    SELECT c.id
    FROM conversations c
    JOIN conversation_participants cp1 ON cp1.conversation_id = c.id
    JOIN conversation_participants cp2 ON cp2.conversation_id = c.id
    WHERE c.type = 'direct'
      AND cp1.user_id = (SELECT id FROM coach_user)
      AND cp2.user_id = (SELECT id FROM parent_user)
    LIMIT 1
)
INSERT INTO conversation_participants (conversation_id, user_id)
SELECT direct_id.id, parent_user.id FROM direct_id, parent_user
ON CONFLICT DO NOTHING;

WITH
coach_user AS (SELECT id FROM user_profiles WHERE role = 'coach' LIMIT 1),
parent_user AS (SELECT id FROM user_profiles WHERE role = 'parent' LIMIT 1),
direct_id AS (
    SELECT c.id
    FROM conversations c
    JOIN conversation_participants cp1 ON cp1.conversation_id = c.id
    JOIN conversation_participants cp2 ON cp2.conversation_id = c.id
    WHERE c.type = 'direct'
      AND cp1.user_id = (SELECT id FROM coach_user)
      AND cp2.user_id = (SELECT id FROM parent_user)
    LIMIT 1
)
INSERT INTO direct_conversation_pairs (user1_id, user2_id, conversation_id, created_by)
SELECT LEAST(coach_user.id, parent_user.id), GREATEST(coach_user.id, parent_user.id), direct_id.id, coach_user.id
FROM coach_user, parent_user, direct_id
ON CONFLICT DO NOTHING;
