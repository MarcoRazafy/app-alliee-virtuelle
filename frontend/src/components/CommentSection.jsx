import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as taskService from '../services/taskService';
import * as avatarService from '../services/avatarService';
import * as userService from '../services/userService';
import { formatDateTime, formatBytes } from '../utils/formatters';
import { notifyError, notifySuccess } from '../utils/toast';
import useAuthStore from '../store/authStore';
import { IconPaperclip, IconX, IconFileText, IconDownload, IconTrash, IconPencil } from './icons';
import Markdown from './Markdown';
import MarkdownToolbar from './MarkdownToolbar';

// Les mentions restent stockées dans le contenu sous la forme `@[Nom](uuid)`, en texte brut.
// Leur découpage à l'affichage est désormais assuré par <Markdown/> (prop renderMention),
// pour qu'une mention placée dans une puce ou en gras reste dans son bloc.

const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024; // aligné sur la limite serveur (config/upload.js)

function initialsOf(name) {
  return (
    String(name || '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || '')
      .join('') || '?'
  );
}

function SendIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 12l16-8-6 16-3-6-7-2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

// Panneau d'activité (commentaires + notes internes admin), façon ClickUp.
function CommentSection({ taskId, focusCommentId = null }) {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'ADMIN';

  const [comments, setComments] = useState([]);
  const [notes, setNotes] = useState([]);
  const [content, setContent] = useState('');
  const [asNote, setAsNote] = useState(false);
  const [sending, setSending] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [avatarUrls, setAvatarUrls] = useState({}); // author_id → objectURL de la photo
  const [people, setPeople] = useState([]); // annuaire, pour les mentions
  const [mentionQuery, setMentionQuery] = useState(null); // texte tapé après « @ » (null = fermé)
  const inputRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await taskService.getComments(taskId);
      setComments(data);
      if (isAdmin) setNotes(await taskService.getNotes(taskId));
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de charger les commentaires');
    }
  }, [taskId, isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  // Fil unique trié chronologiquement : commentaires + notes internes (taguées).
  const items = useMemo(
    () =>
      [
        ...comments.map((c) => ({ ...c, kind: 'comment' })),
        ...notes.map((n) => ({ ...n, kind: 'note' })),
      ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    [comments, notes]
  );

  // Photos de profil des auteurs (une fois par auteur, repli initiales si échec/absent).
  const fetchedRef = useRef(new Set());
  const urlsRef = useRef({});
  useEffect(() => {
    urlsRef.current = avatarUrls;
  }, [avatarUrls]);
  useEffect(() => () => Object.values(urlsRef.current).forEach((u) => u && URL.revokeObjectURL(u)), []);

  // Le drapeau « monté » vaut pour le COMPOSANT, pas pour une exécution d'effet. Avec un
  // drapeau par exécution, la photo n'apparaissait jamais en développement : StrictMode
  // lance l'effet, le nettoie (drapeau à false), puis le relance — mais fetchedRef avait
  // déjà mémorisé l'auteur, donc la seconde exécution ne redemandait rien et la réponse de
  // la première était jetée. Restaient les initiales.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const need = [...new Set(items.filter((it) => it.has_avatar && it.author_id).map((it) => it.author_id))].filter(
      (id) => !fetchedRef.current.has(id)
    );
    if (need.length === 0) return;
    need.forEach((id) => fetchedRef.current.add(id));
    need.forEach(async (id) => {
      try {
        const blob = await avatarService.getUserAvatarBlob(id);
        const url = URL.createObjectURL(blob);
        if (mountedRef.current) setAvatarUrls((cur) => ({ ...cur, [id]: url }));
        else URL.revokeObjectURL(url);
      } catch {
        fetchedRef.current.delete(id); // autorise une nouvelle tentative
      }
    });
  }, [items]);

  // Édition en place : { id, content }. Un seul message à la fois, pour ne pas semer des
  // brouillons non enregistrés dans tout le fil.
  const [editing, setEditing] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const editRef = useRef(null);

  async function saveEdit() {
    if (!editing || !editing.content.trim() || savingEdit) return;
    setSavingEdit(true);
    try {
      await taskService.updateComment(taskId, editing.id, editing.content.trim());
      setEditing(null);
      await load();
      notifySuccess('Commentaire modifié');
    } catch (err) {
      notifyError(err.response?.data?.error || 'Modification impossible');
    } finally {
      setSavingEdit(false);
    }
  }

  async function removeComment(item) {
    const label = item.kind === 'note' ? 'cette note interne' : 'ce commentaire';
    if (!window.confirm(`Supprimer ${label} ? Les fichiers joints seront également retirés.`)) return;
    try {
      await taskService.deleteComment(taskId, item.id);
      // Rechargement plutôt que retrait local : le fil mélange commentaires et notes, qui
      // proviennent de deux appels distincts.
      await load();
      notifySuccess('Commentaire supprimé');
    } catch (err) {
      notifyError(err.response?.data?.error || 'Suppression impossible');
    }
  }

  async function submit() {
    // Un fichier seul (sans texte) est un envoi valide : on ne bloque plus sur le contenu.
    if ((!content.trim() && !pendingFile) || sending) return;
    setSending(true);
    try {
      const created =
        isAdmin && asNote
          ? await taskService.createNote(taskId, content || pendingFile.name)
          : await taskService.createComment(taskId, content || pendingFile.name);

      // La pièce jointe part APRÈS : elle doit référencer l'identifiant du message.
      if (pendingFile) {
        try {
          await taskService.uploadAttachment(taskId, pendingFile, created?.id);
        } catch (err) {
          notifyError(err.response?.data?.error || "Le message est envoyé, mais pas le fichier.");
        }
      }

      setContent('');
      setAsNote(false);
      setPendingFile(null);
      await load();
    } catch (err) {
      notifyError(err.response?.data?.error || "Impossible d'envoyer le message");
    } finally {
      setSending(false);
    }
  }

  // Arrivée depuis une notification de mention : on amène le commentaire à l'écran et on le
  // souligne brièvement, sinon on atterrit sur la tâche sans savoir lequel est concerné.
  const focusedRef = useRef(null);
  useEffect(() => {
    if (!focusCommentId || items.length === 0) return;
    const el = focusedRef.current;
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('cmt-item--focus');
    const timer = setTimeout(() => el.classList.remove('cmt-item--focus'), 2600);
    return () => clearTimeout(timer);
  }, [focusCommentId, items.length]);

  // Annuaire chargé une fois : sert à proposer les personnes après « @ ».
  useEffect(() => {
    userService
      .getUsers()
      .then((list) => setPeople(Array.isArray(list) ? list : []))
      .catch(() => setPeople([]));
  }, []);

  // Détecte un « @ » en cours de frappe (mot courant, jusqu'à l'emplacement du curseur).
  function handleContentChange(event) {
    const value = event.target.value;
    setContent(value);
    const upToCaret = value.slice(0, event.target.selectionStart ?? value.length);
    const match = /(?:^|\s)@([\p{L}\p{M}'\- ]{0,40})$/u.exec(upToCaret);
    setMentionQuery(match ? match[1] : null);
  }

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.trim().toLowerCase();
    return people.filter((p) => !q || (p.full_name || '').toLowerCase().includes(q)).slice(0, 6);
  }, [mentionQuery, people]);

  // Remplace le « @… » en cours par la balise complète `@[Nom](uuid)`.
  function insertMention(person) {
    const el = inputRef.current;
    const caret = el?.selectionStart ?? content.length;
    const before = content.slice(0, caret);
    const after = content.slice(caret);
    const replaced = before.replace(/(^|\s)@[\p{L}\p{M}'\- ]{0,40}$/u, `$1@[${person.full_name}](${person.id}) `);
    const next = replaced + after;
    setContent(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = replaced.length;
      el?.setSelectionRange(pos, pos);
    });
  }

  function pickFile(event) {
    const file = event.target.files?.[0];
    event.target.value = ''; // permet de re-choisir le même fichier après un retrait
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_SIZE) {
      notifyError('Fichier trop volumineux (5 Mo maximum).');
      return;
    }
    setPendingFile(file);
  }

  async function downloadAttachment(attachment) {
    try {
      const blob = await taskService.downloadAttachment(attachment.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.file_name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      notifyError('Téléchargement impossible');
    }
  }

  return (
    <div className="cmt">
      <div className="cmt-list">
        {items.length === 0 ? (
          <div className="cmt-empty">Aucun commentaire pour le moment.</div>
        ) : (
          items.map((it) => (
            <div
              key={`${it.kind}-${it.id}`}
              ref={it.id === focusCommentId ? focusedRef : undefined}
              className={`cmt-item${it.kind === 'note' ? ' cmt-item--note' : ''}`}
            >
              <span className="cmt-avatar">
                {avatarUrls[it.author_id] ? (
                  <img src={avatarUrls[it.author_id]} alt="" className="cmt-avatar-img" />
                ) : (
                  initialsOf(it.author_name)
                )}
              </span>
              <div className="cmt-body">
                <div className="cmt-meta">
                  <span className="cmt-author">{it.author_name}</span>
                  {it.kind === 'note' && <span className="cmt-tag">Interne</span>}
                  <span className="cmt-time">{formatDateTime(it.created_at)}</span>
                  {it.edited_at && (
                    <span className="cmt-edited" title={`Modifié le ${formatDateTime(it.edited_at)}`}>
                      modifié
                    </span>
                  )}
                  {/* Le serveur reste l'autorité : on n'affiche chaque bouton que là où il
                      aboutirait, pour ne pas proposer une action qui serait refusée.
                      Modifier = l'auteur seul ; supprimer = l'auteur ou un admin. */}
                  <span className="cmt-actions">
                    {it.author_id === user?.id && !editing && (
                      <button
                        type="button"
                        className="icon-link-btn cmt-action"
                        onClick={() => setEditing({ id: it.id, content: it.content })}
                        aria-label="Modifier ce commentaire"
                        title="Modifier"
                      >
                        <IconPencil />
                      </button>
                    )}
                    {(isAdmin || it.author_id === user?.id) && (
                      <button
                        type="button"
                        className="icon-link-btn icon-link-btn--danger cmt-action"
                        onClick={() => removeComment(it)}
                        aria-label="Supprimer ce commentaire"
                        title="Supprimer"
                      >
                        <IconTrash />
                      </button>
                    )}
                  </span>
                </div>
                {/* Le contenu est du texte brut : <Markdown/> en fait le rendu (gras, listes,
                    liens) et lui confie aussi les mentions, pour qu'une mention placée dans
                    une puce reste une mention au lieu de couper le bloc en deux. */}
                {editing?.id === it.id ? (
                  <div className="cmt-edit">
                    <textarea
                      ref={editRef}
                      className="cmt-input cmt-edit-input"
                      value={editing.content}
                      onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                      rows={3}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setEditing(null);
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          saveEdit();
                        }
                      }}
                    />
                    <div className="cmt-edit-foot">
                      <MarkdownToolbar
                        targetRef={editRef}
                        value={editing.content}
                        onChange={(next) => setEditing((cur) => (cur ? { ...cur, content: next } : cur))}
                        disabled={savingEdit}
                      />
                      <div className="cmt-edit-buttons">
                        <button type="button" className="cmt-edit-cancel" onClick={() => setEditing(null)}>
                          Annuler
                        </button>
                        <button
                          type="button"
                          className="cmt-send cmt-edit-save"
                          onClick={saveEdit}
                          disabled={savingEdit || !editing.content.trim()}
                        >
                          {savingEdit ? 'Enregistrement…' : 'Enregistrer'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <Markdown
                  className="cmt-content"
                  text={it.content}
                  renderMention={(name, userId, key) => (
                    <button
                      type="button"
                      key={key}
                      className={`cmt-mention${userId === user?.id ? ' cmt-mention--me' : ''}`}
                      onClick={() =>
                        navigate(isAdmin ? '/admin/messaging' : '/messaging', {
                          state: { employeeId: userId },
                        })
                      }
                      title={`Écrire à ${name}`}
                    >
                      @{name}
                    </button>
                  )}
                />
                )}
                {(it.attachments || []).length > 0 && (
                  <div className="cmt-files">
                    {it.attachments.map((att) => (
                      <button
                        type="button"
                        key={att.id}
                        className="cmt-file"
                        onClick={() => downloadAttachment(att)}
                        title={`Télécharger ${att.file_name}`}
                      >
                        <IconFileText />
                        <span className="cmt-file-name">{att.file_name}</span>
                        {att.file_size ? <span className="cmt-file-size">{formatBytes(att.file_size)}</span> : null}
                        <IconDownload />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <form
        className="cmt-composer"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {mentionMatches.length > 0 && (
          <ul className="cmt-mention-list">
            {mentionMatches.map((p) => (
              <li key={p.id}>
                <button type="button" className="cmt-mention-option" onMouseDown={(e) => e.preventDefault()} onClick={() => insertMention(p)}>
                  <span className="cmt-mention-avatar">{initialsOf(p.full_name)}</span>
                  <span className="cmt-mention-name">{p.full_name}</span>
                  {p.role === 'ADMIN' && <span className="cmt-mention-role">Admin</span>}
                </button>
              </li>
            ))}
          </ul>
        )}

        <textarea
          ref={inputRef}
          className="cmt-input"
          value={content}
          onChange={handleContentChange}
          onBlur={() => setTimeout(() => setMentionQuery(null), 150)}
          placeholder={isAdmin && asNote ? 'Écrire une note interne…' : 'Écrivez un commentaire…'}
          rows={2}
          onKeyDown={(e) => {
            // Le sélecteur de mention est ouvert : Entrée choisit la 1re personne au lieu d'envoyer.
            if (e.key === 'Enter' && !e.shiftKey && mentionMatches.length > 0) {
              e.preventDefault();
              insertMention(mentionMatches[0]);
              return;
            }
            if (e.key === 'Escape' && mentionQuery !== null) {
              setMentionQuery(null);
              return;
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        {pendingFile && (
          <div className="cmt-pending">
            <IconFileText />
            <span className="cmt-file-name">{pendingFile.name}</span>
            <span className="cmt-file-size">{formatBytes(pendingFile.size)}</span>
            <button
              type="button"
              className="cmt-pending-remove"
              onClick={() => setPendingFile(null)}
              aria-label="Retirer le fichier"
            >
              <IconX />
            </button>
          </div>
        )}

        <div className="cmt-composer-foot">
          {/* Mise en forme et pièce jointe sur la même ligne : deux rangées d'icônes
              mangeraient de la hauteur dans une fenêtre déjà étroite. */}
          <div className="cmt-tools-row">
            <MarkdownToolbar
              targetRef={inputRef}
              value={content}
              onChange={(next) => {
                setContent(next);
                // Une insertion de mise en forme n'est pas une frappe : le sélecteur de
                // mention resterait ouvert sur une recherche devenue caduque.
                setMentionQuery(null);
              }}
              disabled={sending}
            />
            <label className="cmt-attach" title="Joindre un fichier (5 Mo max)">
              <IconPaperclip />
              <input type="file" onChange={pickFile} hidden />
            </label>
          </div>
          {isAdmin && (
            <label className={`cmt-note-toggle${asNote ? ' cmt-note-toggle--on' : ''}`} title="Visible uniquement par les admins">
              <input type="checkbox" checked={asNote} onChange={(e) => setAsNote(e.target.checked)} />
              Note interne
            </label>
          )}
          <button type="submit" className="cmt-send" disabled={sending || (!content.trim() && !pendingFile)}>
            <SendIcon />
            <span>{sending ? 'Envoi…' : 'Envoyer'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}

export default CommentSection;
