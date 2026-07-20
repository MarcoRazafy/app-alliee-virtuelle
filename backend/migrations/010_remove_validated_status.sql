BEGIN;

-- Le statut VALIDEE est supprimé : une tâche envoyée est immédiatement DECLAREE
-- et peut être démarrée par l'employé.
UPDATE tasks SET status = 'DECLAREE' WHERE status = 'VALIDEE';

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks
  ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('DECLAREE', 'EN_COURS', 'TERMINEE', 'CONFIRMEE'));

COMMIT;
