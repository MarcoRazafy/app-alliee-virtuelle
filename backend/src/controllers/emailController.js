const emailModel = require('../models/email.model');
const imapService = require('../services/imap.service');
const mailService = require('../services/mail.service');

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Construit une citation légère de l'email d'origine (sous la réponse), en texte et en HTML.
function buildQuote(original) {
  const who = original.from_name || original.from_address || 'Expéditeur';
  const when = original.received_at ? new Date(original.received_at).toLocaleString('fr-FR') : '';
  const src = (original.body_text || '').slice(0, 1500);
  const intro = `Le ${when}, ${who} a écrit :`;
  const text = `${intro}\n${src
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n')}`;
  const html = `<div style="color:#5a6a86;border-left:3px solid #d5dbe6;padding-left:12px;margin-top:8px;">
    <p style="margin:0 0 6px;">${escapeHtml(intro)}</p>
    <div style="white-space:pre-wrap;">${escapeHtml(src)}</div>
  </div>`;
  return { text, html };
}

// Liste paginée des emails (vue « Boîte mail »), + totaux.
async function listEmails(req, res, next) {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const [emails, total, unread] = await Promise.all([
      emailModel.listEmails({ limit, offset }),
      emailModel.countEmails(),
      emailModel.countUnread(),
    ]);
    res.status(200).json({ emails, total, unread, enabled: imapService.isEnabled() });
  } catch (err) {
    next(err);
  }
}

async function getUnreadCount(req, res, next) {
  try {
    const unread = await emailModel.countUnread();
    res.status(200).json({ unread });
  } catch (err) {
    next(err);
  }
}

// Détail complet d'un email (corps HTML/texte + pièces jointes).
async function getEmail(req, res, next) {
  try {
    const email = await emailModel.getEmailById(req.params.id);
    if (!email) return res.status(404).json({ error: 'Email introuvable' });
    res.status(200).json(email);
  } catch (err) {
    next(err);
  }
}

// Marque lu / non lu.
async function markRead(req, res, next) {
  try {
    const updated = await emailModel.setRead(req.params.id, req.body.is_read !== false);
    if (!updated) return res.status(404).json({ error: 'Email introuvable' });
    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}

// Force une synchronisation IMAP immédiate (bouton « Actualiser »).
async function refresh(req, res, next) {
  try {
    if (!imapService.isEnabled()) {
      return res.status(503).json({ error: 'Boîte mail non configurée (IMAP absent).' });
    }
    await imapService.refresh();
    const unread = await emailModel.countUnread();
    res.status(200).json({ ok: true, unread });
  } catch (err) {
    next(err);
  }
}

// Répond à un email : envoie depuis l'adresse de la boîte (MAIL_FROM), rattaché au fil.
async function replyEmail(req, res, next) {
  try {
    if (!mailService.isEnabled()) {
      return res.status(503).json({ error: "L'envoi d'emails n'est pas configuré (SMTP/Brevo)." });
    }
    const original = await emailModel.getEmailById(req.params.id);
    if (!original) return res.status(404).json({ error: 'Email introuvable' });
    if (!original.from_address) {
      return res.status(400).json({ error: "Adresse de l'expéditeur inconnue — réponse impossible." });
    }
    const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
    if (!body) return res.status(400).json({ error: 'Le message est vide' });
    if (body.length > 20000) return res.status(400).json({ error: 'Message trop long (20000 caractères max)' });

    const baseSubject = original.subject || '';
    const subject = /^\s*re\s*:/i.test(baseSubject) ? baseSubject : `Re: ${baseSubject}`.trim();
    const quote = buildQuote(original);
    const text = `${body}\n\n${quote.text}`;
    const html = `<div style="white-space:pre-wrap;">${escapeHtml(body)}</div>${quote.html}`;

    const sent = await mailService.sendMail({
      to: original.from_address,
      subject,
      text,
      html,
      inReplyTo: original.message_id || undefined,
      references: original.message_id || undefined,
    });
    if (!sent) return res.status(502).json({ error: "L'envoi de la réponse a échoué." });

    await emailModel.setRead(req.params.id, true).catch(() => {});
    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { listEmails, getUnreadCount, getEmail, markRead, refresh, replyEmail };
