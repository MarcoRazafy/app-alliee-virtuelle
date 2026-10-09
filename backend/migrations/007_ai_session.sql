ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS session_id UUID;
UPDATE ai_conversations SET session_id = id WHERE session_id IS NULL;
ALTER TABLE ai_conversations ALTER COLUMN session_id SET DEFAULT gen_random_uuid();
CREATE INDEX IF NOT EXISTS idx_ai_conversations_session ON ai_conversations (admin_id, session_id);
