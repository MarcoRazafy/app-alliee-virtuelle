import { useEffect, useMemo, useRef, useState } from 'react';
import { IconX } from '../icons';
import {
  EMPLOYEE_STATUS_OPTIONS,
  STATUS_LABELS,
  STATUS_PILL_CLASS,
  HAS_SLOTS_STATUSES,
  formatDayLabel,
  timeToMinutes,
  minutesToTime,
  toTimeInputValue,
  slotsOverlap,
} from '../../utils/planningFormat';
import {
  computeWeekPresence,
  formatPresenceMinutes,
  PRESENCE_VARIANT_LABELS,
} from '../../utils/presenceMetrics';
import { notifyError } from '../../utils/toast';

const ROW_HEIGHT = 32; // px par heure
const SNAP_MINUTES = 15;
const MIN_DURATION_MINUTES = 15;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const STATUS_DOT_CLASS = {
  AVAILABLE: 'cal-status-dot--available',
  PARTIALLY_AVAILABLE: 'cal-status-dot--partial',
  UNAVAILABLE: 'cal-status-dot--unavailable',
  LEAVE: 'cal-status-dot--leave',
  SICK: 'cal-status-dot--sick',
};

function snapMinutes(minutes) {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
}

function clampMinutes(minutes) {
  return Math.max(0, Math.min(24 * 60, minutes));
}

function offsetToMinutes(offsetY) {
  return clampMinutes(snapMinutes((offsetY / ROW_HEIGHT) * 60));
}

// Calcule les bornes (minutes) affichées en temps réel pour le bloc en cours de manipulation.
function computeLivePreview(drag) {
  if (drag.mode === 'create') {
    return { start: Math.min(drag.anchor, drag.current), end: Math.max(drag.anchor, drag.current) };
  }
  if (drag.mode === 'resize') {
    if (drag.edge === 'start') {
      return { start: Math.min(drag.current, drag.otherEdge - MIN_DURATION_MINUTES), end: drag.otherEdge };
    }
    return { start: drag.otherEdge, end: Math.max(drag.current, drag.otherEdge + MIN_DURATION_MINUTES) };
  }
  if (drag.mode === 'move') {
    const start = clampMinutes(Math.min(24 * 60 - drag.duration, drag.current - drag.grabOffset));
    return { start, end: start + drag.duration };
  }
  return null;
}

function SlotBlock({ day, slot, slotIndex, canEdit, drag, onHandlePointerDown, onBodyPointerDown, onDelete }) {
  const isLive = drag && drag.date === day.date && drag.slotIndex === slotIndex && drag.mode !== 'create';
  const preview = isLive ? computeLivePreview(drag) : null;
  const startMinutes = preview ? preview.start : timeToMinutes(slot.start_time);
  const endMinutes = preview ? preview.end : timeToMinutes(slot.end_time);
  const top = (startMinutes / 60) * ROW_HEIGHT;
  const height = Math.max(6, ((endMinutes - startMinutes) / 60) * ROW_HEIGHT);
  const statusClass = day.availability_status === 'PARTIALLY_AVAILABLE' ? 'cal-slot--partial' : 'cal-slot--available';

  return (
    <div
      className={`cal-slot ${statusClass}${isLive ? ' cal-slot--dragging' : ''}`}
      style={{ top: `${top}px`, height: `${height}px` }}
      onPointerDown={canEdit ? (event) => onBodyPointerDown(event, slotIndex) : undefined}
    >
      {canEdit && (
        <div
          className="cal-slot-handle cal-slot-handle--top"
          onPointerDown={(event) => onHandlePointerDown(event, slotIndex, 'start')}
        />
      )}
      <span className="cal-slot-label">
        {toTimeInputValue(minutesToTime(startMinutes))} - {toTimeInputValue(minutesToTime(endMinutes))}
      </span>
      {canEdit && (
        <button
          type="button"
          className="cal-slot-delete"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onDelete(slotIndex)}
          aria-label="Supprimer cette plage"
        >
          <IconX />
        </button>
      )}
      {canEdit && (
        <div
          className="cal-slot-handle cal-slot-handle--bottom"
          onPointerDown={(event) => onHandlePointerDown(event, slotIndex, 'end')}
        />
      )}
    </div>
  );
}

function PresenceBlock({ segment }) {
  const top = (segment.start / 60) * ROW_HEIGHT;
  const height = Math.max(4, ((segment.end - segment.start) / 60) * ROW_HEIGHT);
  const startLabel = minutesToTime(segment.start);
  const endLabel = minutesToTime(segment.end);
  const variantLabel = PRESENCE_VARIANT_LABELS[segment.variant] || 'Présence';
  return (
    <div
      className={`cal-session-block cal-session-block--${segment.variant}${segment.isLive ? ' cal-session-block--live' : ''}`}
      style={{ top: `${top}px`, height: `${height}px` }}
      title={`${variantLabel} · ${startLabel}–${endLabel}${segment.isLive ? ' · en cours' : ''}`}
      aria-hidden="true"
    />
  );
}

function PresenceDaySummary({ summary, expanded, onToggle }) {
  let detailText = summary.firstConnection ? `Connexion ${summary.firstConnection}` : 'Aucune connexion';
  if (summary.status.label === 'À venir' || summary.status.label === 'En attente') {
    detailText = summary.plannedIntervals[0] ? `Prévu ${minutesToTime(summary.plannedIntervals[0].start)}` : 'À venir';
  } else if (summary.status.label === 'Non planifié') {
    detailText = 'Aucun créneau';
  }
  return (
    <button
      type="button"
      className={`cal-presence-summary cal-presence-summary--${summary.status.variant}`}
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={`${summary.status.label}. ${detailText}. ${formatPresenceMinutes(summary.connectedMinutes)} connectées sur ${formatPresenceMinutes(summary.plannedMinutes)} planifiées. Afficher le détail.`}
    >
      <span className="cal-presence-summary-dot" aria-hidden="true" />
      <span className="cal-presence-summary-copy">
        <strong>{summary.status.label}</strong>
        <span>{detailText}</span>
      </span>
    </button>
  );
}

function PresenceDetailPanel({ day, dayIndex, summary, onClose, panelRef }) {
  const plannedSlots = summary.plannedIntervals.map(
    (interval) => `${minutesToTime(interval.start)}–${minutesToTime(interval.end)}`
  );
  const actualSessions = summary.sessionIntervals.map(
    (interval) => `${minutesToTime(interval.start)}–${minutesToTime(interval.end)}${interval.isLive ? ' · en cours' : ''}`
  );
  const timelineSegments = [...summary.displaySegments, ...summary.missingSegments]
    .sort((first, second) => first.start - second.start || first.end - second.end);

  return (
    <section
      ref={panelRef}
      className="cal-presence-detail"
      aria-labelledby={`presence-detail-${day.date}`}
      tabIndex="-1"
    >
      <header className="cal-presence-detail-head">
        <div>
          <p className="cal-presence-detail-kicker">Détail de présence</p>
          <h3 id={`presence-detail-${day.date}`}>{formatDayLabel(day.date, dayIndex)}</h3>
        </div>
        <button type="button" className="cal-presence-detail-close" onClick={onClose} aria-label="Fermer le détail de présence">
          <IconX />
        </button>
      </header>

      <div className="cal-presence-detail-status">
        <span className={`cal-presence-detail-badge cal-presence-detail-badge--${summary.status.variant}`}>
          <span aria-hidden="true" /> {summary.status.label}
        </span>
        {summary.delayMinutes > 10 && <strong>{formatPresenceMinutes(summary.delayMinutes)} de retard</strong>}
      </div>

      <dl className="cal-presence-detail-metrics">
        <div><dt>Planifié</dt><dd>{formatPresenceMinutes(summary.plannedMinutes)}</dd></div>
        <div><dt>Connecté</dt><dd>{formatPresenceMinutes(summary.connectedMinutes)}</dd></div>
        <div><dt>Couvert</dt><dd>{formatPresenceMinutes(summary.coveredMinutes)}</dd></div>
        <div><dt>Hors planning</dt><dd>{formatPresenceMinutes(summary.outsideMinutes)}</dd></div>
        <div><dt>Non couvert à cette heure</dt><dd>{formatPresenceMinutes(summary.missedMinutes)}</dd></div>
      </dl>

      <div className="cal-presence-detail-ranges">
        <div>
          <h4>Créneaux planifiés</h4>
          {plannedSlots.length > 0 ? <p>{plannedSlots.join(' · ')}</p> : <p>Aucun créneau planifié.</p>}
        </div>
        <div>
          <h4>Connexions enregistrées</h4>
          {actualSessions.length > 0 ? <p>{actualSessions.join(' · ')}</p> : <p>Aucune connexion enregistrée.</p>}
        </div>
      </div>

      {timelineSegments.length > 0 && (
        <div className="cal-presence-detail-timeline">
          <h4>Lecture de la ligne de présence</h4>
          <ul>
            {timelineSegments.map((segment, index) => (
              <li key={`${segment.variant}-${segment.start}-${segment.end}-${index}`}>
                <span className={`cal-presence-timeline-mark cal-presence-timeline-mark--${segment.variant}`} aria-hidden="true" />
                <strong>{minutesToTime(segment.start)}–{minutesToTime(segment.end)}</strong>
                <span>{PRESENCE_VARIANT_LABELS[segment.variant]}</span>
                {segment.isLive && <em>En cours</em>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function WeekCalendarGrid({
  days,
  canEdit,
  onStatusChange,
  onSlotsChange,
  onCopyTo,
  onNoteChange,
  sessionSegmentsByDate,
  statusOptions = EMPLOYEE_STATUS_OPTIONS,
}) {
  const [drag, setDrag] = useState(null);
  const [selectedPresenceDate, setSelectedPresenceDate] = useState(null);
  const columnRefs = useRef({});
  const presenceDetailRef = useRef(null);
  const presenceTriggerRef = useRef(null);
  const hasPresenceData = sessionSegmentsByDate !== undefined;
  const presenceWeek = useMemo(
    () => (hasPresenceData ? computeWeekPresence(days, sessionSegmentsByDate || {}) : null),
    [days, hasPresenceData, sessionSegmentsByDate]
  );
  const selectedPresenceDay = selectedPresenceDate
    ? days.find((day) => day.date === selectedPresenceDate)
    : null;
  const selectedPresenceIndex = selectedPresenceDay ? days.indexOf(selectedPresenceDay) : -1;
  const selectedPresenceSummary = selectedPresenceDate ? presenceWeek?.days[selectedPresenceDate] : null;

  useEffect(() => {
    if (!selectedPresenceDate || !presenceDetailRef.current) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    presenceDetailRef.current.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
    presenceDetailRef.current.focus({ preventScroll: true });
  }, [selectedPresenceDate]);

  function closePresenceDetail() {
    setSelectedPresenceDate(null);
    window.requestAnimationFrame(() => presenceTriggerRef.current?.focus());
  }

  function minutesFromEvent(date, clientY) {
    const el = columnRefs.current[date];
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return offsetToMinutes(clientY - rect.top);
  }

  function handleColumnPointerDown(event, day) {
    if (!canEdit) return;
    if (!HAS_SLOTS_STATUSES.includes(day.availability_status)) return;
    if (event.target.closest('.cal-slot')) return; // laisse le bloc gérer son propre drag (resize/move)
    event.currentTarget.setPointerCapture(event.pointerId);
    const minutes = minutesFromEvent(day.date, event.clientY);
    setDrag({ mode: 'create', date: day.date, anchor: minutes, current: minutes });
  }

  function handleColumnPointerMove(event, day) {
    if (!drag || drag.date !== day.date) return;
    const minutes = minutesFromEvent(day.date, event.clientY);
    setDrag((current) => (current ? { ...current, current: minutes } : current));
  }

  // Le pointeur est toujours capturé sur la colonne (pas sur le bloc/la poignée cliqués) :
  // c'est la colonne qui porte les handlers pointermove/pointerup, et la capture "retargete"
  // tous les événements suivants vers l'élément capturant, quel que soit l'endroit du clic initial.
  function handleSlotHandlePointerDown(event, day, slotIndex, edge) {
    event.stopPropagation();
    if (!canEdit) return;
    columnRefs.current[day.date]?.setPointerCapture(event.pointerId);
    const slot = day.time_slots[slotIndex];
    const otherEdge = edge === 'start' ? timeToMinutes(slot.end_time) : timeToMinutes(slot.start_time);
    const current = minutesFromEvent(day.date, event.clientY);
    setDrag({ mode: 'resize', date: day.date, slotIndex, edge, otherEdge, current });
  }

  function handleSlotBodyPointerDown(event, day, slotIndex) {
    if (!canEdit) return;
    event.stopPropagation();
    columnRefs.current[day.date]?.setPointerCapture(event.pointerId);
    const slot = day.time_slots[slotIndex];
    const duration = timeToMinutes(slot.end_time) - timeToMinutes(slot.start_time);
    const pointerMinutes = minutesFromEvent(day.date, event.clientY);
    const grabOffset = pointerMinutes - timeToMinutes(slot.start_time);
    setDrag({ mode: 'move', date: day.date, slotIndex, duration, grabOffset, current: pointerMinutes });
  }

  function handleColumnPointerUp(event, day) {
    if (!drag || drag.date !== day.date) return;
    finalizeDrag(day);
  }

  function finalizeDrag(day) {
    if (!drag) return;

    if (drag.mode === 'create') {
      const start = Math.min(drag.anchor, drag.current);
      const end = Math.max(drag.anchor, drag.current);
      if (end - start >= MIN_DURATION_MINUTES) {
        const nextSlots = [...day.time_slots, { start_time: minutesToTime(start), end_time: minutesToTime(end) }];
        if (slotsOverlap(nextSlots)) {
          notifyError('Cette plage chevauche une plage existante.');
        } else {
          onSlotsChange(day.date, nextSlots);
        }
      }
    } else {
      const preview = computeLivePreview(drag);
      const nextSlots = day.time_slots.map((slot, index) =>
        index === drag.slotIndex
          ? { start_time: minutesToTime(preview.start), end_time: minutesToTime(preview.end) }
          : slot
      );
      if (slotsOverlap(nextSlots)) {
        notifyError('Cette plage chevaucherait une autre plage existante.');
      } else {
        onSlotsChange(day.date, nextSlots);
      }
    }

    setDrag(null);
  }

  function handleDeleteSlot(day, slotIndex) {
    onSlotsChange(day.date, day.time_slots.filter((_, index) => index !== slotIndex));
  }

  return (
    <div className="cal-calendar">
      <div className="cal-grid-wrap">
        <div className={`cal-grid${hasPresenceData ? ' cal-grid--presence' : ''}`}>
        <div className="cal-hour-column">
          <div className="cal-corner" />
          {HOURS.map((hour) => (
            <div key={hour} className="cal-hour-label" style={{ height: `${ROW_HEIGHT}px` }}>
              {String(hour).padStart(2, '0')}:00
            </div>
          ))}
        </div>

        {days.map((day, dayIndex) => {
          const isDrawable = canEdit && HAS_SLOTS_STATUSES.includes(day.availability_status);
          const presenceSummary = presenceWeek?.days[day.date];
          // Tout statut posé qui ne porte pas de plages (Indisponible / Congé / Maladie)
          // s'affiche « bloqué » (hachuré) avec son libellé.
          const isBlocked =
            canEdit && day.availability_status && !HAS_SLOTS_STATUSES.includes(day.availability_status);
          return (
            <div className="cal-day-column-wrap" key={day.date}>
              <div className="cal-day-header">
                <span className="cal-day-title">{formatDayLabel(day.date, dayIndex)}</span>
                {canEdit ? (
                  <div className="cal-day-status-toggle" role="group" aria-label="Statut de disponibilité">
                    {statusOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        title={option.label}
                        aria-label={option.label}
                        className={`cal-status-dot ${STATUS_DOT_CLASS[option.value]}${
                          day.availability_status === option.value ? ' cal-status-dot--active' : ''
                        }`}
                        onClick={() => onStatusChange(day.date, option.value)}
                      />
                    ))}
                    {onCopyTo && (
                      <select
                        className="cal-copy-select"
                        value=""
                        aria-label={`Copier vers un autre jour depuis ${formatDayLabel(day.date, dayIndex)}`}
                        onChange={(event) => {
                          if (event.target.value) onCopyTo(day.date, event.target.value);
                          event.target.value = '';
                        }}
                      >
                        <option value="">Copier vers...</option>
                        {days
                          .filter((other) => other.date !== day.date)
                          .map((other, otherIndex) => (
                            <option key={other.date} value={other.date}>
                              {formatDayLabel(other.date, days.indexOf(other))}
                            </option>
                          ))}
                      </select>
                    )}
                  </div>
                ) : (
                  day.availability_status && (
                    <span className={`pill ${STATUS_PILL_CLASS[day.availability_status]}`}>
                      {STATUS_LABELS[day.availability_status]}
                    </span>
                  )
                )}
                {presenceSummary && (
                  <PresenceDaySummary
                    summary={presenceSummary}
                    expanded={selectedPresenceDate === day.date}
                    onToggle={(event) => {
                      presenceTriggerRef.current = event.currentTarget;
                      if (selectedPresenceDate === day.date) closePresenceDetail();
                      else setSelectedPresenceDate(day.date);
                    }}
                  />
                )}
              </div>

              <div
                className={`cal-day-column${isDrawable ? ' cal-day-column--drawable' : ''}${isBlocked ? ' cal-day-column--blocked' : ''}`}
                style={{ height: `${ROW_HEIGHT * 24}px` }}
                ref={(el) => {
                  columnRefs.current[day.date] = el;
                }}
                onPointerDown={(event) => handleColumnPointerDown(event, day)}
                onPointerMove={(event) => handleColumnPointerMove(event, day)}
                onPointerUp={(event) => handleColumnPointerUp(event, day)}
              >
                {HOURS.map((hour) => (
                  <div key={hour} className="cal-hour-row" style={{ height: `${ROW_HEIGHT}px` }} />
                ))}

                {!day.availability_status && canEdit && (
                  <div className="cal-day-empty-hint">Choisissez un statut</div>
                )}
                {isBlocked && (
                  <div className="cal-day-empty-hint">{STATUS_LABELS[day.availability_status]}</div>
                )}

                {presenceSummary?.missingSegments.map((segment, segmentIndex) => (
                  <PresenceBlock key={`missing-${segmentIndex}`} segment={segment} />
                ))}

                {presenceSummary?.displaySegments.map((segment, segmentIndex) => (
                  <PresenceBlock key={`presence-${segmentIndex}`} segment={segment} />
                ))}

                {day.time_slots.map((slot, slotIndex) => (
                  <SlotBlock
                    key={slotIndex}
                    day={day}
                    slot={slot}
                    slotIndex={slotIndex}
                    canEdit={canEdit}
                    drag={drag}
                    onHandlePointerDown={(event, index, edge) => handleSlotHandlePointerDown(event, day, index, edge)}
                    onBodyPointerDown={(event, index) => handleSlotBodyPointerDown(event, day, index)}
                    onDelete={(index) => handleDeleteSlot(day, index)}
                  />
                ))}

                {drag && drag.mode === 'create' && drag.date === day.date && (
                  <div
                    className="cal-slot cal-slot--preview"
                    style={{
                      top: `${(Math.min(drag.anchor, drag.current) / 60) * ROW_HEIGHT}px`,
                      height: `${Math.max(6, ((Math.max(drag.anchor, drag.current) - Math.min(drag.anchor, drag.current)) / 60) * ROW_HEIGHT)}px`,
                    }}
                  >
                    <span className="cal-slot-label">
                      {minutesToTime(Math.min(drag.anchor, drag.current))} - {minutesToTime(Math.max(drag.anchor, drag.current))}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        </div>

        {onNoteChange && (
          <div className="cal-notes-row">
            <div className="cal-notes-row-spacer" />
            {days.map((day, index) => (
              <label className="cal-note-cell" key={day.date}>
                <span>{formatDayLabel(day.date, index).slice(0, 3)}</span>
                <input
                  type="text"
                  value={day.note || ''}
                  onChange={(event) => onNoteChange(day.date, event.target.value)}
                  disabled={!canEdit}
                  placeholder="Note"
                />
              </label>
            ))}
          </div>
        )}
      </div>

      {selectedPresenceDay && selectedPresenceSummary && (
        <PresenceDetailPanel
          day={selectedPresenceDay}
          dayIndex={selectedPresenceIndex}
          summary={selectedPresenceSummary}
          onClose={closePresenceDetail}
          panelRef={presenceDetailRef}
        />
      )}
    </div>
  );
}

export default WeekCalendarGrid;
