import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as taskService from '../services/taskService';
import * as avatarService from '../services/avatarService';
import * as userService from '../services/userService';
import { formatDateTime, formatBytes } from '../utils/formatters';
import { notifyError, notifyInfo, notifySuccess } from '../utils/toast';
import useAuthStore from '../store/authStore';
import { IconPaperclip, IconX, IconFileText, IconDownload, IconTrash, IconPencil, IconCheck } from './icons';
import Markdown from './Markdown';
import MarkdownToolbar from './MarkdownToolbar';
import { NIKE, findReaction, reactorsLabel, reactorsTitle, toggleReactionLocally } from '../utils/commentReactions';
import { filesFromPaste } from '../utils/clipboardFiles';
import MediaPreview from './MediaPreview';

const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;

function isPreviewableImage(type) {
  return ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(type);
}

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
  const [avatarUrls, setAvatarUrls] = useState({});
  const [people, setPeople] = useState([]);
  const [mentionQuery, setMentionQuery] = useState(null);
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

  const items = useMemo(
    () =>
      [
        ...comments.map((c) => ({ ...c, kind: 'comment' })),
        ...notes.map((n) => ({ ...n, kind: 'note' })),
      ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    [comments, notes]
  );

  const fetchedRef = useRef(new Set());
  const urlsRef = useRef({});
  useEffect(() => {
    urlsRef.current = avatarUrls;
  }, [avatarUrls]);
  useEffect(() => () => Object.values(urlsRef.current).forEach((u) => u && URL.revokeObjectURL(u)), []);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadAvatars = useCallback((ids) => {
    const need = [...new Set(ids)].filter((id) => id && !fetchedRef.current.has(id));
    if (need.length === 0) return;
    need.forEach((id) => fetchedRef.current.add(id));
    need.forEach(async (id) => {
      try {
        const blob = await avatarService.getUserAvatarBlob(id);
        const url = URL.createObjectURL(blob);
        if (mountedRef.current) setAvatarUrls((cur) => ({ ...cur, [id]: url }));
        else URL.revokeObjectURL(url);
      } catch {
        fetchedRef.current.delete(id);
      }
    });
  }, []);

  useEffect(() => {
    loadAvatars(items.filter((it) => it.has_avatar).map((it) => it.author_id));
  }, [items, loadAvatars]);

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

  const reactingRef = useRef(new Set());

  function setItemReactions(item, reactions) {
    const patch = (list) => list.map((c) => (c.id === item.id ? { ...c, reactions } : c));
    if (item.kind === 'note') setNotes(patch);
    else setComments(patch);
  }

  async function toggleNike(item) {
    if (!user || reactingRef.current.has(item.id)) return;
    reactingRef.current.add(item.id);
    const previous = item.reactions || [];
    setItemReactions(item, toggleReactionLocally(previous, NIKE, { id: user.id, name: user.full_name }));
    try {
      const { reactions } = await taskService.toggleCommentReaction(taskId, item.id, NIKE);
      setItemReactions(item, reactions);
    } catch (err) {
      setItemReactions(item, previous);
      notifyError(err.response?.data?.error || 'Réaction impossible');
    } finally {
      reactingRef.current.delete(item.id);
    }
  }

  async function removeComment(item) {
    const label = item.kind === 'note' ? 'cette note interne' : 'ce commentaire';
    if (!window.confirm(`Supprimer ${label} ? Les fichiers joints seront également retirés.`)) return;
    try {
      await taskService.deleteComment(taskId, item.id);
      await load();
      notifySuccess('Commentaire supprimé');
    } catch (err) {
      notifyError(err.response?.data?.error || 'Suppression impossible');
    }
  }

  async function submit() {
    if ((!content.trim() && !pendingFile) || sending) return;
    setSending(true);
    try {
      const created =
        isAdmin && asNote
          ? await taskService.createNote(taskId, content || pendingFile.name)
          : await taskService.createComment(taskId, content || pendingFile.name);

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

  useEffect(() => {
    userService
      .getUsers()
      .then((list) => setPeople(Array.isArray(list) ? list : []))
      .catch(() => setPeople([]));
  }, []);

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

  useEffect(() => {
    loadAvatars(mentionMatches.filter((p) => p.has_avatar).map((p) => p.id));
  }, [mentionMatches, loadAvatars]);

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

  function acceptFile(file) {
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_SIZE) {
      notifyError('Fichier trop volumineux (5 Mo maximum).');
      return;
    }
    setPendingFile(file);
  }

  function pickFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    acceptFile(file);
  }

  function handlePaste(event) {
    const pasted = filesFromPaste(event);
    if (pasted.length === 0) return;
    event.preventDefault();
    acceptFile(pasted[0]);
    if (pasted.length > 1) notifyInfo(`Un seul fichier par commentaire : « ${pasted[0].name} » a été joint.`);
  }

  const [attachmentUrls, setAttachmentUrls] = useState({});
  const attachmentFetchedRef = useRef(new Set());
  const attachmentUrlsRef = useRef({});
  useEffect(() => {
    attachmentUrlsRef.current = attachmentUrls;
  }, [attachmentUrls]);
  useEffect(() => () => Object.values(attachmentUrlsRef.current).forEach((u) => u && URL.revokeObjectURL(u)), []);
  useEffect(() => {
    const images = items
      .flatMap((it) => it.attachments || [])
      .filter((att) => isPreviewableImage(att.file_type) && !attachmentFetchedRef.current.has(att.id));
    images.forEach(async (att) => {
      attachmentFetchedRef.current.add(att.id);
      try {
        const blob = await taskService.downloadAttachment(att.id);
        const url = URL.createObjectURL(blob);
        if (mountedRef.current) setAttachmentUrls((cur) => ({ ...cur, [att.id]: url }));
        else URL.revokeObjectURL(url);
      } catch {
        attachmentFetchedRef.current.delete(att.id);
      }
    });
  }, [items]);

  const [preview, setPreview] = useState(null);
  async function openPreview(attachment) {
    const cached = attachmentUrls[attachment.id];
    if (cached) {
      setPreview({ url: cached, type: attachment.file_type, name: attachment.file_name, attachment, temporary: false });
      return;
    }
    try {
      const blob = await taskService.downloadAttachment(attachment.id);
      const url = URL.createObjectURL(blob);
      setPreview({ url, type: attachment.file_type, name: attachment.file_name, attachment, temporary: true });
    } catch {
      notifyError("Impossible d'afficher le fichier");
    }
  }
  function closePreview() {
    setPreview((cur) => {
      if (cur?.temporary) URL.revokeObjectURL(cur.url);
      return null;
    });
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
                  <span className="cmt-actions">
                    {!findReaction(it.reactions, NIKE) && (
                      <button
                        type="button"
                        className="icon-link-btn cmt-action cmt-action--nike"
                        onClick={() => toggleNike(it)}
                        aria-label="Réagir avec ✔️"
                        title="Marquer d'un ✔️ (vu)"
                      >
                        <IconCheck />
                      </button>
                    )}
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
                    {it.attachments.map((att) =>
                      isPreviewableImage(att.file_type) ? (
                        <button
                          type="button"
                          key={att.id}
                          className="cmt-image"
                          onClick={() => openPreview(att)}
                          title={`Afficher ${att.file_name}`}
                          aria-label={`Afficher l'image ${att.file_name}`}
                        >
                          {attachmentUrls[att.id] ? (
                            <img src={attachmentUrls[att.id]} alt={att.file_name} />
                          ) : (
                            <span className="cmt-image-loading">Chargement…</span>
                          )}
                        </button>
                      ) : (
                      <button
                        type="button"
                        key={att.id}
                        className="cmt-file"
                        onClick={() => (att.file_type === 'application/pdf' ? openPreview(att) : downloadAttachment(att))}
                        title={att.file_type === 'application/pdf' ? `Afficher ${att.file_name}` : `Télécharger ${att.file_name}`}
                      >
                        <IconFileText />
                        <span className="cmt-file-name">{att.file_name}</span>
                        {att.file_size ? <span className="cmt-file-size">{formatBytes(att.file_size)}</span> : null}
                        <IconDownload />
                      </button>
                      )
                    )}
                  </div>
                )}
                {(() => {
                  const nike = findReaction(it.reactions, NIKE);
                  if (!nike) return null;
                  return (
                    <div className="cmt-reactions">
                      <button
                        type="button"
                        className={`cmt-reaction${nike.mine ? ' cmt-reaction--mine' : ''}`}
                        onClick={() => toggleNike(it)}
                        aria-pressed={nike.mine}
                        title={`${reactorsTitle(nike.users, user?.id)} — ${nike.mine ? 'cliquer pour retirer' : 'cliquer pour ajouter'}`}
                      >
                        <IconCheck />
                        <span className="cmt-reaction-count">{nike.count}</span>
                      </button>
                      <span className="cmt-reaction-who">{reactorsLabel(nike.users, user?.id)}</span>
                    </div>
                  );
                })()}
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
                  <span className="cmt-mention-avatar">
                    {avatarUrls[p.id] ? (
                      <img src={avatarUrls[p.id]} alt="" className="cmt-avatar-img" />
                    ) : (
                      initialsOf(p.full_name)
                    )}
                  </span>
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
          onPaste={handlePaste}
          onBlur={() => setTimeout(() => setMentionQuery(null), 150)}
          placeholder={isAdmin && asNote ? 'Écrire une note interne…' : 'Écrivez un commentaire…'}
          rows={2}
          onKeyDown={(e) => {
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
          <div className="cmt-tools-row">
            <MarkdownToolbar
              targetRef={inputRef}
              value={content}
              onChange={(next) => {
                setContent(next);
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

      {preview && (
        <MediaPreview
          url={preview.url}
          type={preview.type}
          name={preview.name}
          onClose={closePreview}
          onDownload={() => downloadAttachment(preview.attachment)}
        />
      )}
    </div>
  );
}

export default CommentSection;
