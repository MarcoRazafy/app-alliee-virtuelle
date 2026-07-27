const express = require('express');
const cors = require('cors');
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

app.use(cors());
app.use(express.json());

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
