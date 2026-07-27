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
const errorHandler = require('./middleware/errorHandler.middleware');

// Construit l'application Express (middlewares + routes), SANS écouter de port ni
// démarrer de tâche de fond. Séparé de index.js pour pouvoir être testé (supertest).
const app = express();

// Derrière un reverse proxy en prod (Nginx/Caddy/…), fait confiance au 1er proxy pour
// récupérer la vraie IP client (utile au rate-limiting). Sans effet en local direct.
app.set('trust proxy', 1);

// En-têtes de sécurité HTTP (X-Content-Type-Options, HSTS, referrer-policy, …).
// Sûr sur une API JSON. Sans effet indésirable en local.
app.use(helmet());

app.use(cors());
// Limite la taille des corps JSON (les fichiers passent par multer, pas par ici).
app.use(express.json({ limit: '1mb' }));

app.get('/', (req, res) => {
  res.json({ message: "L'Alliée Virtuelle API" });
});

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

app.use(errorHandler);

module.exports = app;
