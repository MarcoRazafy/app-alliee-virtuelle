-- Réactions sur les commentaires de tâche (le « nike » ✓ : « vu », « c'est noté »).
--
-- Même forme que message_reactions dans la messagerie : une ligne par (commentaire,
-- personne, emoji), l'unicité empêchant de réagir deux fois avec le même emoji. Le
-- commentaire et les notes internes partagent la table task_comments : une seule table de
-- réactions couvre donc les deux, la visibilité des notes restant contrôlée côté serveur.
CREATE TABLE IF NOT EXISTS task_comment_reactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  comment_id uuid NOT NULL REFERENCES task_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji varchar(16) NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT task_comment_reactions_comment_user_emoji_key UNIQUE (comment_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS idx_task_comment_reactions_comment ON task_comment_reactions (comment_id);
