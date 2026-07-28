-- Assistant IA : titre de discussion éditable + pièce jointe (photo/fichier) par échange.
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS attachment_path text;
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS attachment_name text;
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS attachment_type varchar(120);
