ALTER TABLE resources_folders
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_resources_folders_deleted_at
  ON resources_folders(deleted_at)
  WHERE deleted_at IS NOT NULL;

ALTER TABLE resources_files
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_resources_files_deleted_at
  ON resources_files(deleted_at)
  WHERE deleted_at IS NOT NULL;
