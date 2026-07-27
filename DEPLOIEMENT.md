# Déploiement & sécurité — L'Alliée Virtuelle

## ✅ Déjà en place (dans le code, rien à refaire)
- **Helmet** — en-têtes de sécurité HTTP sur l'API (actif partout).
- **Rate-limiting** sur `/api/auth/login` et `/register` (20 tentatives / 15 min / IP) — **s'active automatiquement quand `NODE_ENV=production`**. Désactivé en dev/tunnel/test (IP partagée).
- **`trust proxy`** activé → vraie IP client derrière un reverse proxy.
- Limite de taille des corps JSON (1 Mo).
- SQL 100 % paramétré, champs de réponse whitelistés, `audit_log`, `.env` git-ignoré.
- Runner de migrations (`npm run migrate`) — applique tout automatiquement.

## 🚀 À faire le jour du déploiement
1. **Variables d'environnement de prod** (`backend/.env`) :
   - `NODE_ENV=production`  ← **active le rate-limiting**
   - `JWT_SECRET=<secret long et aléatoire>` (ne PAS réutiliser celui de dev)
   - `DATABASE_URL=<base de prod>`
2. **Base de données** : `cd backend && npm run migrate` sur la base de prod.
3. **HTTPS** (obligatoire en prod) :
   - Un **nom de domaine** + un reverse proxy **Caddy** (le plus simple, HTTPS auto) ou **Nginx + Let's Encrypt**.
   - Le proxy termine le TLS et transmet à Node (`http://localhost:3001`).
   - → débloque aussi le **micro / message vocal**, les notifications navigateur, etc.
4. **Frontend** : `cd frontend && npm run build`, servir le dossier `dist/` derrière le proxy ; router `/api` et `/socket.io` vers le backend.
5. **CORS** : aujourd'hui ouvert (`cors()`), OK en same-origin. Restreindre si le front est sur un autre domaine que l'API.

## 🔒 Renforcements optionnels (plus tard)
- **Token en cookie `httpOnly`** au lieu de `localStorage` (protège du vol par XSS) — touche le login + le front.
- Journalisation/monitoring, sauvegardes DB régulières.

## Rappels utiles
- `npm test` (back & front) + `npm run test:integration` (back) avant chaque déploiement.
- Voir aussi les scripts : `backend/scripts/migrate.js`, `frontend/npm run build`.
