-- =====================================================
-- GODSPEED COMMS CENTER - DATABASE SCHEMA
-- =====================================================
-- Purpose: Secure internal messaging system for Coach-to-Parent communication
-- Features: Dual delivery (in-app + email), read tracking, reply management
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABLE: messages
-- =====================================================
-- Stores all messages sent by coaches
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('email', 'internal', 'both')),
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Metadata
    recipient_count INTEGER DEFAULT 0,
    read_count INTEGER DEFAULT 0,
    
    -- Soft delete
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    -- Indexes
    CONSTRAINT messages_sender_id_idx CHECK (sender_id IS NOT NULL)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_sent_at ON messages(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_deleted_at ON messages(deleted_at) WHERE deleted_at IS NULL;

-- =====================================================
-- TABLE: message_recipients
-- =====================================================
-- Tracks delivery and read status for each parent recipient
CREATE TABLE IF NOT EXISTS message_recipients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Status tracking
    status VARCHAR(20) NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
    
    -- Timestamps
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    delivered_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    
    -- Email tracking (for Resend webhook integration)
    email_id TEXT, -- Resend email ID
    email_opened_at TIMESTAMP WITH TIME ZONE,
    email_clicked_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one record per message-user combination
    CONSTRAINT unique_message_recipient UNIQUE (message_id, user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_recipients_message_id ON message_recipients(message_id);
CREATE INDEX IF NOT EXISTS idx_recipients_user_id ON message_recipients(user_id);
CREATE INDEX IF NOT EXISTS idx_recipients_status ON message_recipients(status);
CREATE INDEX IF NOT EXISTS idx_recipients_read_at ON message_recipients(read_at);

-- =====================================================
-- TABLE: message_replies
-- =====================================================
-- Stores 1-on-1 replies from parents to coaches (no "Reply All")
CREATE TABLE IF NOT EXISTS message_replies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    body TEXT NOT NULL,
    
    -- Read tracking for replies
    read_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Soft delete
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_replies_parent_message_id ON message_replies(parent_message_id);
CREATE INDEX IF NOT EXISTS idx_replies_sender_id ON message_replies(sender_id);
CREATE INDEX IF NOT EXISTS idx_replies_recipient_id ON message_replies(recipient_id);
CREATE INDEX IF NOT EXISTS idx_replies_created_at ON message_replies(created_at DESC);

-- =====================================================
-- FUNCTION: Update read count trigger
-- =====================================================
-- Automatically update the read_count on messages table when a recipient marks as read
CREATE OR REPLACE FUNCTION update_message_read_count()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'read' AND (OLD.status IS NULL OR OLD.status != 'read') THEN
        UPDATE messages
        SET read_count = read_count + 1,
            updated_at = NOW()
        WHERE id = NEW.message_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_read_count ON message_recipients;
CREATE TRIGGER trigger_update_read_count
    AFTER UPDATE ON message_recipients
    FOR EACH ROW
    EXECUTE FUNCTION update_message_read_count();

-- =====================================================
-- FUNCTION: Auto-update updated_at timestamp
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables
DROP TRIGGER IF EXISTS update_messages_updated_at ON messages;
CREATE TRIGGER update_messages_updated_at
    BEFORE UPDATE ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_recipients_updated_at ON message_recipients;
CREATE TRIGGER update_recipients_updated_at
    BEFORE UPDATE ON message_recipients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_replies_updated_at ON message_replies;
CREATE TRIGGER update_replies_updated_at
    BEFORE UPDATE ON message_replies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_replies ENABLE ROW LEVEL SECURITY;

-- MESSAGES POLICIES
-- Coaches can view their own sent messages
CREATE POLICY "Coaches can view their own messages"
    ON messages FOR SELECT
    USING (auth.uid() = sender_id);

-- Coaches can insert their own messages
CREATE POLICY "Coaches can send messages"
    ON messages FOR INSERT
    WITH CHECK (auth.uid() = sender_id);

-- Coaches can update their own messages
CREATE POLICY "Coaches can update their messages"
    ON messages FOR UPDATE
    USING (auth.uid() = sender_id);

-- MESSAGE_RECIPIENTS POLICIES
-- Parents can view messages sent to them
CREATE POLICY "Parents can view their messages"
    ON message_recipients FOR SELECT
    USING (auth.uid() = user_id);

-- Parents can update their own recipient records (mark as read)
CREATE POLICY "Parents can mark messages as read"
    ON message_recipients FOR UPDATE
    USING (auth.uid() = user_id);

-- Coaches can view recipients of their messages
CREATE POLICY "Coaches can view message recipients"
    ON message_recipients FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM messages
            WHERE messages.id = message_recipients.message_id
            AND messages.sender_id = auth.uid()
        )
    );

-- Coaches can insert recipients when sending messages
CREATE POLICY "Coaches can add recipients"
    ON message_recipients FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM messages
            WHERE messages.id = message_recipients.message_id
            AND messages.sender_id = auth.uid()
        )
    );

-- MESSAGE_REPLIES POLICIES
-- Users can view replies they sent or received
CREATE POLICY "Users can view their replies"
    ON message_replies FOR SELECT
    USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

-- Users can send replies
CREATE POLICY "Users can send replies"
    ON message_replies FOR INSERT
    WITH CHECK (auth.uid() = sender_id);

-- Users can update replies they received (mark as read)
CREATE POLICY "Users can mark replies as read"
    ON message_replies FOR UPDATE
    USING (auth.uid() = recipient_id);

-- =====================================================
-- HELPER VIEWS
-- =====================================================

-- View: Coach message analytics
CREATE OR REPLACE VIEW coach_message_analytics AS
SELECT 
    m.id,
    m.subject,
    m.sent_at,
    m.recipient_count,
    m.read_count,
    CASE 
        WHEN m.recipient_count > 0 
        THEN ROUND((m.read_count::NUMERIC / m.recipient_count::NUMERIC) * 100, 1)
        ELSE 0 
    END AS read_percentage,
    COUNT(mr.id) FILTER (WHERE mr.status = 'read') AS confirmed_reads,
    COUNT(mr.id) FILTER (WHERE mr.status = 'sent') AS unread
FROM messages m
LEFT JOIN message_recipients mr ON m.id = mr.message_id
GROUP BY m.id, m.subject, m.sent_at, m.recipient_count, m.read_count;

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE messages IS 'Stores all messages sent by coaches to parents';
COMMENT ON TABLE message_recipients IS 'Tracks delivery and read status for each parent recipient';
COMMENT ON TABLE message_replies IS 'Stores 1-on-1 replies from parents to coaches (no Reply All)';
COMMENT ON COLUMN message_recipients.status IS 'Message delivery status: sent, delivered, read, failed';
COMMENT ON COLUMN message_recipients.email_id IS 'Resend email ID for webhook tracking';
