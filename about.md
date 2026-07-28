# L'Alliée Virtuelle — Description du projet

> Document de contexte destiné à être fourni à un assistant IA (Claude). Il décrit
> l'application, sa stack, son architecture, ses fonctionnalités et ses règles métier.

## 1. Vue d'ensemble

**L'Alliée Virtuelle** est une application web de **suivi des tâches et de gestion d'équipe**.
Elle propose deux espaces distincts selon le rôle de l'utilisateur :

- **Espace employé** : chaque membre sélectionne et suit ses tâches du jour, chronomètre
  son temps de travail, déclare ses disponibilités hebdomadaires, échange avec l'équipe et
  consulte ses statistiques.
- **Espace administrateur** : pilotage temps réel de l'activité de l'équipe, création et
  validation des tâches, gestion des utilisateurs, suivi de présence/planning, statistiques
  globales et assistant IA.

L'interface est **en anglais** (les libellés visibles). ⚠️ Les **valeurs d'énumération en base
restent en français** (statuts, priorités, statuts de compte) — voir §7. Le nom de marque
« L'Alliée Virtuelle » est conservé.

## 2. Stack technique

**Backend** — Node.js / Express (port 3001)
- PostgreSQL (driver `pg`), requêtes SQL directes (pas d'ORM)
- Auth JWT (`jsonwebtoken`, expiration 7 jours), mots de passe hachés avec `bcrypt`
- Temps réel : **Socket.IO** (`socket.io`), authentifié par JWT au handshake
- Uploads de fichiers : `multer` en **stockage disque** (`backend/uploads/{avatars,resources,attachments}`)
- Sécurité : `helmet` + `express-rate-limit` (gate en production), `trust proxy`
- Dates/fuseau : `luxon`, fuseau planning par défaut `Indian/Antananarivo` (Madagascar)

**Frontend** — React 18 / Vite (port 5173 en dev)
- Routage : `react-router-dom` (v6)
- État global : `zustand` (store d'auth)
- HTTP : `axios` ; temps réel : `socket.io-client`
- Notifications toast : `react-hot-toast`
- Drag & drop : `react-dnd` (+ backend HTML5)
- Export PDF : `html2pdf.js`
- Design system maison : tokens CSS (`styles/tokens.css`), palette bleue, thème clair/sombre
  via `data-theme`, police Montserrat

**Tests** — `node:test` natif (pas de Jest/Vitest)
- Backend : tests unitaires (fonctions pures) + tests d'intégration (`supertest` sur une base
  de test séparée `alliee_virtuelle_test`)
- Frontend : tests de composants via hook esbuild qui transpile le JSX + `renderToStaticMarkup`
- État actuel : 16 unitaires + 24 intégration (backend) + 14 (frontend)

**Migrations** — runner maison `backend/scripts/migrate.js`
- `npm run migrate` applique automatiquement toutes les migrations non appliquées
- Table `schema_migrations` ; commandes `migrate:status` / `migrate:baseline`
- ~22 fichiers de migration SQL dans `backend/migrations/`

## 3. Structure du dépôt

```
app/
├── backend/
│   ├── src/
│   │   ├── routes/         ai, auditLog, auth, dashboard, hierarchy, messages,
│   │   │                   notifications, planning, resources, sessions, stats, tasks, users
│   │   ├── controllers/    logique par domaine (taskController, planningController, aiController…)
│   │   ├── models/         accès données SQL (task, user, planning, message, session, resource,
│   │   │                   hierarchy, notification, stats, ai, avatar, extraTaskRequest)
│   │   ├── middleware/      auth, validation, errorHandler
│   │   ├── realtime/        io.js (serveur Socket.IO)
│   │   ├── config/          env, database, upload/avatarUpload/resourceUpload, mistral
│   │   └── utils/           validators, planningDates, kpi…
│   ├── migrations/          *.sql + runner
│   ├── uploads/             fichiers stockés sur disque (avatars, resources, attachments)
│   └── test/                unit + integration
└── frontend/
    ├── src/
    │   ├── pages/           Login, Register, Dashboard, MyDay, MyTasks, Workspace, MyStats,
    │   │   │                Planning, Profile, Messaging, Resources, EmployeeAssistant, TaskDetail
    │   │   └── admin/       AdminDashboard, AdminListView, AdminCreateTask, AdminTasksToValidate,
    │   │                    AdminLateTasks, AdminTaskRequests, AdminUsers, AdminPlanning,
    │   │                    AdminPresence, AdminStatistics, AdminAssistant, AdminResources, AdminProfile
    │   ├── components/      partagés + admin/ + employee/ + messaging/ + resources/ + auth/
    │   ├── services/        clients API (axios) + socket.js
    │   ├── store/           authStore (zustand), themeStore
    │   ├── utils/           taskStatus, planningFormat, presenceMetrics, formatters
    │   └── styles/          tokens + feuilles par page
    └── test/                hooks esbuild + tests composants
```

## 4. Fonctionnalités — Espace employé

- **Dashboard** : aperçu du jour (tâches à faire, en cours, messages non lus, temps travaillé,
  temps de connexion), tâches urgentes, activité récente, accès rapides.
- **My day (Ma journée)** : sélection en drag & drop des tâches à réaliser aujourd'hui, puis
  **validation de la journée**. Tant que la journée n'est pas validée (et qu'il existe des
  tâches actionnables), le reste de l'app est verrouillé. La sélection **persiste toute la
  journée** (se reconnecter ne la remet pas à zéro ; nouveau jour = nouvelle sélection).
- **My space (Mon espace)** : chronomètre de la tâche active, liste des tâches du jour,
  résumé, prochaines échéances.
- **My tasks (Mes tâches)** : liste filtrable/paginable de toutes les tâches assignées ;
  l'employé peut **proposer une tâche** (créée au statut « Déclarée », à valider par un admin).
- **Task detail** : détail d'une tâche, chronomètre start/stop, historique du chrono,
  sous-tâches, commentaires & notes, marquer comme terminée.
- **My statistics** : tâches confirmées, taux de complétion, temps moyen/tâche, temps
  travaillé/connexion, graphiques d'évolution, détail par jour, filtres de période.
- **Planning** : déclaration des **disponibilités hebdomadaires** (grille calendrier, statuts
  par jour, créneaux horaires) pour la semaine prochaine ; visualisation de la présence réelle
  sur la semaine en cours (en direct). Règle de **rattrapage** : l'employé peut éditer la
  semaine EN COURS s'il n'a jamais touché la semaine prochaine et n'a pas soumis la semaine en cours.
- **Messaging** : messagerie type Messenger (voir §6).
- **Resources** : consultation des dossiers/fichiers internes et partagés avec les clients.
- **Chatbot** : assistant IA personnel **en lecture seule** (Mistral) — analyse les tâches et
  statistiques de l'employé uniquement, ne modifie rien, n'accède pas aux données des collègues.
- **Profile** : informations personnelles éditables (poste, email, description…), photo de
  profil, changement de mot de passe.

## 5. Fonctionnalités — Espace administrateur

- **Overview (Vue d'ensemble)** : dashboard **temps réel** de l'équipe — employés actifs
  (connectés), tâches en cours, tâches en retard ; une carte par employé montrant ses tâches
  **du jour** (à faire / en cours avec chrono live / effectuées). Panneau de détail employé.
- **Projects (Projets)** : arborescence hiérarchique **Espace → Dossier → Liste** ; tâches
  d'une liste regroupées par statut ; création rapide de tâche.
- **Create a task** : formulaire complet (titre, description, priorité, assignation, échéance,
  emplacement hiérarchique optionnel, client optionnel).
- **Tasks (à valider)** : validation des tâches Déclarées et confirmation des tâches Terminées ;
  renvoi avec motif ; actions groupées ; onglet « en retard ».
- **Task requests** : approbation/refus des demandes de **tâche supplémentaire** faites par les
  employés après validation de leur journée.
- **Team (Équipe)** : gestion des utilisateurs — liste, suspension/réactivation, promotion
  administrateur ; onglet **demandes d'accès** (approuver/refuser les inscriptions en attente).
- **Attendance & schedule (Présence & planning)** : suivi de la présence réelle vs planning
  (présent/en retard/absent/partiel), corrections manuelles de présence par l'admin,
  consultation et édition des plannings des employés, recherche de disponibilité.
- **Statistics** : performance de l'équipe (KPI, graphiques, répartition par statut,
  classement/leaderboard, détail par employé, export CSV).
- **AI Assistant** : assistant IA **en lecture seule** avec contexte à l'échelle de l'équipe
  (Mistral) — questions sur l'activité, les tâches, les retards, les plannings.
- **Resources** : gestion des dossiers/fichiers (internes & clients), éditeur de documents,
  partage avec permissions, corbeille (restauration / suppression définitive).
- **Profile** : profil administrateur.

## 6. Messagerie (temps réel)

Messagerie type Messenger, plein écran, 3 colonnes. Trois canaux :
- **Global** : salon général de l'équipe.
- **Privé** : conversation 1-à-1 (un message → une conversation par destinataire).
- **Groupe** : groupes privés (nom, photo, membres).

Fonctions : envoi de messages, **pièces jointes** (image/PDF/Office), **messages vocaux**,
**réactions** emoji, **édition/suppression**, statut **en ligne**, aperçus + compteurs de
non-lus, recherche. Temps réel via Socket.IO (événement `message:new`), avec polling de secours.

## 7. Concepts et règles métier clés

**Workflow d'une tâche** (statuts en base, en français) :
`DECLAREE` → `VALIDEE` → `EN_COURS` → `TERMINEE` → `CONFIRMEE`
- Une tâche créée par un **admin** part directement en `VALIDEE` (assignée, démarrable).
- Une tâche **proposée par un employé** part en `DECLAREE` (proposition à valider par l'admin).
- « Complétée » = statut **`CONFIRMEE`** uniquement (validé par l'admin). `TERMINEE` = l'employé
  a fini mais attend encore la confirmation. Ce sont deux indicateurs différents.

**Chronomètre (timelog)** : un seul chrono actif à la fois par employé ; démarrer une nouvelle
tâche arrête automatiquement la précédente ; arrêt automatique à la déconnexion.

**Priorités** (en base) : `FAIBLE`, `NORMALE`, `HAUTE`, `URGENT`.
**Statuts de compte** (en base) : `ACTIF`, `SUSPENDU`, `EN_ATTENTE`, `REJETE`.
**Statuts de disponibilité** (planning) : `AVAILABLE`, `PARTIALLY_AVAILABLE`, `UNAVAILABLE`,
`LEAVE`, `SICK`.

⚠️ **Important** : ces énumérations restent **en français dans la base et la logique** ; il ne
faut pas les traduire. Côté frontend, l'affichage passe par des helpers de traduction dans
`frontend/src/utils/taskStatus.js` (`STATUS_PILL`, `priorityLabel`, `userStatusLabel`).

**Présence** : basée sur la table `user_sessions`. Un heartbeat frontend (toutes les 20 s)
maintient la session « en ligne » ; au-delà du délai sans activité, la session n'est plus
considérée active. Login/logout gérés côté backend ; le chrono de tâche s'arrête à la
déconnexion.

**Authentification** : inscription → compte `EN_ATTENTE` → approbation admin → `ACTIF`.
Connexion par **email OU nom d'utilisateur**. JWT 7 jours.

## 8. Temps réel (Socket.IO)

Une connexion WebSocket unique par client, authentifiée par le JWT au handshake. Événements
principaux :
- `message:new` — nouveau message (messagerie) → rafraîchit le canal ouvert + les listes.
- `notification:new` — nouvelle activité → rafraîchit notifications / dashboard admin.
- `presence:update` — connexion/déconnexion → rafraîchit le dashboard temps réel.

## 9. Assistant IA (Mistral)

Deux contextes en **lecture seule** (aucune écriture exposée) :
- **Admin** : instantané agrégé de l'équipe (employés, tâches par statut, plannings semaine
  courante/prochaine, statistiques, retards).
- **Employé** : uniquement ses propres tâches et statistiques.

Le prompt système impose : lecture seule, ne jamais inventer de données, préciser la période
analysée, **répondre en anglais**. Variable d'environnement `MISTRAL_API_KEY` requise.

## 10. Variables d'environnement (backend)

`DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRY` (def. 7d), `MISTRAL_API_KEY`, `MISTRAL_MODEL`
(def. `mistral-medium`), `API_PORT` (def. 3001), `NODE_ENV`, `PLANNING_TIMEZONE`
(def. `Indian/Antananarivo`), plus des réglages de présence
(`PRESENCE_HEARTBEAT_TIMEOUT_SECONDS`, `PRESENCE_DISCONNECT_GRACE_SECONDS`, etc.) et
`PLANNING_FORCE_EDIT_WINDOW` (bascule de test uniquement).

## 11. Déploiement — points d'attention

- **Serveur always-on obligatoire** (WebSockets Socket.IO) → pas de serverless pur.
- **Uploads sur disque** → nécessite un **disque/volume persistant** (ou migration vers un
  stockage objet type S3/R2), sinon les fichiers sont perdus au redéploiement.
- **PostgreSQL managé** + étape `npm run migrate` au déploiement.
- HTTPS requis en production (cookie httpOnly/Secure prévu au déploiement) ; `helmet` et le
  rate-limiting sont déjà en place (activés en `NODE_ENV=production`).
- Checklist de déploiement : voir `app/DEPLOIEMENT.md`.
