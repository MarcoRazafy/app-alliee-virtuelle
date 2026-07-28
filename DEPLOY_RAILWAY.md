# Déploiement sur Railway — L'Alliée Virtuelle

Déploiement en **service unique** : le backend Express sert aussi le frontend buildé
(same-origin → le cookie d'auth `httpOnly` fonctionne sans configuration CORS).

Fichiers déjà prêts à la racine `app/` : `package.json` (orchestration), `railway.json`
(build/start + health check). Ne rien changer côté code, il suffit de configurer Railway.

## Prérequis
- Le dépôt poussé sur **GitHub** (Railway déploie depuis Git).
- Un compte **Railway** (railway.app).

## Étapes

### 1. Créer le projet
- Railway → **New Project** → **Deploy from GitHub repo** → choisir le dépôt.
- Dans le service créé → **Settings → Source** → **Root Directory** = `app`
  (le dossier qui contient `backend/`, `frontend/`, `package.json`, `railway.json`).

### 2. Ajouter la base PostgreSQL
- Dans le projet → **New** → **Database** → **PostgreSQL**.
- Railway crée une variable `DATABASE_URL`. Dans le **service applicatif** → **Variables** →
  ajouter une **variable de référence** : `DATABASE_URL = ${{Postgres.DATABASE_URL}}`.

### 3. Variables d'environnement (service applicatif)
| Variable | Valeur |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | une chaîne longue et aléatoire (≠ celle de dev) |
| `MISTRAL_API_KEY` | ta clé Mistral (pour le chatbot / l'assistant) |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (référence, cf. étape 2) |
| `ADMIN_EMAIL` | `ucan.mih@gmail.com` |
| `ADMIN_PASSWORD` | ton mot de passe admin (saisi ici comme **secret Railway**, jamais dans Git) |
| `ADMIN_NAME` | `Admin l'Alliée Virtuelle` |

> Les variables `ADMIN_*` créent **automatiquement** ton compte administrateur au 1er
> déploiement (voir étape 7). Le login se fait ensuite par **email**. Le mot de passe ne doit
> **jamais** être écrit dans le code / le dépôt — uniquement ici, dans les variables Railway.

> Le **port** est géré automatiquement (Railway injecte `PORT`, l'app l'utilise).
> **SSL** : activé automatiquement en production. Si la connexion DB échoue avec une erreur
> SSL (réseau privé Railway), ajoute `DATABASE_SSL=false`.

### 4. Volume persistant pour les uploads ⚠️
Les fichiers (avatars, ressources, pièces jointes) sont écrits sur disque. Sans volume, ils
disparaissent à chaque redéploiement.
- Service → **Settings → Volumes** → **New Volume**.
- **Mount path** : le chemin de `backend/uploads` dans le conteneur — généralement
  **`/app/backend/uploads`**. (En cas de doute, ouvre un shell Railway et fais `pwd`/`ls`.)

### 5. Health check
Déjà défini dans `railway.json` (`/health`). Rien à faire, mais tu peux le vérifier dans
**Settings → Deploy → Health Check Path** = `/health`.

### 6. Premier déploiement (base + admin automatiques)
- Railway lance automatiquement : `npm run build` (build frontend + install backend) puis
  `npm start`, qui enchaîne :
  1. **`npm run migrate`** — crée tout le **schéma** de la base (aucune donnée de test).
  2. **`npm run bootstrap-admin`** — crée **automatiquement** ton administrateur à partir des
     variables `ADMIN_*` (idempotent : ignoré si le compte existe déjà, aucun doublon).
  3. démarrage du serveur (REST + WebSocket + frontend servi).
- Attends que le déploiement soit **vert** et que le health check `/health` passe.

### 7. Se connecter
Rien de manuel : le compte admin (`ucan.mih@gmail.com`) a été créé à l'étape 6.
- Ouvre le domaine (étape 8) → connecte-toi avec **l'email** et le mot de passe (`ADMIN_PASSWORD`).
- Besoin d'un **admin supplémentaire** plus tard, ou **réinitialiser** un mot de passe ? Depuis un
  shell Railway : `npm --prefix backend run create-admin -- --email … --password … --name "…"`
  (ajouter `--reset-password` pour un compte existant).

### 8. Exposer le domaine
- Service → **Settings → Networking** → **Generate Domain**.
- Ouvre l'URL → connecte-toi avec le compte admin créé. Les WebSockets (messagerie, temps réel)
  fonctionnent en `wss://` sur ce domaine automatiquement.

## Après le déploiement
- **Redéploiements** : chaque push GitHub relance build + migrations + démarrage. L'arrêt propre
  (SIGTERM) évite de couper les requêtes en cours.
- **Sauvegardes DB** : Railway fournit des sauvegardes de la base managée. Pour une sauvegarde
  manuelle : `DATABASE_URL=<url publique> npm --prefix backend run backup` depuis ta machine.
- **Monitoring** (facultatif) : `npm i @sentry/node` dans `backend/` + variable `SENTRY_DSN`.

## Dépannage rapide
- **Le service ne répond pas / health KO** : vérifier que `DATABASE_URL` est bien référencée et
  que les migrations passent (logs de déploiement).
- **Erreur SSL PostgreSQL** : ajouter `DATABASE_SSL=false`.
- **Uploads perdus après redéploiement** : le volume n'est pas monté sur le bon chemin (étape 4).
- **404 en rafraîchissant une page profonde** : ne devrait pas arriver (fallback SPA intégré au
  backend) ; si ça arrive, vérifier que le build frontend a bien été produit (`frontend/dist`).
