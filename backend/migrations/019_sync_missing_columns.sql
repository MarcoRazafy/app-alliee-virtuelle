-- Colonnes ajoutées « à la main » en dev pendant le développement (pièces jointes / édition /
-- suppression de messages, photo de groupe, titre + pièce jointe de l'assistant IA, corbeille
-- des pièces jointes de tâches) mais JAMAIS capturées en migration. Une base fraîche (bâtie
-- uniquement depuis les migrations, ex. la prod) ne les avait donc pas → erreurs 500.
-- Idempotent (ADD COLUMN IF NOT EXISTS) : sans effet sur les bases qui les possèdent déjà.

-- messages : pièces jointes + édition + suppression
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_name text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_path text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_size integer;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_type varchar(120);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- message_groups : photo de groupe
ALTER TABLE message_groups ADD COLUMN IF NOT EXISTS avatar_path text;

-- ai_conversations : titre de session + pièce jointe (assistant IA)
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS attachment_name text;
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS attachment_path text;
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS attachment_type varchar(120);

-- task_attachments : corbeille (suppression douce)
ALTER TABLE task_attachments ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE task_attachments ADD COLUMN IF NOT EXISTS deleted_by uuid;
