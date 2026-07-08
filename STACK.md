# STACK.md - Configuration technique
## Étape 1 - Mise en place technique

**Date:** 8 juillet 2026  
**Status:** ✅ CONFIGURÉ

---

## 📋 Résumé technique

| Couche | Technologie | Version |
|--------|-------------|---------|
| **Backend** | Node.js + Express | Node 20.11 LTS |
| **Frontend** | React + Vite | React 18.2 / Vite 5+ |
| **Styling** | Tailwind CSS | 3.x |
| **Database** | PostgreSQL | 14+ |
| **Auth** | JWT + bcrypt | - |
| **API Port** | http://localhost:3001 | - |
| **Frontend Port** | http://localhost:5173 | - |

---

## 🔧 Backend

### Framework

**Node.js 20.11 LTS + Express**

- ✅ Rapide et léger
- ✅ Écosystème npm énorme
- ✅ JavaScript partout (backend + frontend)
- ✅ Parfait pour un MVP

#### Dependencies npm

```bash
npm install express cors dotenv bcrypt jsonwebtoken pg nodemon
npm install --save-dev typescript @types/express @types/node
```

#### Structure de projet

```
backend/
├── src/
│   ├── index.js              # Entry point
│   ├── config/
│   │   ├── database.js       # Connexion PostgreSQL
│   │   └── env.js            # Variables d'environnement
│   ├── routes/
│   │   ├── auth.js           # Inscription, connexion
│   │   ├── tasks.js          # Créer, éditer, lister tâches
│   │   ├── timelog.js        # Sessions chrono
│   │   ├── users.js          # Gestion utilisateurs (admin)
│   │   ├── messages.js       # Messagerie
│   │   ├── resources.js      # Gestion ressources
│   │   └── stats.js          # Statistiques
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── taskController.js
│   │   ├── userController.js
│   │   └── ...
│   ├── middleware/
│   │   ├── auth.js           # JWT verification
│   │   ├── errorHandler.js   # Centralized error handling
│   │   └── validation.js     # Request validation
│   ├── models/
│   │   └── db.js             # DB utility functions
│   └── utils/
│       ├── logger.js
│       └── helpers.js
├── migrations/
│   └── init.sql              # Schema complet 14 tables
├── .env.example
├── .gitignore
├── package.json
├── nodemon.json
└── README.md
```

#### Scripts npm

```json
{
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "migrate": "psql -U postgres -d alliee_virtuelle < migrations/init.sql",
    "seed": "node scripts/seed.js"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
```

#### Endpoints API (structure)

```
POST   /api/auth/register              # Inscription
POST   /api/auth/login                 # Connexion
POST   /api/auth/refresh               # Refresh token

GET    /api/tasks                      # Lister tâches
POST   /api/tasks                      # Créer tâche (admin)
PUT    /api/tasks/:id                  # Éditer tâche (admin)
GET    /api/tasks/:id                  # Détail tâche
POST   /api/tasks/:id/confirm          # Confirmer tâche (admin)
POST   /api/tasks/:id/reject           # Renvoyer tâche (admin)

POST   /api/timelog/:taskId/start      # Démarrer chrono
POST   /api/timelog/:taskId/stop       # Arrêter chrono
GET    /api/timelog/:taskId            # Historique chrono

GET    /api/my-day                     # Tâches du jour (employé)
POST   /api/my-day/validate            # Valider journée

GET    /api/users                      # Lister utilisateurs (admin)
POST   /api/users/:id/promote          # Promouvoir admin
POST   /api/users/:id/suspend          # Suspendre utilisateur

GET    /api/stats/team                 # Statistiques équipe
GET    /api/stats/employee/:id         # Statistiques employé

POST   /api/messages/global            # Chat global
GET    /api/messages/global            # Historique chat global
POST   /api/messages/private/:userId   # Message privé
GET    /api/conversations              # Lister conversations

GET    /api/resources                  # Lister dossiers/fichiers
POST   /api/resources/upload           # Upload fichier
```

#### Port API

```
http://localhost:3001
```

---

## 🎨 Frontend

### Framework

**React 18.2 + Vite**

- ✅ Vite : build ultra-rapide (HMR en <100ms)
- ✅ React : composants réactifs, écosystème énorme
- ✅ Parfait pour l'UX avec chronométrage en temps réel

#### Dependencies npm

```bash
npm install react react-dom axios zustand react-router-dom
npm install --save-dev tailwindcss postcss autoprefixer
```

#### Structure de projet

```
frontend/
├── src/
│   ├── main.jsx              # Entry point React
│   ├── App.jsx               # Router principal
│   ├── pages/
│   │   ├── auth/
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   └── ConfirmSignup.jsx
│   │   ├── employee/
│   │   │   ├── MyDay.jsx               # Sélection tâches du jour
│   │   │   ├── MyWorkspace.jsx         # Espace travail + chrono
│   │   │   ├── Messages.jsx
│   │   │   ├── Profile.jsx
│   │   │   └── Resources.jsx           # Consultation ressources
│   │   └── admin/
│   │       ├── Dashboard.jsx           # Suivi en temps réel
│   │       ├── CreateTask.jsx
│   │       ├── TasksToValidate.jsx
│   │       ├── EmployeeDetail.jsx
│   │       ├── Statistics.jsx
│   │       ├── Users.jsx
│   │       ├── Messages.jsx
│   │       ├── Resources.jsx           # Gestion ressources
│   │       └── Assistant.jsx           # IA (phase 2)
│   ├── components/
│   │   ├── TaskCard.jsx
│   │   ├── Chronometre.jsx             # Composant chrono interactif
│   │   ├── TaskTable.jsx
│   │   ├── FilterBar.jsx
│   │   ├── Navigation.jsx
│   │   └── ...
│   ├── services/
│   │   ├── api.js                      # Axios client avec interceptors
│   │   ├── auth.js                     # JWT management
│   │   └── storage.js                  # LocalStorage helpers
│   ├── store/
│   │   └── taskStore.js                # Zustand state management
│   ├── hooks/
│   │   ├── useAuth.js
│   │   ├── useTasks.js
│   │   └── useTimer.js                 # Custom hook pour chrono
│   ├── styles/
│   │   └── globals.css                 # Tailwind imports + overrides
│   ├── utils/
│   │   ├── formatTime.js               # Formatage HH:MM:SS
│   │   └── validators.js
│   └── index.html
├── public/
│   └── favicon.ico
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

#### Vite config

```javascript
// vite.config.js
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001'
    }
  }
})
```

#### Styling

**Tailwind CSS 3.x**

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

Avantages :
- ✅ Utility-first : rapide à développer
- ✅ Responsive mobile-first
- ✅ Customizable via tailwind.config.js
- ✅ Purge automatique du CSS inutilisé en production

#### Port Frontend

```
http://localhost:5173
```

---

## 🗄️ Base de données

**PostgreSQL 14+**

- **Port** : 5432
- **User** : postgres
- **Database** : alliee_virtuelle
- **Password** : À définir dans .env

### Schéma

**14 tables** (selon DECISIONS.md) :

1. `users` - Utilisateurs (id, email, password_hash, full_name, role, status)
2. `tasks` - Tâches (id, title, description, assigned_to, priority, status, deadline)
3. `task_history` - Historique modifications (id, task_id, field_changed, old_value, new_value)
4. `task_comments` - Notes + commentaires (id, task_id, author_id, content, type, is_visible_to_employee)
5. `task_attachments` - Pièces jointes (id, task_id, file_path, file_name)
6. `timelog` - Sessions chrono (id, task_id, employee_id, start_time, end_time, duration)
7. `messages` - Messagerie (id, author_id, content, channel_type, recipient_id)
8. `message_conversations` - Conversations privées (id, participant1_id, participant2_id)
9. `resources_folders` - Dossiers (id, name, parent_folder_id, type)
10. `resources_files` - Fichiers (id, folder_id, file_name, file_path, size)
11. `resources_shares` - Partages (id, folder_id, shared_with_user_id, permission_type)
12. `audit_log` - Audit trail (id, user_id, action, entity_type, entity_id, timestamp)
13. `user_daily_selection` - Sélection journée (id, user_id, task_id, selected_order, validated_at)
14. `ai_conversations` - Historique IA (id, admin_id, question, answer, created_at)

Fichier SQL : `backend/migrations/init.sql`

---

## 🔐 Authentification

**JWT + bcrypt**

### Flux d'authentification

```
1. Inscription (POST /api/auth/register)
   ├─ Validation email + mot de passe
   ├─ Hash mot de passe avec bcrypt
   ├─ Créer user avec status EN_ATTENTE
   └─ Répondre avec confirmation

2. Admin approuve (POST /api/users/:id/activate)
   ├─ User status → ACTIVE
   └─ Email de confirmation à l'employé

3. Connexion (POST /api/auth/login)
   ├─ Vérifier email + hash mot de passe
   ├─ Générer JWT (7 jours d'expiry)
   ├─ Retourner token + user data
   └─ Frontend stocke token en localStorage

4. Requêtes sécurisées
   ├─ Frontend envoie Authorization: Bearer <token>
   ├─ Middleware vérifie JWT
   └─ Route protégée traite la requête
```

### .env (Backend)

```
# Database
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/alliee_virtuelle

# JWT
JWT_SECRET=your_super_secret_key_here_min_32_chars_long
JWT_EXPIRY=7d

# Environment
NODE_ENV=development
API_PORT=3001

# Mistral (phase 2)
MISTRAL_API_KEY=your_mistral_key_here
MISTRAL_MODEL=mistral-medium
```

### .env (Frontend)

```
# API
VITE_API_URL=http://localhost:3001
VITE_API_TIMEOUT=10000
```

---

## 🚀 Installation & Lancement

### 1. Setup base de données

```bash
# Créer la base de données
createdb -U postgres alliee_virtuelle

# Importer le schéma (14 tables)
psql -U postgres -d alliee_virtuelle < backend/migrations/init.sql

# Optionnel : Seed données fictives
psql -U postgres -d alliee_virtuelle < backend/scripts/seed.sql
```

### 2. Backend - Installation

```bash
cd backend
npm install
cp .env.example .env

# Éditer .env avec vos valeurs (DATABASE_URL, JWT_SECRET, etc.)
nano .env  # ou votre éditeur

# Lancer en mode développement
npm run dev
```

✅ **API doit répondre sur http://localhost:3001**

Vérifier :
```bash
curl http://localhost:3001  # Doit retourner une réponse (ou 404 GET /)
```

### 3. Frontend - Installation

```bash
cd frontend
npm install
cp .env.example .env

# Optionnel : Éditer .env si API est sur un port différent
# nano .env

# Lancer en mode développement
npm run dev
```

✅ **Frontend doit être accessible sur http://localhost:5173**

Navigateur : http://localhost:5173 → Page de login doit apparaître

---

## 📦 Build pour la production

### Backend

```bash
cd backend

# Option 1 : Lancer directement avec Node
npm start

# Option 2 : Avec PM2 (pour garder le processus vivant)
npm install -g pm2
pm2 start src/index.js --name "alliee-api"
pm2 save
pm2 startup
```

### Frontend

```bash
cd frontend

# Build optimisé
npm run build

# Prévisualiser le build
npm run preview

# Uploader le dossier dist/ sur un serveur (Vercel, Netlify, etc.)
```

---

## 🔗 Points d'accès

| Service | URL | Notes |
|---------|-----|-------|
| **API REST** | http://localhost:3001 | Endpoints /api/* |
| **Frontend** | http://localhost:5173 | Application React |
| **PostgreSQL** | localhost:5432 | Base de données |
| **Swagger Docs** | http://localhost:3001/api/docs | Si Swagger installé (optionnel) |

---

## 📊 Arborescence finale

```
alliee-virtuelle/
├── backend/                    # Node.js + Express
│   ├── src/
│   ├── migrations/
│   ├── scripts/
│   ├── package.json
│   ├── .env.example
│   └── README.md
│
├── frontend/                   # React + Vite + Tailwind
│   ├── src/
│   ├── public/
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── package.json
│   ├── .env.example
│   └── README.md
│
├── .gitignore
├── DECISIONS.md               # Arbitrages métier (Étape 0) ✅
├── STACK.md                   # Configuration technique (Étape 1) ✅
└── README.md                  # Index du projet
```

---

## ✅ Checklist avant Étape 2 (Auth & comptes)

**Installation :**
- [ ] Node.js 20.11+ installé (`node --version`)
- [ ] PostgreSQL 14+ installé et démarré
- [ ] Dépôt Git créé et accessible
- [ ] Dossiers backend/ et frontend/ créés

**Backend :**
- [ ] `npm install` exécuté
- [ ] `.env` complété avec DATABASE_URL et JWT_SECRET
- [ ] Migration SQL exécutée (`npm run migrate`)
- [ ] Serveur démarre sans erreur (`npm run dev`)
- [ ] API répond sur http://localhost:3001

**Frontend :**
- [ ] `npm install` exécuté
- [ ] `.env` configuré (ou défaut OK)
- [ ] Serveur dev démarre sans erreur (`npm run dev`)
- [ ] Page charge sur http://localhost:5173

**Tests basiques :**
- [ ] `curl http://localhost:3001` retourne réponse
- [ ] Frontend charge et affiche page de login
- [ ] Console navigateur sans erreurs CORS

---

## 🎯 Prochaine étape

**Étape 2 - Authentification & Gestion des comptes**

Avec Claude Code, on va générer :
- ✅ Formulaires inscription / connexion
- ✅ API endpoints auth (register, login, forgot password)
- ✅ Gestion états compte (EN_ATTENTE, ACTIF, SUSPENDU, REFUSÉ)
- ✅ Admin interface gestion utilisateurs
- ✅ JWT tokens + refresh logic
- ✅ Middleware auth middleware sur les routes protégées

**Durée estimée** : 5-7 jours (avec Claude Code : 2-3 jours)

---

**Configuration validée et prête pour l'Étape 1 - Mise en place technique avec Claude Code.**

*Prochain étape : Exécuter les commandes ci-dessus et vérifier que backend + frontend démarrent.*
