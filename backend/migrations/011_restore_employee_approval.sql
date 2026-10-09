BEGIN;

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks
  ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('DECLAREE', 'VALIDEE', 'EN_COURS', 'TERMINEE', 'CONFIRMEE'));

UPDATE tasks
SET status = 'VALIDEE'
WHERE status = 'DECLAREE' AND created_by <> assigned_to;

COMMIT;
