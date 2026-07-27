const http = require('http');
const env = require('./config/env');
const app = require('./app');
const { initRealtime } = require('./realtime/io');
const sessionModel = require('./models/session.model');

// Serveur HTTP explicite pour héberger à la fois Express (REST) et Socket.IO (WebSockets).
const server = http.createServer(app);
initRealtime(server);

server.listen(env.port, () => {
  console.log(`API démarrée sur http://localhost:${env.port} (REST + WebSocket)`);
});

// Nettoyage autonome des navigateurs fermés : présence et tâche sont clôturées
// même si aucun utilisateur ne rouvre l'application et si aucun admin ne consulte la page.
const presenceCleanupTimer = setInterval(() => {
  sessionModel.expireStaleSessions().catch((err) => {
    console.error('Impossible de nettoyer les sessions de présence expirées', err);
  });
}, env.presenceCleanupIntervalSeconds * 1000);
presenceCleanupTimer.unref();
