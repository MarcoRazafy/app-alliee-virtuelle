require('dns').setDefaultResultOrder('ipv4first');

const http = require('http');
const env = require('./config/env');
const app = require('./app');
const db = require('./config/database');
const { initRealtime } = require('./realtime/io');
const { initObservability, captureError } = require('./config/observability');
const sessionModel = require('./models/session.model');
const imapService = require('./services/imap.service');

initObservability();

const server = http.createServer(app);
server.requestTimeout = 0;
initRealtime(server);

process.on('unhandledRejection', (reason) => {
  console.error('Rejet de promesse non géré :', reason);
  captureError(reason instanceof Error ? reason : new Error(String(reason)));
});

server.listen(env.port, () => {
  console.log(`API démarrée sur http://localhost:${env.port} (REST + WebSocket)`);
});

imapService.start();

const presenceCleanupTimer = setInterval(() => {
  sessionModel.expireStaleSessions().catch((err) => {
    console.error('Impossible de nettoyer les sessions de présence expirées', err);
  });
}, env.presenceCleanupIntervalSeconds * 1000);
presenceCleanupTimer.unref();

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} reçu — arrêt propre en cours…`);
  clearInterval(presenceCleanupTimer);
  imapService.stop().catch(() => {});

  server.close(async () => {
    try {
      await db.pool.end();
    } catch (err) {
      console.error('Erreur à la fermeture du pool PostgreSQL', err);
    }
    console.log('Arrêt propre terminé.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Arrêt forcé après délai de grâce.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
