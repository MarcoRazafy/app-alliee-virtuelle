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

## 🚀 À faire le jour du déploiement
1. **Variables d'environnement de prod** (`backend/.env`) :
   - `NODE_ENV=production`  ← **active le rate-limiting ET le SSL PostgreSQL**
   - `JWT_SECRET=<secret long et aléatoire>` (ne PAS réutiliser celui de dev)
   - `DATABASE_URL=<base de prod>`
   - `MISTRAL_API_KEY=<clé>` (assistant IA / chatbot)
   - `DATABASE_SSL` — **seulement si besoin de forcer** : `false` pour un Postgres auto-hébergé sans TLS, `true` pour tester une base managée depuis le dev. Sinon laisser vide (auto selon `NODE_ENV`).
2. **Base de données** : `cd backend && npm run migrate` sur la base de prod. Repartir d'une **base propre** (ne garder que le vrai compte admin, supprimer les données/comptes de test).
3. **Stockage persistant des uploads** ⚠️ — les fichiers sont sur **disque** (`backend/uploads/{avatars,resources,attachments}`). Sur un hébergeur à système de fichiers éphémère, ils sont **perdus au redéploiement**. Deux options :
   - **Monter un volume/disque persistant** sur `backend/uploads` (Railway/Render/Fly, ou disque local sur VPS) — le plus simple, aucun changement de code.
   - **Migrer vers un stockage objet** (S3 / Cloudflare R2 / OVH Object Storage) — plus robuste, mais nécessite de réécrire les 3 configs `multer` + les routes `sendFile`.
4. **HTTPS** (obligatoire en prod) :
   - Un **nom de domaine** + un reverse proxy **Caddy** (le plus simple, HTTPS auto) ou **Nginx + Let's Encrypt**.
   - Le proxy termine le TLS et transmet à Node (`http://localhost:3001`).
   - Router `/api` **et `/socket.io`** vers le backend (WebSockets : penser à `proxy_set_header Upgrade`/`Connection` côté Nginx ; automatique avec Caddy).
   - → débloque aussi le **micro / message vocal**, les notifications navigateur, etc.
5. **Frontend** : `cd frontend && npm run build`, servir le dossier `dist/` derrière le proxy. Définir `VITE_API_URL` uniquement si le front est sur un **autre domaine** que l'API (sinon laisser vide = même origine).
6. **CORS** : aujourd'hui ouvert (`cors()` côté API + Socket.IO `origin:'*'`). OK en same-origin. **Restreindre** au domaine du front si séparé de l'API.
7. **Health check** : configurer la supervision de l'hébergeur sur **`/health`** (et non `/`, qui ne teste pas la DB).

## 🔒 Renforcements optionnels (plus tard)
- **Token en cookie `httpOnly`** au lieu de `localStorage` (protège du vol par XSS) — touche le login + le front.
- Journalisation/monitoring (aujourd'hui `console.error` seul), **sauvegardes DB** régulières.
- **Process manager** si VPS (pm2 / systemd) ; **épingler la version Node** (`engines` dans `package.json`).

## Rappels utiles
- `npm test` (back & front) + `npm run test:integration` (back) avant chaque déploiement.
- Voir aussi les scripts : `backend/scripts/migrate.js`, `frontend/npm run build`.
