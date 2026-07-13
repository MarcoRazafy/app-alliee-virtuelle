-- L'Alliée Virtuelle - Lot B "type ClickUp"
-- Migration additive : ne modifie jamais init.sql, 100% rétrocompatible.
-- À exécuter après init.sql (et les autres seeds existants) :
--   psql -U postgres -h localhost -d alliee_virtuelle -f migrations/002_clickup_features.sql

-- ===== MOD 1 : users enrichis (inscription + login par username) =====

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS last_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS username VARCHAR(50),
  ADD COLUMN IF NOT EXISTS postal_address TEXT,
  ADD COLUMN IF NOT EXISTS birth_date DATE;

-- NULL ne viole jamais UNIQUE : les futurs comptes sans username restent possibles
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL;

-- Backfill : dérive un username depuis l'email pour les comptes déjà existants,
-- en gérant les collisions (ex: deux "marie@..." -> marie, marie_2)
DO $$
DECLARE
  u RECORD;
  base_username TEXT;
  candidate TEXT;
  suffix INT;
BEGIN
  FOR u IN SELECT id, email FROM users WHERE username IS NULL ORDER BY created_at ASC LOOP
    base_username := LOWER(REGEXP_REPLACE(SPLIT_PART(u.email, '@', 1), '[^a-z0-9]', '_', 'g'));
    candidate := base_username;
    suffix := 1;
    WHILE EXISTS (SELECT 1 FROM users WHERE username = candidate) LOOP
      suffix := suffix + 1;
      candidate := base_username || '_' || suffix;
    END LOOP;
    UPDATE users SET username = candidate WHERE id = u.id;
  END LOOP;
END $$;

-- ===== MOD 3 : hiérarchie de tâches Space -> Folder -> List -> Task -> Subtask =====

CREATE TABLE IF NOT EXISTS task_spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  description TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS task_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES task_spaces(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS task_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID NOT NULL REFERENCES task_folders(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Nullable : les tâches existantes (et futures tâches "libres") restent valides
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS list_id UUID REFERENCES task_lists(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_tasks_list_id ON tasks(list_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id);
