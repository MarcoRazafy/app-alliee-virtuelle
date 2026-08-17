-- Sélection « Daily » d'un employé : les tâches qu'il glisse comme « faites » dans la journée.
-- Parallèle à user_daily_selection (le To Do), mais sans validation (le Daily se remplit librement).
CREATE TABLE IF NOT EXISTS user_daily_done (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  selected_order INTEGER NOT NULL,
  date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, task_id, date)
);

CREATE INDEX IF NOT EXISTS idx_user_daily_done_user_date ON user_daily_done(user_id, date);
