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
        <tr><td style="background:${ACCENT};padding:20px 28px;">
          <span style="color:#ffffff;font-size:18px;font-weight:700;">${BRAND}</span>
        </td></tr>
        <tr><td style="padding:28px;">
          <h1 style="margin:0 0 12px;font-size:20px;color:#0f2544;">${esc(title)}</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3a4a63;">${intro}</p>
          <table role="presentation" cellpadding="0" cellspacing="0">${bodyHtml}${button}</table>
        </td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid #eef1f6;">
          <p style="margin:0;font-size:12px;color:#8a97ab;">
            This is an automated message from ${BRAND}. Please do not reply to this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// --- Compte approuvé (envoyé à l'employé) ---
function accountApproved(user) {
  const name = user.full_name || user.first_name || 'there';
  const loginUrl = `${env.appUrl}/login`;
  return {
    subject: `Your ${BRAND} account has been approved`,
    text: `Hi ${name},\n\nGood news — your account has been approved by an administrator. You can now sign in: ${loginUrl}\n\n${BRAND}`,
    html: layout({
      title: 'Your account is ready 🎉',
      intro: `Hi <strong>${esc(name)}</strong>, good news — your account has been <strong>approved</strong> by an administrator. You can now sign in and start using ${BRAND}.`,
      buttonLabel: 'Sign in',
      buttonUrl: loginUrl,
    }),
  };
}

// --- Compte refusé (envoyé à l'employé) ---
function accountRejected(user, motif) {
  const name = user.full_name || user.first_name || 'there';
  const reason = motif
    ? `<tr><td style="padding:0 0 16px;font-size:14px;color:#3a4a63;">
         <strong>Reason:</strong> ${esc(motif)}</td></tr>`
    : '';
  return {
    subject: `Update on your ${BRAND} registration`,
    text: `Hi ${name},\n\nAfter review, your registration was not approved.${motif ? `\nReason: ${motif}` : ''}\n\nIf you think this is a mistake, please contact your administrator.\n\n${BRAND}`,
    html: layout({
      title: 'Registration not approved',
      intro: `Hi <strong>${esc(name)}</strong>, after review, your registration to ${BRAND} was <strong>not approved</strong>.`,
      bodyHtml: `${reason}<tr><td style="padding:0 0 4px;font-size:14px;color:#3a4a63;">
        If you think this is a mistake, please contact your administrator.</td></tr>`,
    }),
  };
}

// --- Nouvelle inscription (envoyé aux administrateurs) ---
function newRegistration(user) {
  const adminUrl = `${env.appUrl}/admin/users`;
  return {
    subject: `New registration awaiting approval — ${BRAND}`,
    text: `A new employee has registered and is awaiting approval:\n\nName: ${user.full_name || '—'}\nEmail: ${user.email}\n\nReview pending accounts: ${adminUrl}`,
    html: layout({
      title: 'New registration awaiting approval',
      intro: 'A new employee has registered and is waiting for validation.',
      bodyHtml: `
        <tr><td style="padding:0 0 6px;font-size:14px;color:#3a4a63;">
          <strong>Name:</strong> ${esc(user.full_name || '—')}</td></tr>
        <tr><td style="padding:0 0 16px;font-size:14px;color:#3a4a63;">
          <strong>Email:</strong> ${esc(user.email)}</td></tr>`,
      buttonLabel: 'Review pending accounts',
      buttonUrl: adminUrl,
    }),
  };
}

module.exports = { accountApproved, accountRejected, newRegistration };
