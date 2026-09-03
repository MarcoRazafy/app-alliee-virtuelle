const env = require('../config/env');

const BRAND = "L'Alliée Virtuelle";
const ACCENT = '#256bff';

// Échappe le HTML des valeurs dynamiques (nom, motif…) pour éviter toute injection dans l'email.
function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Gabarit commun : en-tête coloré + contenu + bouton optionnel + pied de page.
function layout({ title, intro, bodyHtml = '', buttonLabel, buttonUrl }) {
  const button =
    buttonLabel && buttonUrl
      ? `<tr><td style="padding:8px 0 4px;">
           <a href="${esc(buttonUrl)}" style="display:inline-block;background:${ACCENT};color:#ffffff;
              text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px;">
             ${esc(buttonLabel)}</a>
         </td></tr>`
      : '';
  return `<!doctype html>
<html><body style="margin:0;background:#f4f7fc;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c2b45;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fc;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0"
             style="max-width:520px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;
                    box-shadow:0 6px 24px rgba(9,30,66,0.08);">
        <tr><td style="background:${ACCENT};padding:18px 28px;">
          <img src="${env.appUrl}/logo.png" alt="${BRAND}" height="30"
               style="height:30px;width:auto;display:block;border:0;outline:none;text-decoration:none;" />
        </td></tr>
        <tr><td style="padding:28px;">
          <h1 style="margin:0 0 12px;font-size:20px;color:#0f2544;">${esc(title)}</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3a4a63;">${intro}</p>
          <table role="presentation" cellpadding="0" cellspacing="0">${bodyHtml}${button}</table>
        </td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid #eef1f6;">
          <p style="margin:0;font-size:12px;color:#8a97ab;">
            Ceci est un message automatique de ${BRAND}. Merci de ne pas répondre à cet email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// --- Compte approuvé (envoyé à l'employé) ---
function accountApproved(user) {
  const name = user.full_name || user.first_name || 'bonjour';
  const loginUrl = `${env.appUrl}/login`;
  return {
    subject: `Votre compte ${BRAND} a été approuvé`,
    text: `Bonjour ${name},\n\nBonne nouvelle — votre compte a été approuvé par un administrateur. Vous pouvez maintenant vous connecter : ${loginUrl}\n\n${BRAND}`,
    html: layout({
      title: 'Votre compte est prêt 🎉',
      intro: `Bonjour <strong>${esc(name)}</strong>, bonne nouvelle — votre compte a été <strong>approuvé</strong> par un administrateur. Vous pouvez maintenant vous connecter et commencer à utiliser ${BRAND}.`,
      buttonLabel: 'Se connecter',
      buttonUrl: loginUrl,
    }),
  };
}

// --- Compte refusé (envoyé à l'employé) ---
function accountRejected(user, motif) {
  const name = user.full_name || user.first_name || 'bonjour';
  const reason = motif
    ? `<tr><td style="padding:0 0 16px;font-size:14px;color:#3a4a63;">
         <strong>Motif :</strong> ${esc(motif)}</td></tr>`
    : '';
  return {
    subject: `Mise à jour concernant votre inscription ${BRAND}`,
    text: `Bonjour ${name},\n\nAprès examen, votre inscription n'a pas été approuvée.${motif ? `\nMotif : ${motif}` : ''}\n\nSi vous pensez qu'il s'agit d'une erreur, veuillez contacter votre administrateur.\n\n${BRAND}`,
    html: layout({
      title: 'Inscription non approuvée',
      intro: `Bonjour <strong>${esc(name)}</strong>, après examen, votre inscription à ${BRAND} n'a <strong>pas été approuvée</strong>.`,
      bodyHtml: `${reason}<tr><td style="padding:0 0 4px;font-size:14px;color:#3a4a63;">
        Si vous pensez qu'il s'agit d'une erreur, veuillez contacter votre administrateur.</td></tr>`,
    }),
  };
}

// --- Compte créé, en attente de validation (envoyé au NOUVEL inscrit) ---
function accountPending(user) {
  const name = user.full_name || user.first_name || 'bonjour';
  return {
    subject: `Votre inscription ${BRAND} a bien été reçue`,
    text: `Bonjour ${name},\n\nVotre compte a bien été créé. Il doit maintenant être validé par un administrateur avant votre première connexion. Vous recevrez un email dès que votre compte sera approuvé.\n\n${BRAND}`,
    html: layout({
      title: 'Inscription bien reçue ✅',
      intro: `Bonjour <strong>${esc(name)}</strong>, votre compte a bien été <strong>créé</strong>. Il doit maintenant être <strong>validé par un administrateur</strong> avant votre première connexion.`,
      bodyHtml: `<tr><td style="padding:0 0 4px;font-size:14px;color:#3a4a63;">
        Vous recevrez un email dès que votre compte sera approuvé. Merci de votre patience.</td></tr>`,
    }),
  };
}

// --- Nouvelle inscription (envoyé aux administrateurs) ---
function newRegistration(user) {
  const adminUrl = `${env.appUrl}/admin/users`;
  return {
    subject: `Nouvelle inscription en attente de validation — ${BRAND}`,
    text: `Un nouvel employé s'est inscrit et attend une validation :\n\nNom : ${user.full_name || '—'}\nEmail : ${user.email}\n\nExaminer les comptes en attente : ${adminUrl}`,
    html: layout({
      title: 'Nouvelle inscription en attente de validation',
      intro: "Un nouvel employé s'est inscrit et attend une validation.",
      bodyHtml: `
        <tr><td style="padding:0 0 6px;font-size:14px;color:#3a4a63;">
          <strong>Nom :</strong> ${esc(user.full_name || '—')}</td></tr>
        <tr><td style="padding:0 0 16px;font-size:14px;color:#3a4a63;">
          <strong>Email :</strong> ${esc(user.email)}</td></tr>`,
      buttonLabel: 'Examiner les comptes en attente',
      buttonUrl: adminUrl,
    }),
  };
}

// Un employé a PROPOSÉ une tâche (statut « Non validée ») → prévenir les admins.
function newTaskProposal(task, proposerName) {
  const adminUrl = `${env.appUrl}/admin/validate`;
  const name = proposerName || '—';
  const title = task?.title || '—';
  return {
    subject: `Nouvelle tâche à valider — ${BRAND}`,
    text: `${name} a proposé une nouvelle tâche à valider :\n\nTâche : ${title}\n\nValider les tâches : ${adminUrl}`,
    html: layout({
      title: 'Nouvelle tâche à valider',
      intro: `<strong>${esc(name)}</strong> a proposé une nouvelle tâche. Elle attend votre validation.`,
      bodyHtml: `
        <tr><td style="padding:0 0 16px;font-size:14px;color:#3a4a63;">
          <strong>Tâche :</strong> ${esc(title)}</td></tr>`,
      buttonLabel: 'Valider les tâches',
      buttonUrl: adminUrl,
    }),
  };
}

// Un employé a DEMANDÉ une tâche supplémentaire (après avoir validé sa journée) → prévenir les admins.
function newTaskRequest({ requesterName, taskTitle, message }) {
  const adminUrl = `${env.appUrl}/admin/task-requests`;
  const name = requesterName || '—';
  const title = taskTitle || '—';
  return {
    subject: `Nouvelle demande de tâche — ${BRAND}`,
    text:
      `${name} demande une tâche supplémentaire :\n\nTâche : ${title}` +
      (message ? `\nMessage : ${message}` : '') +
      `\n\nExaminer les demandes : ${adminUrl}`,
    html: layout({
      title: 'Nouvelle demande de tâche',
      intro: `<strong>${esc(name)}</strong> demande une tâche supplémentaire à faire.`,
      bodyHtml: `
        <tr><td style="padding:0 0 6px;font-size:14px;color:#3a4a63;">
          <strong>Tâche :</strong> ${esc(title)}</td></tr>
        ${
          message
            ? `<tr><td style="padding:0 0 16px;font-size:14px;color:#3a4a63;">
                 <strong>Message :</strong> ${esc(message)}</td></tr>`
            : ''
        }`,
      buttonLabel: 'Examiner les demandes',
      buttonUrl: adminUrl,
    }),
  };
}

// Le corps d'une annonce est saisi dans l'éditeur riche : du HTML. On n'en met PAS le balisage
// dans l'email — les clients de messagerie le rendent de façon imprévisible, et l'email n'est
// qu'un rappel. On en extrait un aperçu en texte, le bouton renvoyant à l'annonce complète.
function htmlExcerpt(html, maxLength = 320) {
  const text = String(html || '')
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).replace(/\s+\S*$/, '')}…`;
}

// Nouvelle annonce publiée → prévenir toute l'équipe par email, « pour ne rien manquer ».
function newAnnouncement({ id, title, body, authorName, isImportant }) {
  // ?open=<id> ouvre directement le détail de l'annonce (déjà géré par la page Annonces).
  const url = `${env.appUrl}/announcements?open=${encodeURIComponent(id)}`;
  const safeTitle = title || 'Nouvelle annonce';
  const author = authorName || "L'équipe";
  const excerpt = htmlExcerpt(body);
  const importantTag = isImportant ? '[Important] ' : '';
  return {
    subject: `${importantTag}Nouvelle annonce : ${safeTitle} — ${BRAND}`,
    text:
      `${author} a publié une annonce : ${safeTitle}` +
      (excerpt ? `\n\n${excerpt}` : '') +
      `\n\nLire l'annonce : ${url}`,
    html: layout({
      title: isImportant ? `Annonce importante : ${safeTitle}` : `Nouvelle annonce : ${safeTitle}`,
      intro: `<strong>${esc(author)}</strong> vient de publier une annonce.`,
      bodyHtml: excerpt
        ? `<tr><td style="padding:0 0 16px;font-size:14px;color:#3a4a63;line-height:1.6;">${esc(excerpt)}</td></tr>`
        : '',
      buttonLabel: "Lire l'annonce",
      buttonUrl: url,
    }),
  };
}

module.exports = {
  accountApproved,
  accountRejected,
  accountPending,
  newRegistration,
  newTaskProposal,
  newTaskRequest,
  newAnnouncement,
  htmlExcerpt,
};
