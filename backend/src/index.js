const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const authRoutes = require('./routes/auth');
const errorHandler = require('./middleware/errorHandler.middleware');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: "L'Alliée Virtuelle API" });
});

app.use('/api/auth', authRoutes);

app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`API démarrée sur http://localhost:${env.port}`);
});
