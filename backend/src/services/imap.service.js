const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const env = require('../config/env');
const emailModel = require('../models/email.model');
const { broadcast } = require('../realtime/io');

// Boîte mail entrante : on se connecte à Gmail en IMAP, on rattrape les mails récents au
// démarrage, puis on reste en écoute (IDLE) pour recevoir les nouveaux en temps réel.
// Inerte sans IMAP_USER/IMAP_PASS (mot de passe d'application Google, en variables d'env).

const enabled = Boolean(env.imapUser && env.imapPass);
const ACCOUNT = env.imapUser;
const MAILBOX = 'INBOX';

let client = null;
let stopped = false;
let syncing = false;

function isEnabled() {
  return enabled;
}

// Parse un message brut et l'insère (sans doublon). Renvoie la ligne insérée, ou null.
async function handleMessage(msg) {
  try {
    const parsed = await simpleParser(msg.source);
    const from = (parsed.from && parsed.from.value && parsed.from.value[0]) || {};
    const attachments = (parsed.attachments || []).map((a) => ({
      filename: a.filename || 'pièce jointe',
      contentType: a.contentType || 'application/octet-stream',
      size: a.size || 0,
    }));
    const text = parsed.text || '';
    const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 240);
    const html = parsed.html ? String(parsed.html) : null;
    const seen = msg.flags instanceof Set ? msg.flags.has('\\Seen') : false;

    return await emailModel.insertEmail({
      account: ACCOUNT,
      mailbox: MAILBOX,
      imap_uid: Number(msg.uid),
      message_id: parsed.messageId || null,
      from_name: from.name || null,
      from_address: from.address || null,
      to_addresses: (parsed.to && parsed.to.text) || null,
      subject: parsed.subject || null,
      snippet,
      body_text: text ? text.slice(0, 200000) : null,
      body_html: html ? html.slice(0, 2000000) : null,
      has_attachments: attachments.length > 0,
      attachments,
      received_at: parsed.date || msg.internalDate || null,
      is_read: seen,
    });
  } catch (err) {
    console.error('IMAP : message ignoré —', err.message);
    return null;
  }
}

// Récupère ce qui est plus récent que le dernier UID stocké (ou les N derniers au 1er run).
async function syncNew() {
  if (syncing || !client) return;
  syncing = true;
  try {
    const maxUid = await emailModel.getMaxUid(ACCOUNT, MAILBOX);
    let range;
    let byUid;
    if (maxUid > 0) {
      // Tout ce qui a un UID supérieur. (IMAP renvoie au pire le dernier message déjà connu,
      // que le ON CONFLICT DO NOTHING ignore — pas de doublon.)
      range = `${maxUid + 1}:*`;
      byUid = true;
    } else {
      const total = (client.mailbox && client.mailbox.exists) || 0;
      if (!total) return;
      range = `${Math.max(1, total - env.imapInitialFetch + 1)}:*`;
      byUid = false;
    }

    let count = 0;
    for await (const msg of client.fetch(
      range,
      { uid: true, flags: true, internalDate: true, source: true },
      { uid: byUid }
    )) {
      const inserted = await handleMessage(msg);
      if (inserted) {
        count += 1;
        broadcast('mail:new', { id: inserted.id });
      }
    }
    if (count) console.log(`📥 IMAP : ${count} nouvel(aux) email(s) synchronisé(s).`);
  } catch (err) {
    console.error('IMAP : synchronisation échouée —', err.message);
  } finally {
    syncing = false;
  }
}

async function connectAndWatch() {
  if (stopped) return;
  client = new ImapFlow({
    host: env.imapHost,
    port: env.imapPort,
    secure: true,
    auth: { user: env.imapUser, pass: env.imapPass },
    logger: false,
  });

  client.on('error', (err) => console.error('IMAP : erreur —', err.message));
  client.on('close', () => {
    if (stopped) return;
    console.warn('IMAP : connexion fermée — reconnexion dans 15 s…');
    client = null;
    setTimeout(connectAndWatch, 15000);
  });
  // Nouveau(x) message(s) arrivé(s) pendant l'écoute IDLE → on synchronise.
  client.on('exists', () => {
    syncNew();
  });

  try {
    await client.connect();
    await client.mailboxOpen(MAILBOX);
    console.log(`✅ IMAP connecté à ${ACCOUNT} (${MAILBOX}) — écoute des nouveaux mails.`);
    await syncNew();
  } catch (err) {
    console.error('IMAP : connexion échouée —', err.message);
    client = null;
    if (!stopped) setTimeout(connectAndWatch, 30000);
  }
}

function start() {
  if (!enabled) {
    console.warn('⚠️  Boîte mail désactivée : IMAP_USER/IMAP_PASS absents.');
    return;
  }
  stopped = false;
  connectAndWatch();
}

async function stop() {
  stopped = true;
  if (client) {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
    client = null;
  }
}

// Déclenche une synchro à la demande (bouton « Actualiser » de la page).
async function refresh() {
  if (!client) return false;
  await syncNew();
  return true;
}

module.exports = { isEnabled, start, stop, refresh };
