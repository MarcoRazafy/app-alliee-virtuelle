-- Sondages dans la messagerie : un sondage est porté par un message (message_polls.message_id),
-- avec ses options et les votes. Suppression du message → suppression en cascade du sondage.
CREATE TABLE IF NOT EXISTS message_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  allow_multiple BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_message_polls_message ON message_polls (message_id);

CREATE TABLE IF NOT EXISTS message_poll_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES message_polls(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_message_poll_options_poll ON message_poll_options (poll_id);

CREATE TABLE IF NOT EXISTS message_poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES message_polls(id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES message_poll_options(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (option_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_message_poll_votes_poll ON message_poll_votes (poll_id);
