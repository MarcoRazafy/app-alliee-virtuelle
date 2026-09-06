-- Marque « modifié » d'un commentaire de tâche.
--
-- La table possède déjà updated_at, mais il est renseigné dès la création : il ne permet pas
-- de distinguer un message jamais modifié d'un message corrigé. On ajoute donc une colonne
-- dédiée, laissée à NULL tant qu'aucune modification n'a eu lieu — même convention que
-- messages.edited_at dans la messagerie.
ALTER TABLE task_comments
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
