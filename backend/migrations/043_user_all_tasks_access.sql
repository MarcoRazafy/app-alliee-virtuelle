ALTER TABLE users ADD COLUMN IF NOT EXISTS can_access_all_tasks boolean NOT NULL DEFAULT false;
