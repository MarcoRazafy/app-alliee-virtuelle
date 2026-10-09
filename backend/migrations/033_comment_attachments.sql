ALTER TABLE task_attachments
  ADD COLUMN IF NOT EXISTS comment_id UUID REFERENCES task_comments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_task_attachments_comment ON task_attachments (comment_id);
