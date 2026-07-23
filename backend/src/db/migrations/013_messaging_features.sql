-- Messagerie façon Messenger : édition, suppression douce, pièces jointes, réactions.

-- Édition / suppression douce des messages.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Une pièce jointe (image ou fichier) par message. content devient facultatif
-- (message contenant uniquement une pièce jointe).
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_path text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_name text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_type varchar(120);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_size integer;
ALTER TABLE messages ALTER COLUMN content DROP NOT NULL;

-- Réactions (emoji) sur les messages ; une réaction par (message, utilisateur, emoji).
CREATE TABLE IF NOT EXISTS message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji varchar(16) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_id);
