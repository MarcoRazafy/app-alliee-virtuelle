const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const messageRoutes = require('./routes/messages');
const resourceRoutes = require('./routes/resources');
const userRoutes = require('./routes/users');
const dashboardRoutes = require('./routes/dashboard');
const statsRoutes = require('./routes/stats');
const auditLogRoutes = require('./routes/auditLog');
const errorHandler = require('./middleware/errorHandler.middleware');

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

app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`API démarrée sur http://localhost:${env.port}`);
});
