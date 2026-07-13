-- L'Alliée Virtuelle - Champs client sur les tâches (style "demande client" ClickUp)
-- Migration additive : ne modifie jamais init.sql, 100% rétrocompatible.
-- À exécuter après 002_clickup_features.sql :
--   psql -U postgres -h localhost -d alliee_virtuelle -f migrations/003_client_fields.sql

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS client_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS client_email VARCHAR(255);
