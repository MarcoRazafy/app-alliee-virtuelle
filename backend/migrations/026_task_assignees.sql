-- Assignation MULTIPLE : une tâche peut désormais avoir plusieurs personnes.
-- task_assignees devient la source de vérité de « qui est sur la tâche ».
-- tasks.assigned_to est conservé (= assigné « principal », toujours présent aussi dans
-- task_assignees) pour rester compatible avec le reste du code (permissions, timelog…).
CREATE TABLE IF NOT EXISTS task_assignees (
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_assignees_user ON task_assignees(user_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_task ON task_assignees(task_id);

-- Backfill : chaque tâche existante a déjà un assigned_to → on le recopie dans task_assignees.
INSERT INTO task_assignees (task_id, user_id)
SELECT id, assigned_to FROM tasks
ON CONFLICT (task_id, user_id) DO NOTHING;
