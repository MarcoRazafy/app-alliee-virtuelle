import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import * as taskService from '../services/taskService';
import * as avatarService from '../services/avatarService';
import { formatDateTime } from '../utils/formatters';
import { notifyError } from '../utils/toast';
import useAuthStore from '../store/authStore';

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
function CommentSection({ taskId }) {
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'ADMIN';

  const [comments, setComments] = useState([]);
  const [notes, setNotes] = useState([]);
  const [content, setContent] = useState('');
  const [asNote, setAsNote] = useState(false);
  const [sending, setSending] = useState(false);
  const [avatarUrls, setAvatarUrls] = useState({}); // author_id → objectURL de la photo

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

  useEffect(() => {
    const need = [...new Set(items.filter((it) => it.has_avatar && it.author_id).map((it) => it.author_id))].filter(
      (id) => !fetchedRef.current.has(id)
    );
    if (need.length === 0) return undefined;
    need.forEach((id) => fetchedRef.current.add(id));
    let alive = true;
    need.forEach(async (id) => {
      try {
        const blob = await avatarService.getUserAvatarBlob(id);
        const url = URL.createObjectURL(blob);
        if (alive) setAvatarUrls((cur) => ({ ...cur, [id]: url }));
        else URL.revokeObjectURL(url);
      } catch {
        fetchedRef.current.delete(id); // autorise une nouvelle tentative
      }
    });
    return () => {
      alive = false;
    };
  }, [items]);

  async function submit() {
    if (!content.trim() || sending) return;
    setSending(true);
    try {
      if (isAdmin && asNote) await taskService.createNote(taskId, content);
      else await taskService.createComment(taskId, content);
      setContent('');
      setAsNote(false);
      await load();
    } catch (err) {
      notifyError(err.response?.data?.error || "Impossible d'envoyer le message");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="cmt">
      <div className="cmt-list">
        {items.length === 0 ? (
          <div className="cmt-empty">Aucun commentaire pour le moment.</div>
        ) : (
          items.map((it) => (
            <div key={`${it.kind}-${it.id}`} className={`cmt-item${it.kind === 'note' ? ' cmt-item--note' : ''}`}>
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
                </div>
                <p className="cmt-content">{it.content}</p>
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
        <textarea
          className="cmt-input"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={isAdmin && asNote ? 'Écrire une note interne…' : 'Écrivez un commentaire…'}
          rows={2}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="cmt-composer-foot">
          {isAdmin && (
            <label className={`cmt-note-toggle${asNote ? ' cmt-note-toggle--on' : ''}`} title="Visible uniquement par les admins">
              <input type="checkbox" checked={asNote} onChange={(e) => setAsNote(e.target.checked)} />
              Note interne
            </label>
          )}
          <button type="submit" className="cmt-send" disabled={sending || !content.trim()}>
            <SendIcon />
            <span>{sending ? 'Envoi…' : 'Envoyer'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}

export default CommentSection;
