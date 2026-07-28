import { useEffect, useState } from 'react';
import * as planningService from '../../services/planningService';
import * as sessionService from '../../services/sessionService';
import { notifyError, notifySuccess } from '../../utils/toast';
import WeekCalendarGrid from '../employee/WeekCalendarGrid';
import { IconAlert, IconX, IconCalendarWeek, IconClock } from '../icons';
import {
  ADMIN_STATUS_OPTIONS,
  EFFECTIVE_STATUS_LABELS,
  EFFECTIVE_STATUS_PILL_CLASS,
  HAS_SLOTS_STATUSES,
  formatWeekRange,
  formatDateTime,
  toDraftDays,
} from '../../utils/planningFormat';
import { totalHoursOf, initials } from './adminPlanningHelpers';

// Modale de détail/édition d'un planning par l'admin (calendrier + présence réelle + historique).
// Extraite de AdminPlanning ; reçoit planningId + avatarUrls et remonte onSaved/onClose.
function PlanningDetailModal({ planningId, avatarUrls, onClose, onSaved }) {
  const [detail, setDetail] = useState(null);
  const [draftDays, setDraftDays] = useState([]);
  const [draftNote, setDraftNote] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState([]);
  const [history, setHistory] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [sessionSegmentsByDate, setSessionSegmentsByDate] = useState(undefined);
  const [sessionError, setSessionError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    planningService
      .getAdminPlanningDetail(planningId)
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
        setDraftDays(toDraftDays(data.days));
        setDraftNote(data.planning?.general_note || '');
      })
      .catch((err) => notifyError(err.response?.data?.error || 'Impossible de charger le planning'))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [planningId]);

  // Présence réelle de l'employé sur cette semaine, superposée au calendrier + suivi temps réel.
  useEffect(() => {
    const userId = detail?.user?.id;
    const weekStart = detail?.week_start_date;
    if (!userId || !weekStart) return undefined;
    setSessionSegmentsByDate(undefined);
    setSessionError('');
    function refresh() {
      sessionService
        .getUserSessionsForWeek(userId, weekStart)
        .then((segments) => {
          const byDate = {};
          segments.forEach((segment) => {
            if (!byDate[segment.date]) byDate[segment.date] = [];
            byDate[segment.date].push(segment);
          });
          setSessionSegmentsByDate(byDate);
          setSessionError('');
        })
        .catch(() => setSessionError('Unable to load attendance. No absence status is inferred.'));
    }
    refresh();
    const interval = window.setInterval(refresh, 15000);
    return () => window.clearInterval(interval);
  }, [detail?.user?.id, detail?.week_start_date]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleStatusChange(date, status) {
    setDraftDays((days) =>
      days.map((day) =>
        day.date === date
          ? { ...day, availability_status: status, time_slots: HAS_SLOTS_STATUSES.includes(status) ? day.time_slots : [] }
          : day
      )
    );
  }

  function handleSlotsChange(date, slots) {
    setDraftDays((days) => days.map((day) => (day.date === date ? { ...day, time_slots: slots } : day)));
  }

  function handleCopyTo(fromDate, toDate) {
    setDraftDays((days) => {
      const src = days.find((d) => d.date === fromDate);
      if (!src) return days;
      return days.map((day) =>
        day.date === toDate
          ? { ...day, availability_status: src.availability_status, time_slots: src.time_slots.map((s) => ({ ...s })) }
          : day
      );
    });
  }

  function handleNoteChange(date, note) {
    setDraftDays((days) => days.map((day) => (day.date === date ? { ...day, note } : day)));
  }

  async function handleToggleHistory() {
    if (!showHistory && !history) {
      try {
        const data = await planningService.getAdminPlanningHistory(planningId);
        setHistory(data.items);
      } catch (err) {
        notifyError(err.response?.data?.error || "Impossible de charger l'historique");
      }
    }
    setShowHistory((value) => !value);
  }

  async function handleSave() {
    // Le motif est facultatif : aucune validation bloquante côté client.
    setSaving(true);
    setErrors([]);
    try {
      const payloadDays = draftDays.map((day) => ({
        date: day.date,
        availability_status: day.availability_status,
        note: day.note || null,
        time_slots: HAS_SLOTS_STATUSES.includes(day.availability_status) ? day.time_slots : [],
      }));
      const result = await planningService.updateAdminPlanning(planningId, {
        changeReason,
        generalNote: draftNote,
        days: payloadDays,
      });
      notifySuccess('Schedule updated');
      onSaved(result);
    } catch (err) {
      const data = err.response?.data;
      if (data?.errors) setErrors(data.errors);
      else notifyError(data?.error || "Impossible d'enregistrer les modifications");
    } finally {
      setSaving(false);
    }
  }

  const totalHours = totalHoursOf(draftDays);

  return (
    <div className="aplan-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="aplan-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="aplan-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="aplan-modal-head">
          {avatarUrls[detail?.user?.id] ? (
            <img
              src={avatarUrls[detail.user.id]}
              alt={`Photo de ${detail.user.full_name}`}
              className="aplan-modal-avatar aplan-modal-avatar--image"
            />
          ) : (
            <span className="aplan-modal-avatar">{initials(detail?.user?.full_name)}</span>
          )}
          <div className="aplan-modal-identity">
            <h2 id="aplan-detail-title">{detail?.user ? detail.user.full_name : 'Schedule details'}</h2>
            <p>
              <IconCalendarWeek />
              {detail ? formatWeekRange(detail.week_start_date, detail.week_end_date) : ''}
            </p>
          </div>
          {detail && (
            <span className={`pill ${EFFECTIVE_STATUS_PILL_CLASS[detail.effective_status] || ''}`}>
              {EFFECTIVE_STATUS_LABELS[detail.effective_status] || detail.effective_status}
            </span>
          )}
          <button type="button" className="aplan-modal-close" onClick={onClose} aria-label="Close">
            <IconX />
          </button>
        </header>

        <div className="aplan-modal-body">
          {loading && (
            <div className="admin-loading">
              <span className="admin-loading-spinner" />
              <p>Loading the schedule…</p>
            </div>
          )}

          {!loading && detail && (
            <>
              {detail.admin_modified && (
                <div className="info-banner info-banner--planning-warning">
                  <IconAlert />
                  <span>
                    Modified by {detail.planning.last_modified_by_name || 'an administrator'} on{' '}
                    {formatDateTime(detail.planning.admin_modified_at)}
                    {detail.planning.last_admin_change_reason
                      ? `. Motif : ${detail.planning.last_admin_change_reason}`
                      : ''}
                  </span>
                </div>
              )}

              <div className="aplan-modal-toolbar">
                <span className="aplan-modal-total">
                  <IconClock />
                  Total declared: <strong>{totalHours} h</strong>
                </span>
                <button type="button" className="app-link" onClick={handleToggleHistory}>
                  {showHistory ? 'Hide history' : 'View history'}
                </button>
              </div>

              {showHistory && (
                <div className="aplan-history">
                  {!history && <p className="planning-day-empty">Loading history…</p>}
                  {history && history.length === 0 && <p className="planning-day-empty">No history.</p>}
                  {history && history.length > 0 && (
                    <ul>
                      {history.map((entry) => (
                        <li key={entry.id}>
                          <span className="aplan-history-dot" />
                          <span className="aplan-history-text">
                            <strong>{entry.action}</strong>
                            {entry.changed_by_name ? ` par ${entry.changed_by_name}` : ''}
                            {entry.change_reason ? ` — ${entry.change_reason}` : ''}
                          </span>
                          <span className="aplan-history-time">{formatDateTime(entry.changed_at)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {errors.length > 0 && (
                <div className="info-banner info-banner--planning-error">
                  <IconAlert />
                  <ul className="planning-error-list">
                    {errors.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="aplan-modal-hint">
                Drag in a column to create a slot, drag its edges to adjust it. The colored dots
                set the day's status.
              </p>

              {sessionError && (
                <div className="info-banner info-banner--planning-error" role="alert">
                  <IconAlert />
                  <span>{sessionError}</span>
                </div>
              )}

              <WeekCalendarGrid
                days={draftDays}
                canEdit
                statusOptions={ADMIN_STATUS_OPTIONS}
                onStatusChange={handleStatusChange}
                onSlotsChange={handleSlotsChange}
                onCopyTo={handleCopyTo}
                onNoteChange={handleNoteChange}
                sessionSegmentsByDate={sessionSegmentsByDate}
              />

              <p className="cal-session-legend" aria-label="Actual presence legend">
                Actual presence:
                <span><span aria-hidden="true" className="cal-session-legend-swatch cal-session-legend-swatch--ontime" /> conforme</span>
                <span><span aria-hidden="true" className="cal-session-legend-swatch cal-session-legend-swatch--late" /> retard</span>
                <span><span aria-hidden="true" className="cal-session-legend-swatch cal-session-legend-swatch--off" /> hors planning</span>
                <span><span aria-hidden="true" className="cal-session-legend-swatch cal-session-legend-swatch--missing" /> non couvert</span>
              </p>

              <label className="planning-general-note aplan-note">
                <span>General note (optional)</span>
                <textarea rows="2" value={draftNote} onChange={(e) => setDraftNote(e.target.value)} />
              </label>

              <label className="planning-general-note aplan-note">
                <span>Motif de la modification (facultatif)</span>
                <textarea
                  rows="2"
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  placeholder="e.g. Unexpected absence, replacement… (optional)"
                />
              </label>
            </>
          )}
        </div>

        <footer className="aplan-modal-foot">
          <button type="button" className="btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleSave} disabled={saving || loading}>
            {saving && <span className="btn-spinner" />}
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </footer>
      </section>
    </div>
  );
}

export default PlanningDetailModal;
