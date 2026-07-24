-- État de lecture des notifications.
-- Les événements eux-mêmes restent dans audit_log, qui demeure la source unique
-- de vérité pour l'activité de l'application.
CREATE TABLE IF NOT EXISTS notification_read_state (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    last_read_at TIMESTAMP NOT NULL DEFAULT TIMESTAMP '1970-01-01 00:00:00',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notification_read_state_last_read
    ON notification_read_state(last_read_at);
