-- Présence fiable : heartbeat serveur, fermeture implicite des sessions devenues inactives
-- et garantie d'une seule session ouverte par utilisateur.

ALTER TABLE user_sessions
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

ALTER TABLE user_sessions
  ADD COLUMN IF NOT EXISTS disconnect_requested_at TIMESTAMPTZ;

UPDATE user_sessions
SET last_seen_at = COALESCE(last_seen_at, logout_at, login_at)
WHERE last_seen_at IS NULL;

ALTER TABLE user_sessions
  ALTER COLUMN last_seen_at SET DEFAULT now(),
  ALTER COLUMN last_seen_at SET NOT NULL;

-- Les anciennes données peuvent contenir plusieurs sessions ouvertes pour un même compte.
-- On conserve la plus récente et on clôt les autres à leur dernière activité connue.
WITH ranked_open_sessions AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY last_seen_at DESC, login_at DESC, id DESC) AS row_number
  FROM user_sessions
  WHERE logout_at IS NULL
)
UPDATE user_sessions AS session
SET logout_at = LEAST(now(), session.last_seen_at)
FROM ranked_open_sessions AS ranked
WHERE session.id = ranked.id
  AND ranked.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_one_open_per_user
  ON user_sessions(user_id)
  WHERE logout_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_sessions_last_seen_at ON user_sessions(last_seen_at);
