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
const pushRoutes = require('./routes/push');
const announcementRoutes = require('./routes/announcements');
const dailyRoutes = require('./routes/daily');
const emailRoutes = require('./routes/emails');
const db = require('./config/database');
const env = require('./config/env');
const mailService = require('./services/mail.service');
const imapService = require('./services/imap.service');
const errorHandler = require('./middleware/errorHandler.middleware');

const app = express();

app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        mediaSrc: ["'self'", 'blob:'],
        connectSrc: ["'self'", 'ws:', 'wss:', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
        manifestSrc: ["'self'"],
        workerSrc: ["'self'"],
        objectSrc: ["'none'"],
      },
    },
  })
);

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.status(200).json({
      status: 'ok',
      db: 'up',
      push: Boolean(env.vapidPublicKey),
      mail: mailService.isEnabled(),
      inbox: imapService.isEnabled(),
      uptime: process.uptime(),
    });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'down' });
  }
});

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
app.use('/api', pushRoutes);
app.use('/api', announcementRoutes);
app.use('/api', dailyRoutes);
app.use('/api', emailRoutes);

if (hasFrontendBuild) {
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.use(errorHandler);

module.exports = app;
