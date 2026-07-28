import { useEffect, useState, useCallback } from 'react';
import * as taskService from '../services/taskService';
import { formatDateTime } from '../utils/formatters';
import { notifySuccess, notifyError } from '../utils/toast';
import useAuthStore from '../store/authStore';

function CommentSection({ taskId }) {
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'ADMIN';

  const [comments, setComments] = useState([]);
  const [notes, setNotes] = useState([]);
  const [content, setContent] = useState('');
  const [asNote, setAsNote] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await taskService.getComments(taskId);
      setComments(data);
      if (isAdmin) {
        const noteData = await taskService.getNotes(taskId);
        setNotes(noteData);
      }
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de charger les commentaires');
    }
  }, [taskId, isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!content.trim()) return;
    try {
      if (isAdmin && asNote) {
        await taskService.createNote(taskId, content);
        notifySuccess('Note added');
      } else {
        await taskService.createComment(taskId, content);
        notifySuccess('Comment sent');
      }
      setContent('');
      setAsNote(false);
      await load();
    } catch (err) {
      notifyError(err.response?.data?.error || "Impossible d'envoyer le message");
    }
  }

  return (
    <div>
      {isAdmin && (
        <>
          <p className="app-section-title">Internal notes (admins only)</p>
          {notes.length === 0 && <div className="empty-state">No note.</div>}
          {notes.length > 0 && (
            <div className="comment-list">
              {notes.map((note) => (
                <div key={note.id} className="comment-bubble comment-bubble--note">
                  <div className="comment-header">
                    <span className="comment-author">{note.author_name}</span>
                    <span className="comment-time">{formatDateTime(note.created_at)}</span>
                  </div>
                  <p className="comment-content">{note.content}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {comments.length === 0 && <div className="empty-state">No comment yet.</div>}
      {comments.length > 0 && (
        <div className="comment-list">
          {comments.map((comment) => (
            <div key={comment.id} className="comment-bubble">
              <div className="comment-header">
                <span className="comment-author">{comment.author_name}</span>
                <span className="comment-time">{formatDateTime(comment.created_at)}</span>
              </div>
              <p className="comment-content">{comment.content}</p>
            </div>
          ))}
        </div>
      )}

      <form className="comment-form" onSubmit={handleSubmit}>
        <div className="comment-form-row">
          <input
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Add a comment"
          />
          <button type="submit" className="btn-primary">
            Send
          </button>
        </div>
        {isAdmin && (
          <label className="comment-form-note-toggle">
            <input type="checkbox" checked={asNote} onChange={(e) => setAsNote(e.target.checked)} />
            Internal note (visible to admins only)
          </label>
        )}
      </form>
    </div>
  );
}

export default CommentSection;
