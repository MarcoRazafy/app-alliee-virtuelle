import { useEffect, useState, useCallback } from 'react';
import * as taskService from '../services/taskService';
import { formatDateTime } from '../utils/formatters';
import { notifySuccess, notifyError } from '../utils/toast';
import useAuthStore from '../store/authStore';

function CommentSection({ taskId }) {
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'ADMIN';

  const [comments, setComments] = useState([]);
  const [content, setContent] = useState('');
  const [asNote, setAsNote] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await taskService.getComments(taskId);
      setComments(data);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de charger les commentaires');
    }
  }, [taskId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!content.trim()) return;
    try {
      await taskService.createComment(taskId, content, isAdmin && asNote ? 'NOTE' : 'COMMENT');
      notifySuccess(asNote ? 'Note ajoutée' : 'Commentaire envoyé');
      setContent('');
      setAsNote(false);
      await load();
    } catch (err) {
      notifyError(err.response?.data?.error || "Impossible d'envoyer le message");
    }
  }

  // Notes = admin seul (DECISIONS.md) : le serveur ne les renvoie jamais à un employé,
  // donc ce filtre côté client sert uniquement à séparer visuellement les deux sections pour l'admin
  const notes = comments.filter((c) => c.type === 'NOTE');
  const visibleComments = comments.filter((c) => c.type === 'COMMENT');

  return (
    <div>
      {isAdmin && (
        <div>
          <h3>Notes internes (admin uniquement)</h3>
          {notes.length === 0 && <p>Aucune note.</p>}
          <ul>
            {notes.map((note) => (
              <li key={note.id}>
                <strong>{note.author_name}</strong> ({formatDateTime(note.created_at)}) : {note.content}
              </li>
            ))}
          </ul>
        </div>
      )}

      <h3>Commentaires</h3>
      {visibleComments.length === 0 && <p>Aucun commentaire pour le moment.</p>}
      <ul>
        {visibleComments.map((comment) => (
          <li key={comment.id}>
            <strong>{comment.author_name}</strong> ({formatDateTime(comment.created_at)}) : {comment.content}
          </li>
        ))}
      </ul>

      <form onSubmit={handleSubmit}>
        <input value={content} onChange={(e) => setContent(e.target.value)} placeholder="Ajouter un commentaire" />
        {isAdmin && (
          <label>
            <input type="checkbox" checked={asNote} onChange={(e) => setAsNote(e.target.checked)} />
            Note interne (visible uniquement par les admins)
          </label>
        )}
        <button type="submit">Envoyer</button>
      </form>
    </div>
  );
}

export default CommentSection;
