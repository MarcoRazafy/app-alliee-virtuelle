-- Tables historiquement créées à la main (jamais capturées en migration) : on les ajoute
-- ici pour qu'une base fraîche (bâtie uniquement depuis les migrations) soit complète.
-- Idempotent : sans effet sur les bases qui les possèdent déjà.

CREATE TABLE IF NOT EXISTS extra_task_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  date date NOT NULL,
  status varchar(20) DEFAULT 'PENDING' NOT NULL,
  message text,
  admin_note text,
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT extra_task_requests_status_check CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED'))
);
CREATE INDEX IF NOT EXISTS idx_extra_task_requests_status ON extra_task_requests (status);
CREATE INDEX IF NOT EXISTS idx_extra_task_requests_user_date ON extra_task_requests (user_id, date);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_extra_task_requests_pending
  ON extra_task_requests (user_id, task_id, date) WHERE status = 'PENDING';

CREATE TABLE IF NOT EXISTS message_reactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji varchar(16) NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT message_reactions_message_id_user_id_emoji_key UNIQUE (message_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions (message_id);
