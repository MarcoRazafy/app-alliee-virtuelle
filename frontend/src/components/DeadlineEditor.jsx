import { useEffect, useRef, useState } from 'react';
import * as taskService from '../services/taskService';
import { formatDate } from '../utils/formatters';
import { notifyError, notifySuccess } from '../utils/toast';
import { IconCheck, IconPencil, IconX } from './icons';

function toYMD(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function localDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export default function DeadlineEditor({ taskId, deadline, startDate, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);
  const current = toYMD(deadline);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    try {
      inputRef.current?.showPicker?.();
    } catch {
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
