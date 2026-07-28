-- Description libre du profil (bio / présentation) pour chaque utilisateur (employé et admin).
ALTER TABLE users ADD COLUMN IF NOT EXISTS description text;
