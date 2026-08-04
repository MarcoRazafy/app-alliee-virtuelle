-- Image de bannière (URL externe) pour une annonce.
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS image_url text;
