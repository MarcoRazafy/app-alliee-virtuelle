-- Notes internes sur un employé, visibles uniquement des admins (fiche employé).
CREATE TABLE IF NOT EXISTS user_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_id UUID REFERENCES users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_notes_user ON user_notes (user_id, created_at DESC);
