BEGIN;

UPDATE tasks SET status = 'DECLAREE' WHERE status = 'VALIDEE';

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks
  ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('DECLAREE', 'EN_COURS', 'TERMINEE', 'CONFIRMEE'));

COMMIT;
