let client = null;
let enabled = false;

function initObservability() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  try {
    // eslint-disable-next-line global-require, import/no-unresolved
    const Sentry = require('@sentry/node');
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: 0,
    });
    client = Sentry;
    enabled = true;
    console.log('✅ Monitoring Sentry activé.');
  } catch {
    console.warn(
      "⚠️  SENTRY_DSN est défini mais le paquet @sentry/node n'est pas installé. " +
        'Le monitoring reste désactivé (lancez : npm i @sentry/node).'
    );
  }
}

function captureError(err) {
  if (!enabled || !client) return;
  try {
    client.captureException(err);
  } catch {
  }
}

module.exports = { initObservability, captureError };
