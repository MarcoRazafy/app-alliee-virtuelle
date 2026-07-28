BEGIN;

-- Les tâches admin sont déjà approuvées. Les propositions employé restent
-- DECLAREE jusqu'à l'action explicite « Valider » de l'administrateur.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks
  ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('DECLAREE', 'VALIDEE', 'EN_COURS', 'TERMINEE', 'CONFIRMEE'));

-- Requalifie les anciennes tâches déclarées créées par un autre utilisateur
-- (cas typique d'une tâche admin après l'ancienne migration 010).
UPDATE tasks
SET status = 'VALIDEE'
WHERE status = 'DECLAREE' AND created_by <> assigned_to;

COMMIT;
