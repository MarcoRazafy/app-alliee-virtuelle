import { useState } from 'react';
import { IconX } from '../icons';
import { PRESENCE_META, formatDayLabel, useDialogFocus } from './adminPresenceHelpers';

// Modale de correction administrative d'une présence journalière. Extraite d'AdminPresence.
function AttendanceCorrectionDialog({ employee, date, onClose, onSave }) {
  const existing = employee.manual_correction;
  const [status, setStatus] = useState(existing?.status || 'automatic');
  const [lateMinutes, setLateMinutes] = useState(existing?.late_minutes || employee.late_minutes || 1);
  const [reason, setReason] = useState(existing?.reason || '');
  const [saving, setSaving] = useState(false);
  const dialogRef = useDialogFocus(onClose);
  const automaticMeta = PRESENCE_META[employee.calculated_presence_status] || PRESENCE_META.off;

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave({
        status,
        lateMinutes: status === 'late' ? Number(lateMinutes) : 0,
        reason,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pres-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section
        ref={dialogRef}
        className="pres-dialog pres-correction-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="attendance-correction-title"
      >
        <header className="pres-dialog-header">
          <div>
            <p className="pres-eyebrow">Administrative correction</p>
            <h2 id="attendance-correction-title">{employee.full_name}'s attendance</h2>
            <p>{formatDayLabel(date)}</p>
          </div>
          <button type="button" className="pres-dialog-close" onClick={onClose} aria-label="Close the correction">
            <IconX />
          </button>
        </header>

        <div className="pres-computed-state">
          <span>Automatic calculation</span>
          <strong className={`pres-badge pres-badge--${automaticMeta.cls}`}>
            <span className="pres-badge-dot" />
            {automaticMeta.label}
          </strong>
          <small>Raw connections are kept after the correction.</small>
        </div>

        <form className="pres-correction-form" onSubmit={handleSubmit}>
          <label htmlFor="attendance-status">
            <span>Final status</span>
            <select
              id="attendance-status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              data-dialog-initial-focus
            >
              <option value="automatic">Automatic calculation</option>
              <option value="present">Present</option>
              <option value="late">Late</option>
              <option value="absent">Absent</option>
            </select>
          </label>

          {status === 'late' && (
            <label htmlFor="attendance-late-minutes">
              <span>Minutes late</span>
              <input
                id="attendance-late-minutes"
                type="number"
                min="1"
                max="1440"
                required
                value={lateMinutes}
                onChange={(event) => setLateMinutes(event.target.value)}
              />
            </label>
          )}

          <label htmlFor="attendance-reason" className="pres-correction-reason">
            <span>Reason or detail <small>(optional)</small></span>
            <textarea
              id="attendance-reason"
              maxLength="500"
              rows="3"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. forgot to log in, hardware issue…"
            />
          </label>

          <footer className="pres-dialog-actions">
            <button type="button" className="btn-outline" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : status === 'automatic' ? 'Restore calculation' : 'Save'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

export default AttendanceCorrectionDialog;
