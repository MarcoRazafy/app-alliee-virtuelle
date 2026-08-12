import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import * as taskService from '../services/taskService';
import { STATUS_PILL } from '../utils/taskStatus';
import { notifySuccess, notifyError } from '../utils/toast';
import { IconChevronDown } from './icons';

// Statut d'une tâche cliquable (façon ClickUp) : pastille + menu déroulant. DECLAREE (proposition)
// exclue — c'est un état de workflow, pas un statut à poser à la main. Réservé à l'admin.
// Le menu est rendu dans un portail (position: fixed) pour échapper à tout contexte de stacking.
const OPTIONS = [
  { value: 'VALIDEE', label: 'À faire', cls: 'todo' },
  { value: 'EN_COURS', label: 'En cours', cls: 'progress' },
  { value: 'TERMINEE', label: 'Terminée', cls: 'done' },
  { value: 'CONFIRMEE', label: 'Confirmée', cls: 'confirmed' },
];

// props :
//  - taskId, status : la tâche et son statut réel (enum backend)
//  - displayStatus  : statut affiché sur la pastille (ex. A_REPRENDRE), défaut = status
//  - onChanged(newStatus) : appelé après un changement réussi (pour recharger la liste/fiche)
export default function StatusDropdown({ taskId, status, displayStatus, onChanged }) {
  const shown = displayStatus || status;
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [saving, setSaving] = useState(false);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, left: r.left });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return undefined;
    function onDown(e) {
      const inBtn = btnRef.current && btnRef.current.contains(e.target);
      const inMenu = menuRef.current && menuRef.current.contains(e.target);
      if (!inBtn && !inMenu) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onScrollOrResize() {
      setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open]);

  async function pick(newStatus) {
    setOpen(false);
    if (newStatus === status || saving) return;
    setSaving(true);
    try {
      await taskService.updateTaskStatus(taskId, newStatus);
      notifySuccess('Statut mis à jour');
      onChanged?.(newStatus);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Impossible de changer le statut');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="status-dropdown">
      <button
        type="button"
        ref={btnRef}
        className={`pill pill-button ${STATUS_PILL[shown]?.className || ''}`}
        onClick={toggle}
        disabled={saving}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Changer le statut"
      >
        {STATUS_PILL[shown]?.label || shown}
        <IconChevronDown />
      </button>
      {open &&
        createPortal(
          <div
            className="status-menu"
            role="listbox"
            ref={menuRef}
            style={{ top: `${pos.top}px`, left: `${pos.left}px` }}
          >
            {OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={status === opt.value}
                className={`status-menu-item${status === opt.value ? ' status-menu-item--active' : ''}`}
                onClick={() => pick(opt.value)}
              >
                <span className={`status-dot status-dot--${opt.cls}`} />
                {opt.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
