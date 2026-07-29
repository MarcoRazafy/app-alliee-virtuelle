# Déploiement & sécurité — L'Alliée Virtuelle

## ✅ Déjà en place (dans le code, rien à refaire)
- **Helmet** — en-têtes de sécurité HTTP sur l'API (actif partout).
- **Rate-limiting** sur `/api/auth/login` et `/register` (20 tentatives / 15 min / IP) — **s'active automatiquement quand `NODE_ENV=production`**. Désactivé en dev/tunnel/test (IP partagée).
- **`trust proxy`** activé → vraie IP client derrière un reverse proxy.
- Limite de taille des corps JSON (1 Mo).
- SQL 100 % paramétré, champs de réponse whitelistés, `audit_log`, `.env` git-ignoré.
- Runner de migrations (`npm run migrate`) — applique tout automatiquement.
- **SSL PostgreSQL conditionnel** (`config/database.js`) — activé automatiquement en prod (`NODE_ENV=production`), désactivé en dev. Surchargeable via `DATABASE_SSL=true|false`. Compatible bases managées (Render, Railway, Supabase, DigitalOcean…).
- **Endpoint `/health`** — non authentifié, vérifie process + base (`SELECT 1`). `200 {status:ok,db:up}` ou `503 {status:error,db:down}`. À utiliser comme *Health Check Path* de l'hébergeur.
- **Fail-fast des env critiques** (`config/env.js`) — en production, refus de démarrer si `DATABASE_URL` ou `JWT_SECRET` manquent (message clair au lieu d'une erreur cryptique).
- **Arrêt propre (SIGTERM/SIGINT)** (`src/index.js`) — ferme le serveur + le pool PostgreSQL proprement lors des redéploiements.
- **Version Node épinglée** (`engines: node >=20`) dans les deux `package.json`.
- **Auth par cookie `httpOnly`** — le token JWT est posé dans un cookie `httpOnly` + `SameSite=Lax` (`Secure` en prod), invisible au JS du navigateur → protège du vol par XSS. L'en-tête `Authorization: Bearer` reste accepté (clients API/tests). *(Testé : 4 tests d'intégration `auth-cookie`.)*
- **Monitoring d'erreurs optionnel** (`config/observability.js`) — inerte par défaut ; s'active avec `SENTRY_DSN` + `npm i @sentry/node`. Remonte les 500 inattendus et les rejets de promesse non gérés.
- **Script de sauvegarde DB** — `npm run backup` (`scripts/backup-db.sh`, pg_dump compressé + rotation).

## 🚀 À faire le jour du déploiement
1. **Variables d'environnement de prod** (`backend/.env`) :
   - `NODE_ENV=production`  ← **active le rate-limiting ET le SSL PostgreSQL**
   - `JWT_SECRET=<secret long et aléatoire>` (ne PAS réutiliser celui de dev)
   - `DATABASE_URL=<base de prod>`
   - `MISTRAL_API_KEY=<clé>` (assistant IA / chatbot)
   - `DATABASE_SSL` — **seulement si besoin de forcer** : `false` pour un Postgres auto-hébergé sans TLS, `true` pour tester une base managée depuis le dev. Sinon laisser vide (auto selon `NODE_ENV`).
   - **Notifications push (Web Push)** — 3 variables, sinon la fonctionnalité reste inerte (aucune notif, l'app marche quand même) :
     - `VAPID_PUBLIC_KEY=<clé publique>` et `VAPID_PRIVATE_KEY=<clé privée, SECRÈTE>` — générer une paire avec `cd backend && node -e "console.log(require('web-push').generateVAPIDKeys())"` (ou `npx web-push generate-vapid-keys`).
     - `VAPID_SUBJECT=mailto:contact@ton-domaine.com` (facultatif, défaut : `mailto:ucan.mih@gmail.com`).
     - ⚠️ Les clés doivent rester **stables** : les régénérer invalide tous les abonnements existants (les utilisateurs devront réactiver les notifications). Push disponible sur PC/Android ; iPhone **uniquement en PWA installée** (iOS 16.4+).
2. **Base de données** : `cd backend && npm run migrate` sur la base de prod. Repartir d'une **base propre** (aucun seed de test n'est appliqué automatiquement).
   - **Créer le 1er administrateur** (indispensable pour se connecter) :
     `npm run create-admin -- --email admin@ton-domaine.com --password '<mot de passe fort>' --name "Prénom Nom"`
     (ou via `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_NAME`). `--reset-password` promeut/réinitialise un compte existant.
3. **Stockage persistant des uploads** ⚠️ — les fichiers sont sur **disque** (`backend/uploads/{avatars,resources,attachments}`). Sur un hébergeur à système de fichiers éphémère, ils sont **perdus au redéploiement**. Deux options :
   - **Monter un volume/disque persistant** sur `backend/uploads` (Railway/Render/Fly, ou disque local sur VPS) — le plus simple, aucun changement de code.
   - **Migrer vers un stockage objet** (S3 / Cloudflare R2 / OVH Object Storage) — plus robuste, mais nécessite de réécrire les 3 configs `multer` + les routes `sendFile`.
4. **HTTPS** (obligatoire en prod) :
   - Un **nom de domaine** + un reverse proxy **Caddy** (le plus simple, HTTPS auto) ou **Nginx + Let's Encrypt**.
   - Le proxy termine le TLS et transmet à Node (`http://localhost:3001`).
   - Router `/api` **et `/socket.io`** vers le backend (WebSockets : penser à `proxy_set_header Upgrade`/`Connection` côté Nginx ; automatique avec Caddy).
   - → débloque aussi le **micro / message vocal**, les notifications navigateur, etc.
5. **Frontend** : `cd frontend && npm run build`, servir le dossier `dist/` derrière le proxy. Définir `VITE_API_URL` uniquement si le front est sur un **autre domaine** que l'API (sinon laisser vide = même origine).
   - **Fallback SPA (obligatoire)** : router toutes les routes inconnues vers `index.html`, sinon un refresh sur une URL profonde (ex. `/admin/stats`) renvoie 404. Nginx : `try_files $uri /index.html;` — Caddy : `try_files {path} /index.html`.
   - **Taille des uploads au proxy** : l'app accepte jusqu'à **20 Mo** (ressources). Nginx limite par défaut à 1 Mo → ajouter `client_max_body_size 25m;` (inutile avec Caddy).
6. **CORS** : aujourd'hui ouvert (`cors()` côté API + Socket.IO `origin:'*'`). OK en same-origin. **Restreindre** au domaine du front si séparé de l'API.
7. **Health check** : configurer la supervision de l'hébergeur sur **`/health`** (et non `/`, qui ne teste pas la DB).

## 🔒 À finaliser côté hébergeur / config
- **CORS credentials si front et API sur des domaines différents** : le cookie httpOnly n'est envoyé cross-origin que si CORS renvoie `credentials: true` + une origine explicite (pas `*`), et le cookie doit alors être `SameSite=None; Secure`. En **same-origin** (front + API derrière le même proxy — cas recommandé), rien à changer.
- **Sauvegardes DB automatiques** : planifier `npm run backup` en **cron** (VPS), ex. quotidien `0 3 * * * cd /app/backend && DATABASE_URL=... npm run backup`. Sur hébergeur **managé**, les sauvegardes sont généralement déjà fournies par la plateforme.
- **Activer Sentry** (facultatif) : `npm i @sentry/node` + `SENTRY_DSN=<dsn>`.
- **Process manager** si VPS (pm2 / systemd).

## 🔒 Renforcements optionnels (plus tard)
- **Bumps de dépendances restants** (nécessitent des majeures cassantes) : `react-router-dom` v7 (vuln modérée), remplacement/màj de `html2pdf.js`/`jspdf` pour l'export PDF (vulns critiques, export admin uniquement).

## Rappels utiles
- `npm test` (back & front) + `npm run test:integration` (back) avant chaque déploiement.
- Voir aussi les scripts : `backend/scripts/migrate.js`, `frontend/npm run build`.
