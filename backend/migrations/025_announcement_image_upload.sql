-- Image uploadée (fichier sur disque) pour une annonce, en plus de l'URL externe éventuelle.
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS image_path text;
