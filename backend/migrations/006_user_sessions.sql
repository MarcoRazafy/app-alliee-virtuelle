-- L'Alliée Virtuelle - Chrono de connexion (présence)
-- Migration additive : ne modifie jamais init.sql, 100% rétrocompatible.
-- Indépendant du chrono de tâche (table timelog) : celui-ci suit uniquement les
-- périodes de connexion (login -> déconnexion/fermeture) de l'utilisateur.
-- À exécuter après les migrations précédentes :
--   psql -U postgres -h localhost -d alliee_virtuelle -f migrations/006_user_sessions.sql

CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    login_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    logout_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_login_at ON user_sessions(login_at);
