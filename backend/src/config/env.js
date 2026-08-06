require('dotenv').config();

const nodeEnv = process.env.NODE_ENV || 'development';

// Fail-fast : en PRODUCTION, on refuse de démarrer si une variable critique manque, avec un
// message clair — plutôt que de laisser fuiter une erreur cryptique au premier appel JWT/DB.
// En dev/test, on se contente d'un avertissement (les valeurs viennent en général de .env).
const REQUIRED_IN_PROD = ['DATABASE_URL', 'JWT_SECRET'];
const missing = REQUIRED_IN_PROD.filter((key) => !process.env[key] || !process.env[key].trim());
if (missing.length > 0) {
  const msg = `Variables d'environnement requises manquantes : ${missing.join(', ')}`;
  if (nodeEnv === 'production') {
    console.error(`❌ ${msg}. Démarrage annulé.`);
    process.exit(1);
  } else {
    console.warn(`⚠️  ${msg} (toléré en ${nodeEnv}, mais OBLIGATOIRE en production).`);
  }
}

module.exports = {
  // Railway/Render/Fly injectent le port via PORT → prioritaire. API_PORT reste pour le dev local.
  port: process.env.PORT || process.env.API_PORT || 3001,
  nodeEnv,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiry: process.env.JWT_EXPIRY || '7d',
  mistralApiKey: process.env.MISTRAL_API_KEY,
  mistralModel: process.env.MISTRAL_MODEL || 'mistral-medium',
  // Web Push (notifications). Sans ces clés, la fonctionnalité est simplement inerte
  // (aucune notif envoyée) — l'app fonctionne normalement. La clé privée reste secrète.
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY,
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY,
  vapidSubject: process.env.VAPID_SUBJECT || 'mailto:ucan.mih@gmail.com',
  // Emails transactionnels (SMTP, ex. Brevo/SendGrid/Mailgun). Inerte sans SMTP_HOST/USER/PASS.
  // Le mot de passe SMTP reste secret (variables de l'hébergeur uniquement).
  smtpHost: process.env.SMTP_HOST,
  smtpPort: Number(process.env.SMTP_PORT) || 587,
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
  mailFrom: process.env.MAIL_FROM || "L'Alliée Virtuelle <no-reply@lalliee-virtuelle.com>",
  // API HTTP Brevo (recommandé en prod : contourne le blocage du SMTP sortant de Railway).
  // Si présent, l'email passe par Brevo au lieu du SMTP. L'expéditeur = MAIL_FROM.
  brevoApiKey: process.env.BREVO_API_KEY,
  // Emails supplémentaires (séparés par des virgules) qui reçoivent AUSSI la notification de
  // nouvelle inscription, en plus des admins — sans avoir les droits admin. Ex :
  // REGISTRATION_NOTIFY_EMAILS="rh@exemple.com, direction@exemple.com"
  registrationNotifyEmails: (process.env.REGISTRATION_NOTIFY_EMAILS || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean),
  // URL publique de l'app, pour les liens dans les emails (connexion, page admin).
  appUrl: (process.env.APP_URL || 'https://app.lalliee-virtuelle.com').replace(/\/+$/, ''),
  planningTimezone: process.env.PLANNING_TIMEZONE || 'Indian/Antananarivo',
  // Le frontend envoie un heartbeat toutes les 20 secondes. Après ce délai, une session
  // ouverte sans activité récente n'est plus considérée en ligne ni prolongée indéfiniment.
  presenceHeartbeatTimeoutSeconds: Math.max(45, Number(process.env.PRESENCE_HEARTBEAT_TIMEOUT_SECONDS) || 60),
  // pagehide est aussi émis lors d'un simple rechargement. Cette courte tolérance laisse
  // le nouveau document annuler la demande avant de clôturer réellement présence + tâche.
  presenceDisconnectGraceSeconds: Math.max(20, Number(process.env.PRESENCE_DISCONNECT_GRACE_SECONDS) || 30),
  presenceCleanupIntervalSeconds: Math.max(5, Number(process.env.PRESENCE_CLEANUP_INTERVAL_SECONDS) || 10),
  // Bascule de TEST uniquement : force la fenêtre de saisie employé (samedi/dimanche) à
  // rester ouverte en permanence, pour pouvoir qualifier l'interface sans attendre le week-end.
  // Doit rester à false hors environnement de test/démo (voir .env.example).
  planningForceEditWindow: process.env.PLANNING_FORCE_EDIT_WINDOW === 'true',
};
