-- L'Alliée Virtuelle - Données d'exemple pour messagerie et ressources
-- À exécuter après migrations/init.sql :
--   psql -U postgres -h localhost -d alliee_virtuelle -f migrations/seed_messages_resources.sql

-- ===== MESSAGERIE =====

-- Chat global
INSERT INTO messages (author_id, content, channel_type)
SELECT (SELECT id FROM users WHERE email = 'admin@alliee.test'), 'Bonjour à tous, bonne journée !', 'GLOBAL'
WHERE NOT EXISTS (SELECT 1 FROM messages WHERE content = 'Bonjour à tous, bonne journée !');

INSERT INTO messages (author_id, content, channel_type)
SELECT (SELECT id FROM users WHERE email = 'admin@alliee.test'), 'Rappel : réunion d''équipe à 14h.', 'GLOBAL'
WHERE NOT EXISTS (SELECT 1 FROM messages WHERE content = 'Rappel : réunion d''équipe à 14h.');

-- Conversation privée admin <-> employee
INSERT INTO message_conversations (participant1_id, participant2_id, last_message_at)
SELECT
  (SELECT id FROM users WHERE email = 'admin@alliee.test'),
  (SELECT id FROM users WHERE email = 'employee@alliee.test'),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM message_conversations
  WHERE (participant1_id = (SELECT id FROM users WHERE email = 'admin@alliee.test')
         AND participant2_id = (SELECT id FROM users WHERE email = 'employee@alliee.test'))
     OR (participant1_id = (SELECT id FROM users WHERE email = 'employee@alliee.test')
         AND participant2_id = (SELECT id FROM users WHERE email = 'admin@alliee.test'))
);

INSERT INTO messages (author_id, recipient_id, content, channel_type, is_read)
SELECT
  (SELECT id FROM users WHERE email = 'admin@alliee.test'),
  (SELECT id FROM users WHERE email = 'employee@alliee.test'),
  'Peux-tu avancer sur le rapport mensuel ?', 'PRIVATE', FALSE
WHERE NOT EXISTS (SELECT 1 FROM messages WHERE content = 'Peux-tu avancer sur le rapport mensuel ?');

INSERT INTO messages (author_id, recipient_id, content, channel_type, is_read)
SELECT
  (SELECT id FROM users WHERE email = 'admin@alliee.test'),
  (SELECT id FROM users WHERE email = 'employee@alliee.test'),
  'N''hésite pas si tu as des questions.', 'PRIVATE', FALSE
WHERE NOT EXISTS (SELECT 1 FROM messages WHERE content = 'N''hésite pas si tu as des questions.');

-- ===== RESSOURCES =====

INSERT INTO resources_folders (name, type, created_by)
SELECT 'Marco', 'INTERNE', (SELECT id FROM users WHERE email = 'admin@alliee.test')
WHERE NOT EXISTS (SELECT 1 FROM resources_folders WHERE name = 'Marco' AND type = 'INTERNE');

INSERT INTO resources_folders (name, type, created_by)
SELECT 'Processus internes', 'INTERNE', (SELECT id FROM users WHERE email = 'admin@alliee.test')
WHERE NOT EXISTS (SELECT 1 FROM resources_folders WHERE name = 'Processus internes' AND type = 'INTERNE');

INSERT INTO resources_folders (name, type, created_by)
SELECT 'Guides', 'INTERNE', (SELECT id FROM users WHERE email = 'admin@alliee.test')
WHERE NOT EXISTS (SELECT 1 FROM resources_folders WHERE name = 'Guides' AND type = 'INTERNE');

INSERT INTO resources_folders (name, type, created_by)
SELECT 'Client A', 'CLIENT', (SELECT id FROM users WHERE email = 'admin@alliee.test')
WHERE NOT EXISTS (SELECT 1 FROM resources_folders WHERE name = 'Client A' AND type = 'CLIENT');

INSERT INTO resources_files (folder_id, file_name, file_path, file_type, file_size, created_by)
SELECT
  (SELECT id FROM resources_folders WHERE name = 'Marco' AND type = 'INTERNE'),
  'Organigramme.pdf', '/uploads/interne/marco/organigramme.pdf', 'PDF', 245760,
  (SELECT id FROM users WHERE email = 'admin@alliee.test')
WHERE NOT EXISTS (SELECT 1 FROM resources_files WHERE file_name = 'Organigramme.pdf');

INSERT INTO resources_files (folder_id, file_name, file_path, file_type, file_size, created_by)
SELECT
  (SELECT id FROM resources_folders WHERE name = 'Marco' AND type = 'INTERNE'),
  'Charte graphique.pdf', '/uploads/interne/marco/charte-graphique.pdf', 'PDF', 1258291,
  (SELECT id FROM users WHERE email = 'admin@alliee.test')
WHERE NOT EXISTS (SELECT 1 FROM resources_files WHERE file_name = 'Charte graphique.pdf');

INSERT INTO resources_files (folder_id, file_name, file_path, file_type, file_size, created_by)
SELECT
  (SELECT id FROM resources_folders WHERE name = 'Processus internes' AND type = 'INTERNE'),
  'Onboarding.docx', '/uploads/interne/processus-internes/onboarding.docx', 'DOCX', 81920,
  (SELECT id FROM users WHERE email = 'admin@alliee.test')
WHERE NOT EXISTS (SELECT 1 FROM resources_files WHERE file_name = 'Onboarding.docx');

INSERT INTO resources_files (folder_id, file_name, file_path, file_type, file_size, created_by)
SELECT
  (SELECT id FROM resources_folders WHERE name = 'Guides' AND type = 'INTERNE'),
  'Guide chronomètre.pdf', '/uploads/interne/guides/guide-chronometre.pdf', 'PDF', 153600,
  (SELECT id FROM users WHERE email = 'admin@alliee.test')
WHERE NOT EXISTS (SELECT 1 FROM resources_files WHERE file_name = 'Guide chronomètre.pdf');

INSERT INTO resources_files (folder_id, file_name, file_path, file_type, file_size, created_by)
SELECT
  (SELECT id FROM resources_folders WHERE name = 'Client A' AND type = 'CLIENT'),
  'Contrat.pdf', '/uploads/client/client-a/contrat.pdf', 'PDF', 307200,
  (SELECT id FROM users WHERE email = 'admin@alliee.test')
WHERE NOT EXISTS (SELECT 1 FROM resources_files WHERE file_name = 'Contrat.pdf');
