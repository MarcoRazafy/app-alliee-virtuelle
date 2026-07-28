// Monitoring d'erreurs OPTIONNEL (Sentry). Totalement inerte par défaut : rien ne s'active tant
// que la variable SENTRY_DSN n'est pas définie. Aucune dépendance n'est forcée — @sentry/node est
// chargé paresseusement s'il est installé, sinon on se contente d'un avertissement.
//   Pour activer :  npm i @sentry/node  +  définir SENTRY_DSN=<dsn> en production.

let client = null;
let enabled = false;

function initObservability() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return; // désactivé : comportement par défaut, aucune surcharge

  try {
    // eslint-disable-next-line global-require, import/no-unresolved
    const Sentry = require('@sentry/node');
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: 0, // suivi d'erreurs uniquement (pas de tracing de perf)
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

// Remonte une erreur inattendue au monitoring. Sans effet si le monitoring est désactivé.
function captureError(err) {
  if (!enabled || !client) return;
  try {
    client.captureException(err);
  } catch {
    /* ne jamais faire échouer le flux applicatif à cause du monitoring */
  }
}

module.exports = { initObservability, captureError };
