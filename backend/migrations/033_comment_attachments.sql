-- Pièces jointes rattachées à un commentaire de tâche : permet de livrer un fichier avec
-- le message qui l'explique, au lieu de le déposer séparément.
-- Colonne nullable : une pièce jointe sans comment_id reste un fichier de la tâche, comme
-- avant. ON DELETE SET NULL — si le commentaire est supprimé, le livrable, lui, est conservé
-- et redevient simplement un fichier de la tâche.
ALTER TABLE task_attachments
  ADD COLUMN IF NOT EXISTS comment_id UUID REFERENCES task_comments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_task_attachments_comment ON task_attachments (comment_id);
