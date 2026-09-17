import { useEffect, useRef, useState } from 'react';
import * as taskService from '../services/taskService';
import { formatDate } from '../utils/formatters';
import { notifyError, notifySuccess } from '../utils/toast';
import { IconCheck, IconPencil, IconX } from './icons';

// Date 'YYYY-MM-DD' à partir d'une échéance reçue du serveur, lue à l'heure du navigateur.
// Une colonne DATE arrive en JSON comme « minuit local du serveur » ; ne garder que les dix
// premiers caractères de la chaîne ISO décalerait d'un jour selon le fuseau.
function toYMD(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 'YYYY-MM-DD' → Date à minuit LOCAL (new Date('2026-12-31') serait minuit UTC).
function localDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Échéance modifiable sur place : « Échéance : 26 juin 2026 ✎ » devient un sélecteur de date.
// Enregistrement explicite (✓ ou Entrée), jamais à la perte du focus : le calendrier natif
// retire le focus du champ pendant qu'on choisit, un enregistrement au blur partirait trop tôt.
export default function DeadlineEditor({ taskId, deadline, startDate, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);
  const current = toYMD(deadline);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    // Ouvre directement le calendrier : un clic de moins. Refusé par certains navigateurs hors
    // geste utilisateur ; le champ reste alors utilisable normalement.
    try {
      inputRef.current?.showPicker?.();
    } catch {
      /* pas de calendrier automatique : rien à faire */
    }
  }, [editing]);

  function open() {
    setValue(current);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setValue('');
  }

  async function save() {
    if (!value || saving) return;
    if (value === current) {
      cancel();
      return;
    }
    setSaving(true);
    try {
      const result = await taskService.updateTaskDeadline(taskId, value);
      const label = formatDate(localDate(value));
      // La carte va quitter la liste si la tâche n'est plus en retard : le message dit pourquoi.
      notifySuccess(
        result.is_late ? `Échéance modifiée : ${label}` : `Échéance reportée au ${label} : la tâche n'est plus en retard`
      );
      setEditing(false);
      onChanged?.();
    } catch (err) {
      notifyError(err.response?.data?.error || "Impossible de modifier l'échéance");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button type="button" className="deadline-edit-trigger" onClick={open} title="Modifier l'échéance">
        Échéance : {deadline ? formatDate(deadline) : '—'}
        <IconPencil />
      </button>
    );
  }

  return (
    <span className="deadline-edit">
      <input
        ref={inputRef}
        type="date"
        className="deadline-edit-input"
        value={value}
        min={startDate || undefined}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            save();
          }
          if (e.key === 'Escape') {
            // Ne ferme que l'édition, pas une fenêtre qui l'entourerait.
            e.stopPropagation();
            cancel();
          }
        }}
        disabled={saving}
        aria-label="Nouvelle échéance"
      />
      <button
        type="button"
        className="deadline-edit-btn deadline-edit-btn--save"
        onClick={save}
        disabled={saving || !value}
        aria-label="Enregistrer l'échéance"
        title="Enregistrer"
      >
        <IconCheck />
      </button>
      <button
        type="button"
        className="deadline-edit-btn"
        onClick={cancel}
        disabled={saving}
        aria-label="Annuler"
        title="Annuler"
      >
        <IconX />
      </button>
    </span>
  );
}
