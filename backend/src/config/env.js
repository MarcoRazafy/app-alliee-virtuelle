require('dotenv').config();

const nodeEnv = process.env.NODE_ENV || 'development';

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
  port: process.env.PORT || process.env.API_PORT || 3001,
  nodeEnv,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiry: process.env.JWT_EXPIRY || '7d',
  mistralApiKey: process.env.MISTRAL_API_KEY,
  mistralModel: process.env.MISTRAL_MODEL || 'mistral-medium',
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY,
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY,
  vapidSubject: process.env.VAPID_SUBJECT || 'mailto:ucan.mih@gmail.com',
  smtpHost: process.env.SMTP_HOST,
  smtpPort: Number(process.env.SMTP_PORT) || 587,
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
  mailFrom: process.env.MAIL_FROM || "L'Alliée Virtuelle <no-reply@lalliee-virtuelle.com>",
  brevoApiKey: process.env.BREVO_API_KEY,
  imapHost: process.env.IMAP_HOST || 'imap.gmail.com',
  imapPort: Number(process.env.IMAP_PORT) || 993,
  imapUser: process.env.IMAP_USER,
  imapPass: process.env.IMAP_PASS,
  imapInitialFetch: Math.max(1, Number(process.env.IMAP_INITIAL_FETCH) || 50),
  registrationNotifyEmails: (process.env.REGISTRATION_NOTIFY_EMAILS || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean),
  appUrl: (process.env.APP_URL || 'https://app.lalliee-virtuelle.com').replace(/\/+$/, ''),
  planningTimezone: process.env.PLANNING_TIMEZONE || 'Indian/Antananarivo',
  businessDayCutoffHour: Math.min(
    12,
    Math.max(0, Math.trunc(Number(process.env.BUSINESS_DAY_CUTOFF_HOUR ?? 2)) || 0)
  ),
  presenceHeartbeatTimeoutSeconds: Math.max(45, Number(process.env.PRESENCE_HEARTBEAT_TIMEOUT_SECONDS) || 60),
  sessionAbandonTimeoutSeconds: Math.max(
    300,
    Number(process.env.SESSION_ABANDON_TIMEOUT_SECONDS) || 8 * 3600
  ),
  employeeDailyConnectionLimitHours: Math.min(
    24,
    Math.max(0, Number(process.env.EMPLOYEE_DAILY_CONNECTION_LIMIT_HOURS ?? 8) || 0)
  ),
  presenceDisconnectGraceSeconds: Math.max(20, Number(process.env.PRESENCE_DISCONNECT_GRACE_SECONDS) || 30),
  presenceCleanupIntervalSeconds: Math.max(5, Number(process.env.PRESENCE_CLEANUP_INTERVAL_SECONDS) || 10),
  planningForceEditWindow: process.env.PLANNING_FORCE_EDIT_WINDOW === 'true',
};
