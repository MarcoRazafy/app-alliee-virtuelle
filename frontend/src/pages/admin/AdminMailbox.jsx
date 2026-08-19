import { useEffect, useRef, useState } from 'react';
import * as emailService from '../../services/emailService';
import { getSocket } from '../../services/socket';
import { formatDateTime, formatBytes } from '../../utils/formatters';
import { notifyError, notifySuccess } from '../../utils/toast';
import { IconMail, IconPaperclip, IconSearch, IconRefresh, IconReply } from '../../components/icons';
import '../../styles/mailbox.css';

const PAGE_SIZE = 30;

function initialsOf(name, address) {
  const src = (name || address || '?').trim();
  return src.slice(0, 2).toUpperCase();
}

// Corps d'un email rendu dans une iframe sandbox : aucun script ne s'exécute et les images
// distantes (traceurs) sont bloquées par défaut via une CSP, tant qu'on ne les autorise pas.
function EmailBody({ email }) {
  const iframeRef = useRef(null);
  // Images distantes affichées automatiquement (le script reste bloqué par la sandbox).
  const [showImages, setShowImages] = useState(true);

  const html = email.body_html;
  const text = email.body_text || '';

  useEffect(() => {
    setShowImages(true);
  }, [email.id]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const csp = [
      "default-src 'none'",
      "style-src 'unsafe-inline'",
      `img-src ${showImages ? 'https: http: data:' : 'data:'}`,
      'font-src data:',
      'media-src data:',
    ].join('; ');
    const doc = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<base target="_blank">
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #1c2b45; background: #fff; margin: 14px; font-size: 14px; line-height: 1.55; word-wrap: break-word; }
  img { max-width: 100%; height: auto; }
  a { color: #256bff; }
  table { max-width: 100%; }
  blockquote { border-left: 3px solid #d5dbe6; margin: 8px 0; padding-left: 12px; color: #5a6a86; }
</style></head><body>${html || ''}</body></html>`;
    iframe.srcdoc = doc;
  }, [html, showImages]);

  function onLoad() {
    const iframe = iframeRef.current;
    try {
      const h = iframe.contentDocument?.body?.scrollHeight;
      if (h) iframe.style.height = `${h + 24}px`;
    } catch {
      /* accès inter-origine impossible : on garde la hauteur par défaut */
    }
  }

  if (!html) {
    return <pre className="mbx-body-text">{text || '(Message vide)'}</pre>;
  }

  return (
    <div className="mbx-body-html">
      <iframe ref={iframeRef} className="mbx-iframe" title="Contenu de l'email" onLoad={onLoad} sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" />
    </div>
  );
}

export default function AdminMailbox() {
  const [emails, setEmails] = useState([]);
  const [total, setTotal] = useState(0);
  const [unread, setUnread] = useState(0);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [loadingBody, setLoadingBody] = useState(false);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);

  function loadList(reset = true) {
    return emailService
      .getEmails({ limit: PAGE_SIZE, offset: reset ? 0 : emails.length })
      .then((data) => {
        setEnabled(data.enabled);
        setTotal(data.total);
        setUnread(data.unread);
        setEmails((cur) => (reset ? data.emails : [...cur, ...data.emails]));
      })
      .catch(() => notifyError('Impossible de charger les emails'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadList(true);
    const socket = getSocket();
    const onNew = () => loadList(true);
    socket.on('mail:new', onNew);
    return () => socket.off('mail:new', onNew);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await emailService.refreshInbox();
      await loadList(true);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Actualisation impossible');
    } finally {
      setRefreshing(false);
    }
  }

  async function handleReply() {
    if (!replyBody.trim() || !selected) return;
    setSending(true);
    try {
      await emailService.replyEmail(selected.id, replyBody.trim());
      notifySuccess('Réponse envoyée');
      setReplyOpen(false);
      setReplyBody('');
    } catch (err) {
      notifyError(err.response?.data?.error || "Échec de l'envoi de la réponse");
    } finally {
      setSending(false);
    }
  }

  async function openEmail(item) {
    setLoadingBody(true);
    setReplyOpen(false);
    setReplyBody('');
    try {
      const full = await emailService.getEmail(item.id);
      setSelected(full);
      if (!item.is_read) {
        emailService.markRead(item.id, true).catch(() => {});
        setEmails((cur) => cur.map((e) => (e.id === item.id ? { ...e, is_read: true } : e)));
        setUnread((u) => Math.max(0, u - 1));
      }
    } catch {
      notifyError("Impossible d'ouvrir cet email");
    } finally {
      setLoadingBody(false);
    }
  }

  const filtered = search.trim()
    ? emails.filter((e) => {
        const q = search.toLowerCase();
        return (
          e.subject?.toLowerCase().includes(q) ||
          e.from_name?.toLowerCase().includes(q) ||
          e.from_address?.toLowerCase().includes(q) ||
          e.snippet?.toLowerCase().includes(q)
        );
      })
    : emails;

  return (
    <div className="mbx">
        <div className="mbx-list-pane">
          <div className="mbx-list-head">
            <div className="mbx-list-title">
              <IconMail />
              <span>Boîte mail</span>
              {unread > 0 && <span className="mbx-unread-badge">{unread}</span>}
            </div>
            <button
              type="button"
              className={`mbx-reload${refreshing ? ' mbx-reload--spin' : ''}`}
              onClick={handleRefresh}
              disabled={refreshing || !enabled}
              title="Actualiser la boîte mail"
              aria-label="Actualiser"
            >
              <IconRefresh />
            </button>
          </div>

          <div className="mbx-search">
            <IconSearch />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher (expéditeur, objet…)"
            />
          </div>

          {loading ? (
            <p className="mbx-empty">Chargement…</p>
          ) : !enabled ? (
            <div className="mbx-empty mbx-empty--config">
              <strong>Boîte mail non configurée.</strong>
              <p>Ajoutez <code>IMAP_USER</code> et <code>IMAP_PASS</code> (mot de passe d'application Google) aux variables d'environnement pour recevoir les emails ici.</p>
            </div>
          ) : filtered.length === 0 ? (
            <p className="mbx-empty">{search ? 'Aucun résultat.' : 'Aucun email pour le moment.'}</p>
          ) : (
            <ul className="mbx-list">
              {filtered.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`mbx-item${item.is_read ? '' : ' mbx-item--unread'}${selected?.id === item.id ? ' mbx-item--active' : ''}`}
                    onClick={() => openEmail(item)}
                  >
                    <span className="mbx-avatar">{initialsOf(item.from_name, item.from_address)}</span>
                    <span className="mbx-item-main">
                      <span className="mbx-item-top">
                        <span className="mbx-from">{item.from_name || item.from_address || 'Inconnu'}</span>
                        <span className="mbx-date">{formatDateTime(item.received_at)}</span>
                      </span>
                      <span className="mbx-subject">
                        {item.has_attachments && <IconPaperclip />}
                        {item.subject || '(sans objet)'}
                      </span>
                      <span className="mbx-snippet">{item.snippet}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!loading && enabled && !search && emails.length < total && (
            <button type="button" className="mbx-more" onClick={() => loadList(false)}>
              Charger plus ({emails.length}/{total})
            </button>
          )}
        </div>

        <div className="mbx-read-pane">
          {loadingBody ? (
            <p className="mbx-empty">Ouverture…</p>
          ) : !selected ? (
            <div className="mbx-empty mbx-read-empty">
              <IconMail />
              <p>Sélectionnez un email pour le lire.</p>
            </div>
          ) : (
            <div className="mbx-read">
              <h1 className="mbx-read-subject">{selected.subject || '(sans objet)'}</h1>
              <div className="mbx-read-meta">
                <span className="mbx-avatar mbx-avatar--lg">{initialsOf(selected.from_name, selected.from_address)}</span>
                <div className="mbx-read-from">
                  <strong>{selected.from_name || selected.from_address}</strong>
                  {selected.from_name && <span className="mbx-read-addr">{selected.from_address}</span>}
                  <span className="mbx-read-to">À : {selected.to_addresses || '—'}</span>
                </div>
                <span className="mbx-read-date">{formatDateTime(selected.received_at)}</span>
              </div>

              {Array.isArray(selected.attachments) && selected.attachments.length > 0 && (
                <div className="mbx-attachments">
                  {selected.attachments.map((a, i) => (
                    <span className="mbx-attachment" key={i} title="Pièce jointe (aperçu non téléchargeable en v1)">
                      <IconPaperclip />
                      <span className="mbx-attachment-name">{a.filename}</span>
                      {a.size ? <span className="mbx-attachment-size">{formatBytes(a.size)}</span> : null}
                    </span>
                  ))}
                </div>
              )}

              <EmailBody email={selected} />

              <div className="mbx-reply">
                {!replyOpen ? (
                  <button type="button" className="mbx-reply-btn" onClick={() => setReplyOpen(true)}>
                    <IconReply /> Répondre
                  </button>
                ) : (
                  <div className="mbx-reply-box">
                    <div className="mbx-reply-to">
                      À : <strong>{selected.from_name || selected.from_address}</strong>
                      {selected.from_name && <span> &lt;{selected.from_address}&gt;</span>}
                    </div>
                    <textarea
                      className="mbx-reply-input"
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      placeholder="Votre réponse…"
                      rows={6}
                      autoFocus
                    />
                    <div className="mbx-reply-actions">
                      <button
                        type="button"
                        className="btn-outline"
                        onClick={() => {
                          setReplyOpen(false);
                          setReplyBody('');
                        }}
                        disabled={sending}
                      >
                        Annuler
                      </button>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={handleReply}
                        disabled={sending || !replyBody.trim()}
                      >
                        {sending ? 'Envoi…' : 'Envoyer'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
}
