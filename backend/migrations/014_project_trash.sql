ALTER TABLE task_lists
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_task_lists_active_folder
  ON task_lists(folder_id)
  WHERE deleted_at IS NULL;

ALTER TABLE task_spaces
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_task_spaces_active
  ON task_spaces(name)
  WHERE deleted_at IS NULL;

ALTER TABLE task_folders
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_task_folders_active_space
  ON task_folders(space_id)
  WHERE deleted_at IS NULL;
