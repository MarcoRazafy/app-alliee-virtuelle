-- Photo (avatar) optionnelle pour un groupe de discussion.
ALTER TABLE message_groups ADD COLUMN IF NOT EXISTS avatar_path text;
