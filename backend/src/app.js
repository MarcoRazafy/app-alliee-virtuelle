const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const messageRoutes = require('./routes/messages');
const resourceRoutes = require('./routes/resources');
const userRoutes = require('./routes/users');
const dashboardRoutes = require('./routes/dashboard');
const statsRoutes = require('./routes/stats');
const auditLogRoutes = require('./routes/auditLog');
const aiRoutes = require('./routes/ai');
const hierarchyRoutes = require('./routes/hierarchy');
const planningRoutes = require('./routes/planning');
const sessionRoutes = require('./routes/sessions');
const notificationRoutes = require('./routes/notifications');
const db = require('./config/database');
const errorHandler = require('./middleware/errorHandler.middleware');

// Construit l'application Express (middlewares + routes), SANS écouter de port ni
// démarrer de tâche de fond. Séparé de index.js pour pouvoir être testé (supertest).
const app = express();

// Derrière un reverse proxy en prod (Nginx/Caddy/…), fait confiance au 1er proxy pour
// récupérer la vraie IP client (utile au rate-limiting). Sans effet en local direct.
app.set('trust proxy', 1);

// En-têtes de sécurité HTTP (X-Content-Type-Options, HSTS, referrer-policy, …) + CSP.
// La CSP par défaut de Helmet bloquerait des choses dont l'app a besoin ; on l'ajuste :
// - blob: pour les images/avatars ET les messages vocaux affichés via URL.createObjectURL,
// - Google Fonts (feuille de style + fichiers de police),
// - 'unsafe-inline' pour le petit script inline du thème (anti-flash) et les styles inline React,
// - ws:/wss: pour le temps réel Socket.IO (même origine).
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        objectSrc: ["'none'"],
      },
    },
  })
);

app.use(cors());
// Limite la taille des corps JSON (les fichiers passent par multer, pas par ici).
app.use(express.json({ limit: '1mb' }));

// Health check pour la supervision de l'hébergeur (non authentifié). Vérifie que le process
// répond ET que la base est joignable → 200 si tout va bien, 503 sinon (pour que la plateforme
// puisse détecter une instance dégradée et la redémarrer / la sortir du load-balancer).
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.status(200).json({ status: 'ok', db: 'up', uptime: process.uptime() });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'down' });
  }
});

// Déploiement en SERVICE UNIQUE : si le build Vite est présent, le backend sert aussi le
// frontend (same-origin → le cookie httpOnly d'auth fonctionne sans config CORS). Absent en
// dev/test (Vite tourne à part) → on garde juste une bannière API à la racine.
const distPath = path.join(__dirname, '../../frontend/dist');
const hasFrontendBuild = fs.existsSync(path.join(distPath, 'index.html'));
if (hasFrontendBuild) {
  app.use(express.static(distPath));
} else {
  app.get('/', (req, res) => res.json({ message: "L'Alliée Virtuelle API" }));
}

app.use('/api/auth', authRoutes);
app.use('/api', taskRoutes);
app.use('/api', messageRoutes);
app.use('/api', resourceRoutes);
app.use('/api', userRoutes);
app.use('/api', dashboardRoutes);
app.use('/api', statsRoutes);
app.use('/api', auditLogRoutes);
app.use('/api', aiRoutes);
app.use('/api', hierarchyRoutes);
app.use('/api', planningRoutes);
app.use('/api', sessionRoutes);
app.use('/api', notificationRoutes);

// Fallback SPA : toute route non-API/non-socket renvoie index.html pour que les deep-links du
// routeur React (ex. /admin/stats rafraîchi) fonctionnent au lieu de renvoyer 404.
if (hasFrontendBuild) {
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.use(errorHandler);

module.exports = app;
