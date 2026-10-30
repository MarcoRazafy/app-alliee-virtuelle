ALTER TABLE resources_files ADD COLUMN IF NOT EXISTS blocks jsonb;

CREATE TABLE IF NOT EXISTS resource_page_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind varchar(10) NOT NULL CHECK (kind IN ('photo', 'video')),
  extension varchar(10) NOT NULL,
  file_path varchar(512) NOT NULL,
  file_size bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resource_page_uploads_user ON resource_page_uploads (user_id);
