const nodemailer = require('nodemailer');
const env = require('./../config/env');
const templates = require('./mailTemplates');

// Deux transports possibles, Brevo prioritaire :
// 1) API HTTP Brevo (prod) : envoi via HTTPS (port 443), qui CONTOURNE le blocage du SMTP
//    sortant de Railway (25/465/587 → Connection timeout). Recommandé.
// 2) SMTP nodemailer (pratique en local, où le SMTP n'est pas bloqué).
// Inerte si aucun n'est configuré (rien ne casse).
const brevoEnabled = Boolean(env.brevoApiKey);
const smtpEnabled = Boolean(env.smtpHost && env.smtpUser && env.smtpPass);
const enabled = brevoEnabled || smtpEnabled;

// Décompose MAIL_FROM ("Nom <email>" ou "email") en { name, email } pour l'API Brevo.
function parseFrom(from) {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from || '');
  if (m) return { name: m[1] || undefined, email: m[2].trim() };
  return { email: (from || '').trim() };
}
const sender = parseFrom(env.mailFrom);

let transporter = null;
if (brevoEnabled) {
  console.log(`✅ Email via API Brevo (HTTP) — expéditeur ${sender.email}`);
} else if (smtpEnabled) {
  transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    family: 4, // Railway sans egress IPv6 → force IPv4 (sinon ENETUNREACH sur l'IPv6 de Gmail)
    secure: env.smtpPort === 465, // 465 = SSL implicite ; 587 = STARTTLS
    requireTLS: env.smtpPort !== 465, // 587 : impose STARTTLS (jamais d'envoi en clair)
    auth: { user: env.smtpUser, pass: env.smtpPass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  transporter
    .verify()
    .then(() => console.log(`✅ SMTP prêt : connexion + auth OK (${env.smtpHost}:${env.smtpPort})`))
    .catch((err) => console.error('❌ SMTP : connexion/auth échouée —', err.message));
} else {
  console.warn('⚠️  Email désactivé : ni BREVO_API_KEY, ni SMTP_HOST/USER/PASS.');
}

function isEnabled() {
  return enabled;
}

// Envoi via l'API HTTP de Brevo (https → contourne le blocage SMTP de Railway).
// `headers` (optionnel) : entêtes personnalisés, ex. { 'In-Reply-To': '<id>', 'References': '<id>' }
// pour rattacher une réponse au fil de discussion. `replyTo` (optionnel) : adresse de réponse.
function toBrevoRecipients(list) {
  return String(list || '')
    .split(',')
    .map((e) => ({ email: e.trim() }))
    .filter((r) => r.email);
}

async function sendViaBrevo({ to, bcc, subject, html, text, headers, replyTo }) {
  const recipients = toBrevoRecipients(to);
  const payload = { sender, to: recipients, subject, htmlContent: html, textContent: text };
  // Copie cachée : indispensable pour un envoi collectif, sinon chaque destinataire
  // découvrirait l'adresse de tous les autres.
  const hidden = toBrevoRecipients(bcc);
  if (hidden.length) payload.bcc = hidden;
  if (headers && Object.keys(headers).length) payload.headers = headers;
  if (replyTo) payload.replyTo = { email: replyTo };
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.brevoApiKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo API ${res.status} — ${body.slice(0, 300)}`);
  }
}

// Envoi bas niveau, best-effort : ne jette JAMAIS (un email raté ne doit pas faire échouer
// l'action métier — approbation de compte, inscription…). Renvoie true si envoyé.
async function sendMail({ to, bcc, subject, html, text, inReplyTo, references, replyTo }) {
  if (!enabled || (!to && !bcc)) return false;
  // Entêtes de threading (réponse rattachée au fil) partagés entre Brevo et SMTP.
  const headers = {};
  if (inReplyTo) headers['In-Reply-To'] = inReplyTo;
  if (references) headers['References'] = references;
  try {
    if (brevoEnabled) {
      await sendViaBrevo({ to, bcc, subject, html, text, headers, replyTo });
    } else {
      await transporter.sendMail({
        from: env.mailFrom,
        to,
        bcc: bcc || undefined,
        subject,
        html,
        text,
        replyTo: replyTo || undefined,
        inReplyTo: inReplyTo || undefined,
        references: references || undefined,
      });
    }
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

// Un employé a proposé une tâche (« Non validée ») → prévenir les admins.
function sendNewTaskProposalToAdmins(task, proposerName, adminEmails) {
  const recipients = [...new Set((adminEmails || []).filter(Boolean))];
  if (recipients.length === 0) return Promise.resolve(false);
  const { subject, html, text } = templates.newTaskProposal(task, proposerName);
  return sendMail({ to: recipients.join(', '), subject, html, text });
}

// Un employé a demandé une tâche supplémentaire → prévenir les admins.
// Nouvelle annonce → toute l'équipe, « pour ne rien manquer ». Les destinataires passent en
// COPIE CACHÉE : un envoi groupé en clair exposerait l'adresse de chacun à tous les autres.
function sendAnnouncementToTeam(announcement, recipientEmails) {
  const recipients = (recipientEmails || []).map((e) => (e || '').trim()).filter(Boolean);
  if (recipients.length === 0) return Promise.resolve();
  const { subject, html, text } = templates.newAnnouncement(announcement);
  // Destinataire visible = l'expéditeur lui-même ; l'équipe est en copie cachée.
  return sendMail({ to: env.mailFrom, bcc: recipients.join(', '), subject, html, text });
}

function sendNewTaskRequestToAdmins(payload, adminEmails) {
  const recipients = [...new Set((adminEmails || []).filter(Boolean))];
  if (recipients.length === 0) return Promise.resolve(false);
  const { subject, html, text } = templates.newTaskRequest(payload);
  return sendMail({ to: recipients.join(', '), subject, html, text });
}

module.exports = {
  isEnabled,
  sendMail,
  sendAccountApproved,
  sendAccountRejected,
  sendAccountPending,
  sendNewRegistrationToAdmins,
  sendNewTaskProposalToAdmins,
  sendNewTaskRequestToAdmins,
  sendAnnouncementToTeam,
};
