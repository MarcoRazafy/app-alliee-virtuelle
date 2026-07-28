const http = require('http');
const env = require('./config/env');
const app = require('./app');
const db = require('./config/database');
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

// Arrêt propre : les plateformes managées (Railway/Render/Fly…) envoient SIGTERM à chaque
// redéploiement. On cesse d'accepter de nouvelles connexions, on attend la fin des requêtes
// en cours, puis on ferme le pool PostgreSQL — avec un filet de sécurité si des sockets traînent.
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} reçu — arrêt propre en cours…`);
  clearInterval(presenceCleanupTimer);

  server.close(async () => {
    try {
      await db.pool.end();
    } catch (err) {
      console.error('Erreur à la fermeture du pool PostgreSQL', err);
    }
    console.log('Arrêt propre terminé.');
    process.exit(0);
  });

  // Filet de sécurité : si des connexions (ex. WebSocket) empêchent la fermeture, on force la sortie.
  setTimeout(() => {
    console.error('Arrêt forcé après délai de grâce.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
