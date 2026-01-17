-- =====================================================
-- MESSAGING MVP (TEAM + DIRECT)
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABLES
-- =====================================================

CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'coach', 'parent', 'athlete')),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_team_membership UNIQUE (team_id, user_id)
);

CREATE TABLE IF NOT EXISTS player_guardians (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    guardian_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_player_guardian UNIQUE (player_id, guardian_user_id, team_id)
);

CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(20) NOT NULL CHECK (type IN ('team', 'direct')),
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversation_participants (
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role_in_conversation VARCHAR(20),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS conversation_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT conversation_messages_body_length CHECK (char_length(body) BETWEEN 1 AND 2000)
);

CREATE TABLE IF NOT EXISTS direct_conversation_pairs (
    user1_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user2_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user1_id, user2_id),
    CONSTRAINT direct_conversation_pair_order CHECK (user1_id < user2_id)
);

CREATE TABLE IF NOT EXISTS conversation_last_seen (
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (conversation_id, user_id)
);

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_team_memberships_user_id ON team_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_team_memberships_team_id ON team_memberships(team_id);
CREATE INDEX IF NOT EXISTS idx_team_memberships_role_status ON team_memberships(role, status);

CREATE INDEX IF NOT EXISTS idx_conversations_type_team_id ON conversations(type, team_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created_by ON conversations(created_by);

CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_id ON conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation_id_created_at ON conversation_messages(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_direct_pairs_user2_id ON direct_conversation_pairs(user2_id);

-- =====================================================
-- UPDATED_AT TRIGGERS (uses existing update_updated_at_column)
-- =====================================================

DROP TRIGGER IF EXISTS update_teams_updated_at ON teams;
CREATE TRIGGER update_teams_updated_at
    BEFORE UPDATE ON teams
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_team_memberships_updated_at ON team_memberships;
CREATE TRIGGER update_team_memberships_updated_at
    BEFORE UPDATE ON team_memberships
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_player_guardians_updated_at ON player_guardians;
CREATE TRIGGER update_player_guardians_updated_at
    BEFORE UPDATE ON player_guardians
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

CREATE OR REPLACE FUNCTION is_team_member(p_user_id UUID, p_team_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1
        FROM team_memberships tm
        WHERE tm.team_id = p_team_id
          AND tm.user_id = p_user_id
          AND tm.status = 'active'
    );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION get_team_role(p_user_id UUID, p_team_id UUID)
RETURNS VARCHAR AS $$
    SELECT tm.role
    FROM team_memberships tm
    WHERE tm.team_id = p_team_id
      AND tm.user_id = p_user_id
      AND tm.status = 'active'
    LIMIT 1;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION is_team_coach_or_admin(p_user_id UUID, p_team_id UUID)
RETURNS BOOLEAN AS $$
    SELECT
        get_user_role(p_user_id) = 'admin'
        OR EXISTS (
            SELECT 1
            FROM team_memberships tm
            WHERE tm.team_id = p_team_id
              AND tm.user_id = p_user_id
              AND tm.status = 'active'
              AND tm.role = 'coach'
        );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION is_conversation_participant(p_user_id UUID, p_conversation_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1
        FROM conversation_participants cp
        WHERE cp.conversation_id = p_conversation_id
          AND cp.user_id = p_user_id
    );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION is_direct_conversation(p_conversation_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1
        FROM conversations c
        WHERE c.id = p_conversation_id
          AND c.type = 'direct'
    );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION can_direct_message(p_sender_id UUID, p_recipient_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    sender_role VARCHAR;
    recipient_role VARCHAR;
BEGIN
    IF p_sender_id = p_recipient_id THEN
        RETURN FALSE;
    END IF;

    SELECT role INTO sender_role FROM user_profiles WHERE id = p_sender_id;
    SELECT role INTO recipient_role FROM user_profiles WHERE id = p_recipient_id;

    IF sender_role IS NULL OR recipient_role IS NULL THEN
        RETURN FALSE;
    END IF;

    IF sender_role = 'admin' OR recipient_role = 'admin' THEN
        RETURN TRUE;
    END IF;

    IF sender_role = 'coach' AND recipient_role IN ('parent', 'athlete') THEN
        RETURN EXISTS (
            SELECT 1
            FROM team_memberships a
            JOIN team_memberships b ON a.team_id = b.team_id
            WHERE a.user_id = p_sender_id
              AND b.user_id = p_recipient_id
              AND a.status = 'active'
              AND b.status = 'active'
        );
    END IF;

    IF sender_role IN ('parent', 'athlete') AND recipient_role = 'coach' THEN
        RETURN EXISTS (
            SELECT 1
            FROM team_memberships a
            JOIN team_memberships b ON a.team_id = b.team_id
            WHERE a.user_id = p_sender_id
              AND b.user_id = p_recipient_id
              AND a.status = 'active'
              AND b.status = 'active'
        );
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- RLS
-- =====================================================

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_conversation_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_last_seen ENABLE ROW LEVEL SECURITY;

-- Teams policies
CREATE POLICY teams_select_member ON teams
    FOR SELECT
    USING (is_team_member(auth.uid(), id) OR get_user_role(auth.uid()) = 'admin');

CREATE POLICY teams_manage_admin ON teams
    FOR ALL
    USING (get_user_role(auth.uid()) = 'admin')
    WITH CHECK (get_user_role(auth.uid()) = 'admin');

-- Team memberships policies
CREATE POLICY team_memberships_select ON team_memberships
    FOR SELECT
    USING (
        user_id = auth.uid()
        OR is_team_coach_or_admin(auth.uid(), team_id)
    );

CREATE POLICY team_memberships_manage ON team_memberships
    FOR INSERT WITH CHECK (is_team_coach_or_admin(auth.uid(), team_id));

CREATE POLICY team_memberships_update ON team_memberships
    FOR UPDATE
    USING (is_team_coach_or_admin(auth.uid(), team_id))
    WITH CHECK (is_team_coach_or_admin(auth.uid(), team_id));

CREATE POLICY team_memberships_delete ON team_memberships
    FOR DELETE
    USING (is_team_coach_or_admin(auth.uid(), team_id));

-- Player guardians policies (self + coach/admin)
CREATE POLICY player_guardians_select ON player_guardians
    FOR SELECT
    USING (
        guardian_user_id = auth.uid()
        OR player_id = auth.uid()
        OR is_team_coach_or_admin(auth.uid(), team_id)
    );

CREATE POLICY player_guardians_manage ON player_guardians
    FOR ALL
    USING (is_team_coach_or_admin(auth.uid(), team_id))
    WITH CHECK (is_team_coach_or_admin(auth.uid(), team_id));

-- Conversations policies
CREATE POLICY conversations_select_visible ON conversations
    FOR SELECT
    USING (
        (type = 'direct' AND is_conversation_participant(auth.uid(), id))
        OR (type = 'team' AND is_team_member(auth.uid(), team_id))
    );

CREATE POLICY conversations_insert_creator ON conversations
    FOR INSERT
    WITH CHECK (
        created_by = auth.uid()
        AND (
            type = 'direct'
            OR (type = 'team' AND is_team_member(auth.uid(), team_id))
        )
    );

-- Conversation participants policies (direct conversations only)
CREATE POLICY conversation_participants_select ON conversation_participants
    FOR SELECT
    USING (is_conversation_participant(auth.uid(), conversation_id));

CREATE POLICY conversation_participants_insert_creator ON conversation_participants
    FOR INSERT
    WITH CHECK (
        is_direct_conversation(conversation_id)
        AND (
            auth.uid() = (SELECT created_by FROM conversations WHERE id = conversation_id)
        )
        AND (
            user_id = auth.uid()
            OR can_direct_message(auth.uid(), user_id)
        )
    );

-- Conversation messages policies
CREATE POLICY conversation_messages_select ON conversation_messages
    FOR SELECT
    USING (
        (
            is_direct_conversation(conversation_id)
            AND is_conversation_participant(auth.uid(), conversation_id)
        )
        OR (
            NOT is_direct_conversation(conversation_id)
            AND is_team_member(auth.uid(), (SELECT team_id FROM conversations WHERE id = conversation_id))
        )
    );

CREATE POLICY conversation_messages_insert ON conversation_messages
    FOR INSERT
    WITH CHECK (
        sender_id = auth.uid()
        AND (
            (
                is_direct_conversation(conversation_id)
                AND is_conversation_participant(auth.uid(), conversation_id)
            )
            OR (
                NOT is_direct_conversation(conversation_id)
                AND is_team_member(auth.uid(), (SELECT team_id FROM conversations WHERE id = conversation_id))
            )
        )
    );

CREATE POLICY conversation_messages_update_sender ON conversation_messages
    FOR UPDATE
    USING (sender_id = auth.uid());

-- Direct conversation pairs policies
CREATE POLICY direct_pairs_select ON direct_conversation_pairs
    FOR SELECT
    USING (auth.uid() = user1_id OR auth.uid() = user2_id);

CREATE POLICY direct_pairs_insert ON direct_conversation_pairs
    FOR INSERT
    WITH CHECK (
        created_by = auth.uid()
        AND (auth.uid() = user1_id OR auth.uid() = user2_id)
        AND can_direct_message(auth.uid(), CASE WHEN auth.uid() = user1_id THEN user2_id ELSE user1_id END)
    );

-- Conversation last seen policies
CREATE POLICY conversation_last_seen_select ON conversation_last_seen
    FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY conversation_last_seen_upsert ON conversation_last_seen
    FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE conversations IS 'Team and direct conversations for messaging';
COMMENT ON TABLE conversation_messages IS 'Message bodies for conversations';
COMMENT ON TABLE direct_conversation_pairs IS 'Enforces uniqueness for direct conversations';
