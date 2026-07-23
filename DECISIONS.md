# DECISIONS.md - L'Alliée Virtuelle
## Arbitrages critiques validés - Étape 0

**Date:** 8 juillet 2026  
**Statut:** ✅ VALIDÉ  
**Version:** 1.0

---

## 📋 Résumé exécutif

| # | Arbitrage | Décision |
|---|-----------|----------|
| 1 | **Statut final unique** | Déclarée → En cours → Terminée → Confirmée |
| 2 | **Définition des KPI** | Les deux comptent séparément (taux termination vs taux validation) |
| 3 | **Notes vs Commentaires** | Notes = admin seul \| Commentaires = employé visible |
| 4 | **Messagerie privée** | Non - Conversations privées totalement fermées aux admins |
| 5 | **Assistant IA** | API externe (Mistral.ai) - Dépendance externe |
| 6 | **Modèle de données** | Approche hybride - 12-15 tables bien dimensionnées |
| 7 | **Partage de dossier** | Droits d'accès granulaires (sélectionner employés + permissions) |

---

## 1️⃣ Statut final unique

### Workflow complet des statuts

```
Déclarée → En cours → Terminée → Confirmée
```

### Explication

- **Déclarée** : Tâche envoyée par l'admin, visible et sélectionnable par l'employé
- **En cours** : Employé a démarré le chrono, travaille activement
- **Terminée** : Employé a arrêté le chrono, marque la tâche complétée (auto-déclaration)
- **Confirmée** : Admin a validé le travail, tâche finalisée (état final)

### Règles d'implémentation

- Chaque transition doit être tracée dans l'historique avec timestamp et responsable
- Transitions possibles :
  - Déclarée → En cours (employé au démarrage du chrono)
  - En cours → Terminée (employé à l'arrêt du chrono)
  - Terminée → Confirmée (admin confirme)
  - Terminée → En cours (employé redémarre le chrono)
  - Confirmée → (FINAL - pas de retour)
- Les admins peuvent renvoyez une tâche Terminée au statut En cours avec motif
- Pas de passage direct d'un statut à l'autre en dehors de ce workflow

---

## 2️⃣ Définition des KPI

### Les deux comptent séparément

**Taux de TERMINATION** (employé) :
- Nombre tâches passées au statut "Terminée" / Nombre tâches assignées
- Mesure l'activité/débit de l'employé
- Affiché sur le dashboard employé

**Taux de VALIDATION** (admin) :
- Nombre tâches passées au statut "Confirmée" / Nombre tâches assignées
- Mesure la qualité du travail reconnu
- Affiché sur le dashboard admin

### Impact critique : Où s'appliquent ces KPI

1. **Dashboard Admin** (Suivi en temps réel)
   - Tâches complétées = tâches Confirmées uniquement
   - % complétion = (Confirmées / Total) × 100

2. **Statistiques de l'équipe** (Page Stats)
   - Graphique "Tâches complétées par jour" = Confirmées
   - Taux de complétion = (Confirmées / assignées) × 100
   - Tableau par employé : colonne "% complétion" = (Confirmées / assignées) × 100

3. **Export CSV/PDF**
   - Export reprend les mêmes définitions que les statistiques
   - Colonne "Tâches complétées" = Confirmées

4. **Assistant IA**
   - "Qui a les plus complétées ?" = qui a le plus de Confirmées
   - "Résume l'activité" = affiche Confirmées comme métrique principale

5. **Détail employé** (panneau latéral)
   - "Tâches complétées aujourd'hui" = Confirmées
   - "% complétion" = (Confirmées / assignées) × 100

### ⚠️ Règle d'uniformité

**IDENTIQUE partout** : stats, graphiques, exports, IA, détail employé, tableau de bord.
- Une seule définition de "complétée" dans la DB (table tasks.status = 'CONFIRMED')
- Un seul calcul de KPI = fonction réutilisable dans tous les services

---

## 3️⃣ Notes internes vs Commentaires

### Visibilité

**Notes internes** (admin seul) :
- Visibles : Administrateur uniquement
- Invisibles : Employé
- Espace : "Ajouter une note" sur la tâche
- Cas d'usage : Observations privées, flags internes, contexte admin

**Commentaires** (visibles à l'employé) :
- Visibles : Administrateur + Employé assigné
- Marqués clairement "Commentaire visible par l'employé"
- Espace : "Ajouter un commentaire" sur la tâche
- Cas d'usage : Demandes de correction, feedback, instructions

### Implémentation

**Table tasks_comments :**
```sql
CREATE TABLE task_comments (
  id UUID PRIMARY KEY,
  task_id UUID FOREIGN KEY,
  author_id UUID FOREIGN KEY (user),
  content TEXT,
  type ENUM('NOTE', 'COMMENT'),  -- ← distinction
  created_at TIMESTAMP,
  is_visible_to_employee BOOLEAN  -- TRUE pour COMMENT, FALSE pour NOTE
);
```

**Affichage sur la page tâche :**
- Zone "Notes" (seul admin voit)
- Zone "Commentaires" (admin + employé voient)

**API restrictions :**
- Employé ne peut pas lire les notes (GET /tasks/:id/notes retourne 403)
- Employé ne peut pas créer de notes (POST /tasks/:id/notes retourne 403)

---

## 4️⃣ Messagerie privée - Permissions

### Non - Conversations privées totalement fermées aux admins

**Règle simple :**
- Conversations **employé ↔ employé** : fermées aux admins (pas d'accès au contenu)
- Conversations **admin ↔ employé** : toujours accessibles à l'admin
- Conversations **admin ↔ admin** : visibles entre eux

**Ce que l'admin PEUT faire :**
- Lire conversations avec ses employés
- Envoyer des messages privés à un employé
- Envoyer le même message à plusieurs employés (créé une conversation privée par employé, sans révéler la liste)

**Ce que l'admin NE PEUT PAS faire :**
- Lire une conversation entre deux employés
- Lire les messages avant qu'il n'en soit partie prenante

### Traçabilité

Audit log conservé pour chaque conversation :
- Qui a envoyé
- Quand
- À qui
- Pas le contenu des messages employé↔employé

---

## 5️⃣ Assistant IA - Architecture

### API externe (Mistral.ai) - Dépendance externe

**Configuration :**
- Appels directs à l'API Mistral.ai (mistral-api.com)
- Clé API stockée en variable d'environnement `MISTRAL_API_KEY`
- Données transmises à Mistral (données d'équipe, tâches, temps)

**Implications :**
- Dépendance réseau obligatoire (pas d'accès sans internet)
- Les données transitent par serveurs Mistral (respect RGPD à vérifier)
- Coûts d'API (comptabiliser en budget)

**Mode LECTURE SEULE obligatoire :**

L'assistant **NE PEUT PAS** :
- Créer une tâche
- Modifier une tâche
- Confirmer/valider une tâche
- Suspendre un utilisateur
- Supprimer un utilisateur
- Suppression de données

L'assistant **PEUT** :
- Analyser les données existantes
- Répondre à des questions en langage naturel
- Résumer l'activité
- Identifier les tâches bloquées
- Proposer des optimisations (conseils, pas actions)

### Gestion des réponses incertaines

Si l'assistant ne peut pas répondre :
- Ne pas inventer de données
- Répondre clairement : "Je n'ai pas assez de données pour répondre. Pouvez-vous préciser la période ou le projet ?"
- Préciser la période analysée
- Lister les éléments de données utilisés

### Historique

Toutes les conversations conservées en DB pour traçabilité.

---

## 6️⃣ Modèle de données

### Approche hybride - 12-15 tables bien dimensionnées

**Tables essentielles :**

| # | Nom | Rôle | Exemple fields |
|---|-----|------|-----------------|
| 1 | `users` | Identité utilisateurs | id, email, password_hash, full_name, role, status |
| 2 | `tasks` | Tâches | id, title, description, assigned_to, priority, status, deadline |
| 3 | `task_history` | Historique modifications | id, task_id, field_changed, old_value, new_value, changed_by, changed_at |
| 4 | `task_comments` | Notes + commentaires | id, task_id, author_id, content, type (NOTE/COMMENT), is_visible_to_employee |
| 5 | `task_attachments` | Pièces jointes | id, task_id, file_path, file_name, size, created_at |
| 6 | `timelog` | Sessions de chrono | id, task_id, employee_id, start_time, end_time, duration_seconds |
| 7 | `messages` | Messagerie | id, author_id, content, channel_type (GLOBAL/PRIVATE), recipient_id, created_at |
| 8 | `message_conversations` | Conversations privées | id, participant1_id, participant2_id, last_message_at |
| 9 | `resources_folders` | Dossiers ressources | id, name, parent_folder_id, type (INTERNAL/CLIENT), created_by |
| 10 | `resources_files` | Fichiers | id, folder_id, file_name, file_path, file_type, size, created_by |
| 11 | `resources_shares` | Partages de dossiers | id, folder_id, shared_with_user_id, permission_type, expires_at |
| 12 | `audit_log` | Audit trail | id, user_id, action, entity_type, entity_id, details, timestamp |
| 13 | `user_daily_selection` | Sélection tâches du jour | id, user_id, task_id, selected_order, validated_at, date |
| 14 | `ai_conversations` | Historique assistant IA | id, admin_id, question, answer, context_data, created_at |

**Pas de tables supplémentaires recommandées** → couverture complète

### Relations clés

```
users (1) ──────── (N) tasks
users (1) ──────── (N) timelog
tasks (1) ──────── (N) task_comments
tasks (1) ──────── (N) task_attachments
tasks (1) ──────── (N) task_history
messages (N) ────── (N) users (via author_id, recipient_id)
resources_folders (1) ── (N) resources_files
resources_folders (1) ── (N) resources_shares
```

---

## 7️⃣ Partage de dossier

### Droits d'accès granulaires

**Fonctionnalité :**
- Admin sélectionne un dossier dans Gestion des ressources
- Clique "Partager"
- Interface : sélectionner employés + permission (LECTURE, LECTURE_ÉCRITURE, LECTURE_SEULE)
- Sauvegarde dans `resources_shares` table

**Permissions :**
- **LECTURE_SEULE** : Employé peut voir et télécharger
- **LECTURE_ÉCRITURE** : Employé peut voir, télécharger ET upload de fichiers

**Visibilité employé :**
- Employé voit "Ressources partagées" onglet si au moins 1 dossier partagé
- Affiche les dossiers partagés avec lui
- Respect des permissions lors de l'affichage

**Audit trail :**
- Qui a partagé
- Avec qui
- Quand
- Permissions accordées
- Révocation d'accès tracée

### Implémentation

Table `resources_shares` :
```sql
CREATE TABLE resources_shares (
  id UUID PRIMARY KEY,
  folder_id UUID FOREIGN KEY,
  shared_with_user_id UUID FOREIGN KEY,
  permission_type ENUM('LECTURE_SEULE', 'LECTURE_ÉCRITURE'),
  shared_by_user_id UUID,
  created_at TIMESTAMP,
  expires_at TIMESTAMP NULL  -- optionnel, partage limité dans le temps
);
```

---

## 🚀 Feuille de route impact

Les arbitrages orientent la priorité de développement :

| Étape | Durée | Impacté par |
|-------|-------|-----------|
| **1 - Tech setup** | 2-4h | Schéma DB hybride (arbitrage 6) |
| **2 - Auth & comptes** | 5-7j | Aucun (standard) |
| **3 - Backend noyau** | 7-10j | Workflow statuts (1), KPI (2), timelog (audité) |
| **4 - Frontend noyau** | 7-10j | Affichage notes/commentaires (3), workflow UI |
| **5 - Compléments** | 10-14j | Messagerie (4), partage (7), IA (5) |
| **6 - IA optionnel** | 5-7j | Architecture Mistral (5) |
| **7 - Tests & deploy** | 7-10j | Tous les arbitrages (test d'uniformité KPI notamment) |

---

## 📝 Prochaines étapes

1. **Étape 1** - Mise en place technique (2-4h)
   - ✅ Créer Git + dépôt
   - ✅ Setup Node.js + Express
   - ✅ PostgreSQL + schéma 14 tables
   - ✅ Hello World API

2. **Étape 2** - Auth & gestion comptes (5-7j)

3. **Étape 3** - Backend noyau tâches + chrono

4. ... et ainsi de suite

---

**Document validé et prêt pour le développement.**  
*Aucune modification sans nouvelle validation du projet.*
