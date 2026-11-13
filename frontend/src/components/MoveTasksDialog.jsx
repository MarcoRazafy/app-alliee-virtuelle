import { useEffect, useState } from 'react';
import ProjectPicker from './ProjectPicker';
import * as hierarchyService from '../services/hierarchyService';
import * as taskService from '../services/taskService';
import { flattenLists } from '../utils/projectSearch';
import { notifySuccess, notifyError } from '../utils/toast';
import { IconX } from './icons';

export function useProjectLists(enabled = true) {
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    hierarchyService
      .getSpacesTree()
      .then((tree) => {
        if (!cancelled) setProjects(flattenLists(tree));
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return projects;
}

export default function MoveTasksDialog({ taskIds, excludeListId = null, onClose, onMoved }) {
  const projects = useProjectLists();
  const [listId, setListId] = useState('');
  const [moving, setMoving] = useState(false);
  const count = taskIds.length;
  const choices = excludeListId ? projects.filter((project) => project.id !== excludeListId) : projects;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!listId || moving) return;
    setMoving(true);
    try {
      const result = await taskService.moveTasks(taskIds, listId);
      notifySuccess(`${count} tâche${count > 1 ? 's déplacées' : ' déplacée'} vers « ${result.list.name} »`);
      onMoved?.(result);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Déplacement impossible');
      setMoving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={moving ? undefined : onClose}>
      <div
        className="modal-card modal-card--move"
        role="dialog"
        aria-modal="true"
        aria-labelledby="move-tasks-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-card-head">
          <div>
            <p className="modal-card-eyebrow">Déplacer</p>
            <h2 id="move-tasks-title">
              {count} tâche{count > 1 ? 's' : ''} vers un autre projet
            </h2>
          </div>
          <button type="button" className="modal-card-close" onClick={onClose} aria-label="Fermer" disabled={moving}>
            <IconX />
          </button>
        </div>
        <p className="modal-card-hint">Les commentaires, le temps passé, les pièces jointes et les sous-tâches suivent chaque tâche.</p>
        <form className="modal-card-form" onSubmit={handleSubmit}>
          <ProjectPicker projects={choices} value={listId} onChange={setListId} required />
          <div className="move-dialog-actions">
            <button type="button" className="btn-outline" onClick={onClose} disabled={moving}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={!listId || moving}>
              {moving ? 'Déplacement…' : 'Déplacer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
