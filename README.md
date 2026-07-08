# L'Alliée Virtuelle

**Application interne de suivi quotidien des tâches avec chronométrage**

Une plateforme centralisée pour administrer les tâches, suivre le temps en direct et collaborer sans Slack ou fichiers éparpillés.

---

## 📋 Vue d'ensemble

### Objectifs
- **Admin** : Supervision temps réel, intervention rapide, statistiques équipe
- **Employé** : Parcours structuré, lisible, traçable (sans alourdir le travail)

### Fonctionnalités principales
- ✅ Gestion des tâches (créer, assigner, valider)
- ✅ Chronométrage en temps réel par employé
- ✅ Workflow statuts défini (Déclarée → Validée → En cours → Terminée → Confirmée)
- ✅ Messagerie (chat global + conversations privées)
- ✅ Gestion des ressources (dossiers, fichiers, partages)
- ✅ Statistiques et rapports
- ✅ Assistant IA pour analyse des données (Mistral)
- ✅ Audit trail complet (traçabilité)

---

## 🏗️ Architecture

### Stack technique

| Couche | Technologie | Version |
|--------|-------------|---------|
| **Backend** | Node.js + Express | 20.11 LTS |
| **Frontend** | React + Vite | React 18 / Vite 5+ |
| **Styling** | Tailwind CSS | 3.x |
| **Database** | PostgreSQL | 14+ |
| **Auth** | JWT + bcrypt | - |

### Ports
- **API** : http://localhost:3001
- **Frontend** : http://localhost:5173
- **Database** : localhost:5432

---

## 📁 Structure du projet

```
app-alliee-virtuelle/
├── backend/                    # Node.js + Express API
│   ├── src/
│   │   ├── config/            # Configuration DB, env
│   │   ├── routes/            # Endpoints API
│   │   ├── controllers/       # Logique métier
│   │   ├── middleware/        # Auth, erreurs
│   │   ├── models/            # DB utilities
│   │   └── utils/             # Helpers
│   ├── migrations/            # Schema SQL (14 tables)
│   ├── package.json
│   ├── .env.example
│   └── README.md
│
├── frontend/                   # React + Vite + Tailwind
│   ├── src/
│   │   ├── pages/             # Pages (auth, employee, admin)
│   │   ├── components/        # Composants réutilisables
│   │   ├── store/             # Zustand state management
│   │   ├── services/          # API client, auth
│   │   ├── hooks/             # Custom hooks
│   │   ├── styles/            # Tailwind config
│   │   └── utils/             # Helpers
│   ├── public/
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── package.json
│   ├── .env.example
│   └── README.md
│
├── DECISIONS.md               # Arbitrages métier (Étape 0)
├── STACK.md                   # Configuration technique (Étape 1)
├── README.md                  # Ce fichier
└── .gitignore
```

---

## 🚀 Quick Start

### Prérequis

- Node.js 20.11+ ([installer](https://nodejs.org/))
- PostgreSQL 14+ ([installer](https://www.postgresql.org/download/))
- Git

**Vérifier :**
```bash
node --version    # v20.11.0
postgres --version # postgres (PostgreSQL) 14+
git --version     # git version 2.x+
```

### Installation

#### 1. Cloner le repo et créer branche dev

```bash
git clone https://github.com/VotreUsername/app-alliee-virtuelle.git
cd app-alliee-virtuelle
git checkout -b dev
```

#### 2. Créer la base de données

```bash
# Accéder à PostgreSQL
sudo -u postgres psql

# Dans psql :
CREATE DATABASE alliee_virtuelle;
\q

# Importer le schéma (14 tables)
sudo -u postgres psql -d alliee_virtuelle < backend/migrations/init.sql
```

#### 3. Backend - Setup

```bash
cd backend
cp .env.example .env

# Éditer .env avec vos valeurs
nano .env
# Ou ouvrir dans votre éditeur favori

# Installer dépendances
npm install

# Démarrer serveur (mode développement)
npm run dev
```

**API doit répondre sur http://localhost:3001**

#### 4. Frontend - Setup

```bash
cd ../frontend
cp .env.example .env

# Installer dépendances
npm install

# Démarrer serveur (mode développement)
npm run dev
```

**Frontend doit être accessible sur http://localhost:5173**

---

## 🔧 Commandes principales

### Backend

```bash
cd backend

# Mode développement (avec hot-reload)
npm run dev

# Production
npm start

# Exécuter migrations
npm run migrate

# Seed données fictives
npm run seed
```

### Frontend

```bash
cd frontend

# Mode développement
npm run dev

# Build optimisé
npm run build

# Prévisualiser le build
npm run preview
```

---

## 📚 Documentation

- **[DECISIONS.md](./DECISIONS.md)** - Arbitrages métier et règles de business (Étape 0)
- **[STACK.md](./STACK.md)** - Configuration technique détaillée (Étape 1)
- **[backend/README.md](./backend/README.md)** - Documentation API (Étape 2+)
- **[frontend/README.md](./frontend/README.md)** - Documentation Frontend (Étape 2+)

---

## 🌳 Feuille de route

### Étapes de développement

| Étape | Durée | Objectif |
|-------|-------|----------|
| **0** | 2-3j | Arbitrages métier ✅ |
| **1** | 2-4h | Setup technique ✅ |
| **2** | 5-7j | Auth & gestion comptes |
| **3** | 7-10j | Backend noyau (tâches + chrono) |
| **4** | 7-10j | Frontend noyau (utilisable) |
| **5** | 10-14j | Messagerie, stats, ressources |
| **6** | 5-7j | Assistant IA (optionnel) |
| **7** | 7-10j | Tests & déploiement |

---

## 🔐 Variables d'environnement

### Backend (.env)

```
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/alliee_virtuelle

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

### Frontend (.env)

```
# API
VITE_API_URL=http://localhost:3001
VITE_API_TIMEOUT=10000
```

---

## 🎯 Workflow Git

### Créer une branche pour une feature

```bash
# Depuis dev
git checkout dev
git pull origin dev

# Créer branche feature
git checkout -b feature/nom-de-la-feature

# Faire les changements
# git add, git commit, git push

# Quand c'est prêt : créer une Pull Request
```

### Branches principales

- `main` : Production (stable)
- `dev` : Développement (intégration continue)
- `feature/*` : Nouvelles fonctionnalités
- `bugfix/*` : Corrections bugs

---

## 📊 Architecture données

### 14 tables PostgreSQL

1. **users** - Utilisateurs
2. **tasks** - Tâches
3. **task_history** - Historique modifications
4. **task_comments** - Notes + commentaires
5. **task_attachments** - Pièces jointes
6. **timelog** - Sessions chrono
7. **messages** - Messagerie
8. **message_conversations** - Conversations privées
9. **resources_folders** - Dossiers ressources
10. **resources_files** - Fichiers
11. **resources_shares** - Partages dossiers
12. **audit_log** - Audit trail
13. **user_daily_selection** - Sélection tâches du jour
14. **ai_conversations** - Historique assistant IA

Voir `backend/migrations/init.sql` pour le schéma complet.

---

## 🛠️ Troubleshooting

### PostgreSQL ne démarre pas

```bash
sudo service postgresql start
sudo service postgresql status
```

### Erreur "port 3001 already in use"

```bash
# Trouver le process sur le port 3001
lsof -i :3001

# Tuer le process
kill -9 <PID>

# Ou utiliser un autre port dans .env
API_PORT=3002
```

### Erreur CORS

Vérifier que `VITE_API_URL` pointe vers le bon backend dans `frontend/.env`

### Base de données non créée

```bash
sudo -u postgres psql
CREATE DATABASE alliee_virtuelle;
\q

# Importer schéma
sudo -u postgres psql -d alliee_virtuelle < backend/migrations/init.sql
```

---

## 👥 Contribution

1. Fork le repo
2. Créer branche feature (`git checkout -b feature/amazing-feature`)
3. Commit changements (`git commit -m 'Add amazing feature'`)
4. Push branche (`git push origin feature/amazing-feature`)
5. Ouvrir Pull Request

---

## 📝 Licence

Projet interne - Propriété de l'organisation.

---

## 📞 Support

Pour les questions ou problèmes :
- Consultez [DECISIONS.md](./DECISIONS.md) pour les règles métier
- Consultez [STACK.md](./STACK.md) pour l'architecture technique
- Ouvrez une issue sur le repo

---

## 🔗 Liens utiles

- [Node.js Documentation](https://nodejs.org/docs/)
- [React Documentation](https://react.dev/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Express Documentation](https://expressjs.com/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)

---

**Dernière mise à jour :** 8 juillet 2026  
**Status du projet :** En développement (Étape 1)