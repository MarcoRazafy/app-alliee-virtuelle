-- Champs « Importante » (mise en avant) et « Épinglée » (une seule à la fois) pour les annonces.
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS is_important boolean NOT NULL DEFAULT false;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

-- Au plus une annonce épinglée : index partiel unique.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_announcement_pinned ON announcements (is_pinned) WHERE is_pinned;
