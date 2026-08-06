const nodemailer = require('nodemailer');
const env = require('./../config/env');
const templates = require('./mailTemplates');

// L'email est actif seulement si le SMTP est configuré (hôte + identifiants). Sinon le service
// est inerte : aucun email envoyé, mais rien ne casse (utile en dev/local sans SMTP).
const enabled = Boolean(env.smtpHost && env.smtpUser && env.smtpPass);

let transporter = null;
if (enabled) {
  transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpPort === 465, // 465 = SSL implicite ; 587 = STARTTLS
    requireTLS: env.smtpPort !== 465, // 587 : impose STARTTLS (jamais d'envoi en clair)
    auth: { user: env.smtpUser, pass: env.smtpPass },
    // Évite qu'un envoi reste bloqué indéfiniment si le SMTP ne répond pas (symptôme
    // « parfois l'email ne part pas ») : on échoue proprement au lieu de pendre.
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  // Diagnostic au démarrage : teste connexion + authentification SMTP et journalise un
  // résultat clair. Répond au cas « mail: true mais aucun email n'arrive » : si l'auth Gmail
  // (mot de passe d'application) est refusée, on le voit ici au lieu de chercher à l'aveugle.
  transporter
    .verify()
    .then(() => console.log(`✅ SMTP prêt : connexion + auth OK (${env.smtpHost}:${env.smtpPort})`))
    .catch((err) => console.error('❌ SMTP : connexion/auth échouée —', err.message));
} else {
  console.warn('⚠️  SMTP non configuré : emails désactivés (SMTP_HOST/USER/PASS manquants).');
}

function isEnabled() {
  return enabled;
}

// Envoi bas niveau, best-effort : ne jette JAMAIS (un email raté ne doit pas faire échouer
// l'action métier — approbation de compte, inscription…). Renvoie true si envoyé.
async function sendMail({ to, subject, html, text }) {
  if (!enabled || !to) return false;
  try {
    await transporter.sendMail({ from: env.mailFrom, to, subject, html, text });
    return true;
  } catch (err) {
    console.error('Email : envoi échoué', err.message);
    return false;
  }
}

// --- Fonctions métier (une par type d'email) ---

function sendAccountApproved(user) {
  const { subject, html, text } = templates.accountApproved(user);
  return sendMail({ to: user.email, subject, html, text });
}

function sendAccountRejected(user, motif) {
  const { subject, html, text } = templates.accountRejected(user, motif);
  return sendMail({ to: user.email, subject, html, text });
}

// Accusé de réception envoyé au NOUVEL inscrit : compte créé, en attente de validation admin.
function sendAccountPending(user) {
  const { subject, html, text } = templates.accountPending(user);
  return sendMail({ to: user.email, subject, html, text });
}

// Envoi aux administrateurs (liste d'emails) qu'une nouvelle inscription attend validation.
function sendNewRegistrationToAdmins(user, adminEmails) {
  const recipients = [...new Set((adminEmails || []).filter(Boolean))];
  if (recipients.length === 0) return Promise.resolve(false);
  const { subject, html, text } = templates.newRegistration(user);
  return sendMail({ to: recipients.join(', '), subject, html, text });
}

module.exports = {
  isEnabled,
  sendMail,
  sendAccountApproved,
  sendAccountRejected,
  sendAccountPending,
  sendNewRegistrationToAdmins,
};
