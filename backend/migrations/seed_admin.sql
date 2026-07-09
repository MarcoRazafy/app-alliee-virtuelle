-- L'Alliée Virtuelle - Données d'exemple pour l'espace admin (Étape 5)
-- À exécuter après init.sql, seed_messages_resources.sql et seed_ucan.sql :
--   psql -U postgres -h localhost -d alliee_virtuelle -f migrations/seed_admin.sql
-- Mot de passe en clair pour tous les nouveaux comptes : test123

-- ===== UTILISATEURS =====

INSERT INTO users (email, password_hash, full_name, phone_number, position, role, status)
SELECT 'marie.dupont@alliee.test', '$2b$10$FNIunH.GxVxj4jaEtOMUWO2h3TQdZSaBVLaAecBnaXEUjPSuO3uv2',
       'Marie Dupont', '+33611111111', 'Comptable', 'EMPLOYEE', 'ACTIF'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'marie.dupont@alliee.test');

INSERT INTO users (email, password_hash, full_name, phone_number, position, role, status)
SELECT 'karim.haddad@alliee.test', '$2b$10$FNIunH.GxVxj4jaEtOMUWO2h3TQdZSaBVLaAecBnaXEUjPSuO3uv2',
       'Karim Haddad', '+33622222222', 'Support client', 'EMPLOYEE', 'ACTIF'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'karim.haddad@alliee.test');

INSERT INTO users (email, password_hash, full_name, phone_number, position, role, status)
SELECT 'sophie.martin@alliee.test', '$2b$10$FNIunH.GxVxj4jaEtOMUWO2h3TQdZSaBVLaAecBnaXEUjPSuO3uv2',
       'Sophie Martin', '+33633333333', 'Designer', 'EMPLOYEE', 'ACTIF'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'sophie.martin@alliee.test');

-- Demandes d'accès en attente
INSERT INTO users (email, password_hash, full_name, phone_number, position, role, status)
SELECT 'julien.petit@alliee.test', '$2b$10$FNIunH.GxVxj4jaEtOMUWO2h3TQdZSaBVLaAecBnaXEUjPSuO3uv2',
       'Julien Petit', '+33644444444', 'Développeur', 'EMPLOYEE', 'EN_ATTENTE'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'julien.petit@alliee.test');

INSERT INTO users (email, password_hash, full_name, phone_number, position, role, status)
SELECT 'lea.bernard@alliee.test', '$2b$10$FNIunH.GxVxj4jaEtOMUWO2h3TQdZSaBVLaAecBnaXEUjPSuO3uv2',
       'Léa Bernard', '+33655555555', 'Marketing', 'EMPLOYEE', 'EN_ATTENTE'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'lea.bernard@alliee.test');

-- Compte suspendu
INSERT INTO users (email, password_hash, full_name, phone_number, position, role, status)
SELECT 'thomas.roux@alliee.test', '$2b$10$FNIunH.GxVxj4jaEtOMUWO2h3TQdZSaBVLaAecBnaXEUjPSuO3uv2',
       'Thomas Roux', '+33666666666', 'Commercial', 'EMPLOYEE', 'SUSPENDU'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'thomas.roux@alliee.test');

-- ===== TÂCHES (10, statuts variés, 3 en retard) =====

-- Marie Dupont
INSERT INTO tasks (title, description, assigned_to, created_by, priority, status, deadline, start_date)
SELECT 'Clôturer les comptes du mois précédent', 'Clôture comptable et rapprochement bancaire',
       (SELECT id FROM users WHERE email = 'marie.dupont@alliee.test'),
       (SELECT id FROM users WHERE email = 'admin@alliee.test'),
       'HAUTE', 'TERMINEE', CURRENT_DATE - INTERVAL '4 days', CURRENT_DATE - INTERVAL '6 days'
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE title = 'Clôturer les comptes du mois précédent');

INSERT INTO tasks (title, description, assigned_to, created_by, priority, status, deadline, start_date)
SELECT 'Préparer la déclaration TVA', 'Déclaration trimestrielle à transmettre au service des impôts',
       (SELECT id FROM users WHERE email = 'marie.dupont@alliee.test'),
       (SELECT id FROM users WHERE email = 'admin@alliee.test'),
       'URGENT', 'EN_COURS', CURRENT_DATE - INTERVAL '2 days', CURRENT_DATE - INTERVAL '3 days'
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE title = 'Préparer la déclaration TVA');

INSERT INTO tasks (title, description, assigned_to, created_by, priority, status, deadline, start_date)
SELECT 'Vérifier les notes de frais', 'Contrôle des notes de frais de l''équipe commerciale',
       (SELECT id FROM users WHERE email = 'marie.dupont@alliee.test'),
       (SELECT id FROM users WHERE email = 'admin@alliee.test'),
       'NORMALE', 'CONFIRMEE', CURRENT_DATE - INTERVAL '8 days', CURRENT_DATE - INTERVAL '10 days'
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE title = 'Vérifier les notes de frais');

-- Karim Haddad
INSERT INTO tasks (title, description, assigned_to, created_by, priority, status, deadline, start_date)
SELECT 'Traiter les tickets urgents', 'File de tickets support prioritaires en retard',
       (SELECT id FROM users WHERE email = 'karim.haddad@alliee.test'),
       (SELECT id FROM users WHERE email = 'admin@alliee.test'),
       'URGENT', 'EN_COURS', CURRENT_DATE - INTERVAL '3 days', CURRENT_DATE - INTERVAL '4 days'
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE title = 'Traiter les tickets urgents');

INSERT INTO tasks (title, description, assigned_to, created_by, priority, status, deadline, start_date)
SELECT 'Mettre à jour la FAQ', 'Ajouter les nouvelles questions fréquentes du support',
       (SELECT id FROM users WHERE email = 'karim.haddad@alliee.test'),
       (SELECT id FROM users WHERE email = 'admin@alliee.test'),
       'NORMALE', 'VALIDEE', CURRENT_DATE + INTERVAL '5 days', CURRENT_DATE
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE title = 'Mettre à jour la FAQ');

INSERT INTO tasks (title, description, assigned_to, created_by, priority, status, deadline, start_date)
SELECT 'Former le nouvel arrivant', 'Session de formation sur les outils support',
       (SELECT id FROM users WHERE email = 'karim.haddad@alliee.test'),
       (SELECT id FROM users WHERE email = 'admin@alliee.test'),
       'FAIBLE', 'DECLAREE', CURRENT_DATE + INTERVAL '8 days', CURRENT_DATE
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE title = 'Former le nouvel arrivant');

-- Sophie Martin
INSERT INTO tasks (title, description, assigned_to, created_by, priority, status, deadline, start_date)
SELECT 'Créer les visuels campagne', 'Bannières et visuels réseaux sociaux pour la campagne de rentrée',
       (SELECT id FROM users WHERE email = 'sophie.martin@alliee.test'),
       (SELECT id FROM users WHERE email = 'admin@alliee.test'),
       'HAUTE', 'VALIDEE', CURRENT_DATE + INTERVAL '3 days', CURRENT_DATE
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE title = 'Créer les visuels campagne');

INSERT INTO tasks (title, description, assigned_to, created_by, priority, status, deadline, start_date)
SELECT 'Réviser la charte graphique', 'Harmoniser les couleurs et typographies sur tous les supports',
       (SELECT id FROM users WHERE email = 'sophie.martin@alliee.test'),
       (SELECT id FROM users WHERE email = 'admin@alliee.test'),
       'NORMALE', 'TERMINEE', CURRENT_DATE + INTERVAL '6 days', CURRENT_DATE - INTERVAL '2 days'
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE title = 'Réviser la charte graphique');

INSERT INTO tasks (title, description, assigned_to, created_by, priority, status, deadline, start_date)
SELECT 'Concevoir le nouveau logo', 'Refonte du logo pour le lancement de marque',
       (SELECT id FROM users WHERE email = 'sophie.martin@alliee.test'),
       (SELECT id FROM users WHERE email = 'admin@alliee.test'),
       'HAUTE', 'CONFIRMEE', CURRENT_DATE + INTERVAL '2 days', CURRENT_DATE - INTERVAL '5 days'
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE title = 'Concevoir le nouveau logo');

INSERT INTO tasks (title, description, assigned_to, created_by, priority, status, deadline, start_date)
SELECT 'Maquettes application mobile', 'Wireframes et maquettes haute-fidélité pour l''app mobile',
       (SELECT id FROM users WHERE email = 'sophie.martin@alliee.test'),
       (SELECT id FROM users WHERE email = 'admin@alliee.test'),
       'FAIBLE', 'DECLAREE', CURRENT_DATE + INTERVAL '12 days', CURRENT_DATE
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE title = 'Maquettes application mobile');

-- ===== SESSIONS TIMELOG (dont 2 actives) =====

-- Sessions actives (end_time IS NULL) sur les 2 tâches EN_COURS
INSERT INTO timelog (task_id, employee_id, start_time)
SELECT (SELECT id FROM tasks WHERE title = 'Préparer la déclaration TVA'),
       (SELECT id FROM users WHERE email = 'marie.dupont@alliee.test'),
       now() - INTERVAL '45 minutes'
WHERE NOT EXISTS (
  SELECT 1 FROM timelog WHERE task_id = (SELECT id FROM tasks WHERE title = 'Préparer la déclaration TVA') AND end_time IS NULL
);

INSERT INTO timelog (task_id, employee_id, start_time)
SELECT (SELECT id FROM tasks WHERE title = 'Traiter les tickets urgents'),
       (SELECT id FROM users WHERE email = 'karim.haddad@alliee.test'),
       now() - INTERVAL '20 minutes'
WHERE NOT EXISTS (
  SELECT 1 FROM timelog WHERE task_id = (SELECT id FROM tasks WHERE title = 'Traiter les tickets urgents') AND end_time IS NULL
);

-- Sessions terminées, pour les tâches TERMINEE / CONFIRMEE
INSERT INTO timelog (task_id, employee_id, start_time, end_time, duration_seconds)
SELECT (SELECT id FROM tasks WHERE title = 'Clôturer les comptes du mois précédent'),
       (SELECT id FROM users WHERE email = 'marie.dupont@alliee.test'),
       now() - INTERVAL '2 days 3 hours', now() - INTERVAL '2 days', 10800
WHERE NOT EXISTS (SELECT 1 FROM timelog WHERE task_id = (SELECT id FROM tasks WHERE title = 'Clôturer les comptes du mois précédent'));

INSERT INTO timelog (task_id, employee_id, start_time, end_time, duration_seconds)
SELECT (SELECT id FROM tasks WHERE title = 'Vérifier les notes de frais'),
       (SELECT id FROM users WHERE email = 'marie.dupont@alliee.test'),
       now() - INTERVAL '9 days 2 hours', now() - INTERVAL '9 days', 7200
WHERE NOT EXISTS (SELECT 1 FROM timelog WHERE task_id = (SELECT id FROM tasks WHERE title = 'Vérifier les notes de frais'));

INSERT INTO timelog (task_id, employee_id, start_time, end_time, duration_seconds)
SELECT (SELECT id FROM tasks WHERE title = 'Réviser la charte graphique'),
       (SELECT id FROM users WHERE email = 'sophie.martin@alliee.test'),
       now() - INTERVAL '1 day 4 hours', now() - INTERVAL '1 day', 14400
WHERE NOT EXISTS (SELECT 1 FROM timelog WHERE task_id = (SELECT id FROM tasks WHERE title = 'Réviser la charte graphique'));

INSERT INTO timelog (task_id, employee_id, start_time, end_time, duration_seconds)
SELECT (SELECT id FROM tasks WHERE title = 'Concevoir le nouveau logo'),
       (SELECT id FROM users WHERE email = 'sophie.martin@alliee.test'),
       now() - INTERVAL '4 days 5 hours', now() - INTERVAL '4 days', 18000
WHERE NOT EXISTS (SELECT 1 FROM timelog WHERE task_id = (SELECT id FROM tasks WHERE title = 'Concevoir le nouveau logo'));

-- ===== AUDIT LOG (quelques entrées) =====

INSERT INTO audit_log (user_id, action, entity_type, entity_id, details)
SELECT (SELECT id FROM users WHERE email = 'admin@alliee.test'), 'CREATE_TASK', 'task',
       (SELECT id FROM tasks WHERE title = 'Clôturer les comptes du mois précédent'),
       '{"seed": true}'
WHERE NOT EXISTS (
  SELECT 1 FROM audit_log WHERE action = 'CREATE_TASK'
    AND entity_id = (SELECT id FROM tasks WHERE title = 'Clôturer les comptes du mois précédent')
);

INSERT INTO audit_log (user_id, action, entity_type, entity_id, details)
SELECT (SELECT id FROM users WHERE email = 'admin@alliee.test'), 'CONFIRM_TASK', 'task',
       (SELECT id FROM tasks WHERE title = 'Vérifier les notes de frais'), NULL
WHERE NOT EXISTS (
  SELECT 1 FROM audit_log WHERE action = 'CONFIRM_TASK'
    AND entity_id = (SELECT id FROM tasks WHERE title = 'Vérifier les notes de frais')
);

INSERT INTO audit_log (user_id, action, entity_type, entity_id, details)
SELECT (SELECT id FROM users WHERE email = 'admin@alliee.test'), 'CONFIRM_TASK', 'task',
       (SELECT id FROM tasks WHERE title = 'Concevoir le nouveau logo'), NULL
WHERE NOT EXISTS (
  SELECT 1 FROM audit_log WHERE action = 'CONFIRM_TASK'
    AND entity_id = (SELECT id FROM tasks WHERE title = 'Concevoir le nouveau logo')
);
