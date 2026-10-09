ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_name text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_path text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_size integer;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_type varchar(120);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE message_groups ADD COLUMN IF NOT EXISTS avatar_path text;

ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS attachment_name text;
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS attachment_path text;
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS attachment_type varchar(120);

ALTER TABLE task_attachments ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE task_attachments ADD COLUMN IF NOT EXISTS deleted_by uuid;
