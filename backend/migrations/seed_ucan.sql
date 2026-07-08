-- L'Alliée Virtuelle - Données d'exemple pour l'utilisateur ucan.mih@gmail.com
-- À exécuter après migrations/init.sql et migrations/seed_messages_resources.sql :
--   psql -U postgres -h localhost -d alliee_virtuelle -f migrations/seed_ucan.sql

-- ===== TÂCHES =====

INSERT INTO tasks (title, description, assigned_to, created_by, priority, status, deadline, start_date)
SELECT 'Vérifier les factures fournisseurs', 'Contrôler les factures reçues ce mois-ci avant paiement',
       (SELECT id FROM users WHERE email = 'ucan.mih@gmail.com'),
       (SELECT id FROM users WHERE email = 'admin@alliee.test'),
       'HAUTE', 'DECLAREE', CURRENT_DATE + INTERVAL '5 days', CURRENT_DATE
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE title = 'Vérifier les factures fournisseurs');

INSERT INTO tasks (title, description, assigned_to, created_by, priority, status, deadline, start_date)
SELECT 'Réviser le plan marketing', 'Mettre à jour le plan marketing du trimestre',
       (SELECT id FROM users WHERE email = 'ucan.mih@gmail.com'),
       (SELECT id FROM users WHERE email = 'admin@alliee.test'),
       'NORMALE', 'VALIDEE', CURRENT_DATE + INTERVAL '3 days', CURRENT_DATE
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE title = 'Réviser le plan marketing');

INSERT INTO tasks (title, description, assigned_to, created_by, priority, status, deadline, start_date)
SELECT 'Répondre aux tickets support', 'Traiter les tickets ouverts dans la file support',
       (SELECT id FROM users WHERE email = 'ucan.mih@gmail.com'),
       (SELECT id FROM users WHERE email = 'admin@alliee.test'),
       'URGENT', 'VALIDEE', CURRENT_DATE + INTERVAL '1 day', CURRENT_DATE
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE title = 'Répondre aux tickets support');

INSERT INTO tasks (title, description, assigned_to, created_by, priority, status, deadline, start_date)
SELECT 'Corriger l''affichage mobile', 'Le menu ne s''affiche pas correctement sur petits écrans',
       (SELECT id FROM users WHERE email = 'ucan.mih@gmail.com'),
       (SELECT id FROM users WHERE email = 'admin@alliee.test'),
       'URGENT', 'EN_COURS', CURRENT_DATE + INTERVAL '2 days', CURRENT_DATE - INTERVAL '1 day'
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE title = 'Corriger l''affichage mobile');

INSERT INTO tasks (title, description, assigned_to, created_by, priority, status, deadline, start_date)
SELECT 'Préparer la démo produit', 'Slides et scénario pour la démo client de fin de mois',
       (SELECT id FROM users WHERE email = 'ucan.mih@gmail.com'),
       (SELECT id FROM users WHERE email = 'admin@alliee.test'),
       'FAIBLE', 'DECLAREE', CURRENT_DATE + INTERVAL '10 days', CURRENT_DATE
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE title = 'Préparer la démo produit');

-- ===== MESSAGERIE =====

INSERT INTO message_conversations (participant1_id, participant2_id, last_message_at)
SELECT
  (SELECT id FROM users WHERE email = 'admin@alliee.test'),
  (SELECT id FROM users WHERE email = 'ucan.mih@gmail.com'),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM message_conversations
  WHERE (participant1_id = (SELECT id FROM users WHERE email = 'admin@alliee.test')
         AND participant2_id = (SELECT id FROM users WHERE email = 'ucan.mih@gmail.com'))
     OR (participant1_id = (SELECT id FROM users WHERE email = 'ucan.mih@gmail.com')
         AND participant2_id = (SELECT id FROM users WHERE email = 'admin@alliee.test'))
);

INSERT INTO messages (author_id, recipient_id, content, channel_type, is_read)
SELECT
  (SELECT id FROM users WHERE email = 'admin@alliee.test'),
  (SELECT id FROM users WHERE email = 'ucan.mih@gmail.com'),
  'Bienvenue dans l''équipe !', 'PRIVATE', FALSE
WHERE NOT EXISTS (SELECT 1 FROM messages WHERE content = 'Bienvenue dans l''équipe !');

INSERT INTO messages (author_id, recipient_id, content, channel_type, is_read)
SELECT
  (SELECT id FROM users WHERE email = 'admin@alliee.test'),
  (SELECT id FROM users WHERE email = 'ucan.mih@gmail.com'),
  'Ton compte est activé, tu peux commencer à travailler sur tes tâches.', 'PRIVATE', FALSE
WHERE NOT EXISTS (SELECT 1 FROM messages WHERE content = 'Ton compte est activé, tu peux commencer à travailler sur tes tâches.');
