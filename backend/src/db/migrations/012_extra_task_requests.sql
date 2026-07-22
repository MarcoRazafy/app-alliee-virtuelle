-- Demandes de tâche supplémentaire.
-- Quand un employé a déjà VALIDÉ sa journée mais veut travailler une tâche de plus,
-- il choisit une tâche précise et en fait la demande. L'admin approuve ou refuse.
-- À l'approbation, la tâche est ajoutée à la sélection du jour de l'employé (déjà validée),
-- pour qu'elle apparaisse immédiatement dans « Mes tâches aujourd'hui ».

CREATE TABLE IF NOT EXISTS extra_task_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  date date NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  message text,        -- motif optionnel écrit par l'employé
  admin_note text,     -- motif optionnel du refus par l'admin
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_extra_task_requests_status ON extra_task_requests(status);
CREATE INDEX IF NOT EXISTS idx_extra_task_requests_user_date ON extra_task_requests(user_id, date);

-- Une seule demande EN ATTENTE par (employé, tâche, jour) : empêche les doublons de demande.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_extra_task_requests_pending
  ON extra_task_requests(user_id, task_id, date)
  WHERE status = 'PENDING';
