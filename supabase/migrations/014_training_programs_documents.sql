-- =====================================================
-- TRAINING PROGRAMS + DOCUMENTS (Backend Source of Truth)
-- =====================================================

-- Add focus field to sessions for explicit training focus
ALTER TABLE training_sessions
ADD COLUMN IF NOT EXISTS focus TEXT;

-- Training programs catalog
CREATE TABLE IF NOT EXISTS training_programs (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    program_type VARCHAR(100),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    schedule VARCHAR(255),
    coach VARCHAR(255),
    description TEXT,
    focus JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_programs_status ON training_programs(status);

-- Training documents (program or global)
CREATE TABLE IF NOT EXISTS training_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    program_id VARCHAR(100) REFERENCES training_programs(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    doc_type VARCHAR(50),
    doc_date DATE,
    link TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_documents_program_id ON training_documents(program_id);

-- RLS
ALTER TABLE training_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY training_programs_select_all ON training_programs
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY training_documents_select_all ON training_documents
    FOR SELECT
    TO authenticated
    USING (true);
