ALTER TABLE announcements ADD COLUMN IF NOT EXISTS is_important boolean NOT NULL DEFAULT false;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_announcement_pinned ON announcements (is_pinned) WHERE is_pinned;
