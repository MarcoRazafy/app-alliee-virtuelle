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
  parseTimeRanges,
  formatSlotsAsRanges,
} from '../../utils/planningFormat';
import {
  computeWeekPresence,
  formatPresenceMinutes,
  PRESENCE_VARIANT_LABELS,
} from '../../utils/presenceMetrics';
import { notifyError } from '../../utils/toast';
import { computeHourRange } from '../../utils/calendarRange';

const ROW_HEIGHT = 40; // px par heure
const SNAP_MINUTES = 15;
const MIN_DURATION_MINUTES = 15;

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

// Les bornes suivent la plage affichée (et non plus minuit → minuit), sinon un clic en haut
// de la grille renverrait 00:00 au lieu de l'heure réellement représentée à cet endroit.
function clampMinutes(minutes, range) {
  return Math.max(range.startMinutes, Math.min(range.endMinutes, minutes));
}

function offsetToMinutes(offsetY, range) {
  return clampMinutes(range.startMinutes + snapMinutes((offsetY / ROW_HEIGHT) * 60), range);
}

// Calcule les bornes (minutes) affichées en temps réel pour le bloc en cours de manipulation.
function computeLivePreview(drag, range) {
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
    const start = clampMinutes(Math.min(range.endMinutes - drag.duration, drag.current - drag.grabOffset), range);
    return { start, end: start + drag.duration };
  }
  return null;
}

function SlotBlock({ day, slot, slotIndex, canEdit, drag, range, onHandlePointerDown, onBodyPointerDown, onDelete }) {
  const isLive = drag && drag.date === day.date && drag.slotIndex === slotIndex && drag.mode !== 'create';
  const preview = isLive ? computeLivePreview(drag, range) : null;
  const startMinutes = preview ? preview.start : timeToMinutes(slot.start_time);
  const endMinutes = preview ? preview.end : timeToMinutes(slot.end_time);
  // Origine = début de la plage affichée, pas minuit.
  const top = ((startMinutes - range.startMinutes) / 60) * ROW_HEIGHT;
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
          aria-label='Supprimer cette plage'
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

function PresenceBlock({ segment, range }) {
  const top = ((segment.start - range.startMinutes) / 60) * ROW_HEIGHT;
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
          <p className="cal-presence-detail-kicker">Détails de présence</p>
          <h3 id={`presence-detail-${day.date}`}>{formatDayLabel(day.date, dayIndex)}</h3>
        </div>
        <button type="button" className="cal-presence-detail-close" onClick={onClose} aria-label='Fermer le détail de présence'>
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

// Saisie rapide des plages d'une journée au format texte (ex. « 08h-12h | 13h-18h »),
// en complément du glisser-déposer. Appliquée à la validation (Entrée / perte de focus).
function DayRangeInput({ day, onApply }) {
  const canonical = formatSlotsAsRanges(day.time_slots);
  const [text, setText] = useState(canonical);
  // Resynchronise le champ quand les plages changent ailleurs (drag, statut, copie).
  useEffect(() => {
    setText(canonical);
  }, [canonical]);

  function commit() {
    if (text.trim() === canonical) return; // rien de neuf saisi
    onApply(day, text);
  }

  return (
    <input
      type="text"
      className="cal-range-input"
      value={text}
      placeholder="ex. 08h-12h | 13h-18h"
      aria-label={`Plages horaires pour ${formatDayLabel(day.date, 0)}`}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      onBlur={commit}
    />
  );
}

// Détecte le mode mobile (réévalué au redimensionnement) pour désactiver le glisser-déposer
// et basculer sur l'éditeur empilé, plus adapté aux petits écrans / au tactile.
function useIsMobile(breakpoint = 900) {
  const query = `(max-width: ${breakpoint}px)`;
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = (event) => setIsMobile(event.matches);
    mq.addEventListener('change', handler);
    setIsMobile(mq.matches);
    return () => mq.removeEventListener('change', handler);
  }, [query]);
  return isMobile;
}

// Carte d'édition d'une journée sur mobile : statut + liste des plages (supprimables) + ajout
// d'une plage via deux sélecteurs d'heure natifs (Début / Fin) et un bouton « Add ».
function MobileDayCard({ day, index, statusOptions, onStatusChange, onSlotsChange }) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const canSlots = HAS_SLOTS_STATUSES.includes(day.availability_status);

  function addSlot() {
    if (!start || !end) {
      notifyError('Renseigne une heure de début et de fin.');
      return;
    }
    if (timeToMinutes(end) <= timeToMinutes(start)) {
      notifyError("L'heure de fin doit être après l'heure de début.");
      return;
    }
    const next = [...day.time_slots, { start_time: start, end_time: end }];
    if (slotsOverlap(next)) {
      notifyError('Cette plage en chevauche une autre.');
      return;
    }
    if (!canSlots) onStatusChange(day.date, 'AVAILABLE');
    onSlotsChange(
      day.date,
      next.sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time))
    );
    setStart('');
    setEnd('');
  }

  function removeSlot(slotIndex) {
    onSlotsChange(day.date, day.time_slots.filter((_, i) => i !== slotIndex));
  }

  return (
    <div className="cal-medit-day">
      <div className="cal-medit-head">
        <span className="cal-medit-title">{formatDayLabel(day.date, index)}</span>
        <div className="cal-medit-status" role="group" aria-label='Statut de disponibilité'>
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
        </div>
      </div>

      {canSlots ? (
        <>
          <div className="cal-medit-slots">
            {day.time_slots.length === 0 && <span className="cal-medit-empty">Aucune plage pour l'instant</span>}
            {day.time_slots.map((slot, slotIndex) => (
              <span className="cal-medit-chip" key={slotIndex}>
                {toTimeInputValue(slot.start_time)}–{toTimeInputValue(slot.end_time)}
                <button type="button" onClick={() => removeSlot(slotIndex)} aria-label="Supprimer la plage">
                  <IconX />
                </button>
              </span>
            ))}
          </div>
          <div className="cal-medit-add">
            <label>
              <span>Début</span>
              <input type="time" value={start} onChange={(event) => setStart(event.target.value)} />
            </label>
            <label>
              <span>Fin</span>
              <input type="time" value={end} onChange={(event) => setEnd(event.target.value)} />
            </label>
            <button type="button" className="cal-medit-add-btn" onClick={addSlot}>
              Ajouter
            </button>
          </div>
        </>
      ) : (
        day.availability_status && (
          <span className={`pill ${STATUS_PILL_CLASS[day.availability_status]}`}>
            {STATUS_LABELS[day.availability_status]}
          </span>
        )
      )}
    </div>
  );
}

// Éditeur empilé (mobile) : une carte par jour. Remplace le glisser-déposer, trop petit et
// peu pratique au doigt sur la grille horizontale.
function MobileDayEditor({ days, statusOptions, onStatusChange, onSlotsChange }) {
  return (
    <div className="cal-mobile-editor">
      <p className="cal-mobile-editor-hint">Choisis un statut, puis ajoute des plages horaires ci-dessous.</p>
      {days.map((day, index) => (
        <MobileDayCard
          key={day.date}
          day={day}
          index={index}
          statusOptions={statusOptions}
          onStatusChange={onStatusChange}
          onSlotsChange={onSlotsChange}
        />
      ))}
    </div>
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
  const isMobile = useIsMobile();
  const [drag, setDrag] = useState(null);
  const [selectedPresenceDate, setSelectedPresenceDate] = useState(null);
  const columnRefs = useRef({});
  const presenceDetailRef = useRef(null);
  const presenceTriggerRef = useRef(null);
  const hasPresenceData = sessionSegmentsByDate !== undefined;
  // Plage horaire affichée + liste des heures : partagées par la colonne de gauche et les
  // lignes de fond de chaque jour, qui doivent itérer sur EXACTEMENT le même tableau.
  const { startHour, endHour } = useMemo(
    () => computeHourRange(days, sessionSegmentsByDate, canEdit),
    [days, sessionSegmentsByDate, canEdit]
  );
  const hours = useMemo(
    () => Array.from({ length: endHour - startHour }, (_, i) => startHour + i),
    [startHour, endHour]
  );
  const range = useMemo(
    () => ({ startMinutes: startHour * 60, endMinutes: endHour * 60 }),
    [startHour, endHour]
  );

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
    if (!el) return range.startMinutes;
    const rect = el.getBoundingClientRect();
    return offsetToMinutes(clientY - rect.top, range);
  }

  function handleColumnPointerDown(event, day) {
    if (!canEdit || isMobile) return; // mobile : édition via l'éditeur empilé, pas le drag
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
    if (!canEdit || isMobile) return;
    columnRefs.current[day.date]?.setPointerCapture(event.pointerId);
    const slot = day.time_slots[slotIndex];
    const otherEdge = edge === 'start' ? timeToMinutes(slot.end_time) : timeToMinutes(slot.start_time);
    const current = minutesFromEvent(day.date, event.clientY);
    setDrag({ mode: 'resize', date: day.date, slotIndex, edge, otherEdge, current });
  }

  function handleSlotBodyPointerDown(event, day, slotIndex) {
    if (!canEdit || isMobile) return;
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
      const preview = computeLivePreview(drag, range);
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

  // Applique une saisie texte de plages (« 08h-12h | 13h-18h ») à une journée. Bascule
  // automatiquement le statut sur « Disponible » si des plages sont saisies sur un jour sans
  // statut compatible, pour que les plages soient conservées (comme pour le glisser-déposer).
  function applyRangeText(day, text) {
    const result = parseTimeRanges(text);
    if (!result.ok) {
      notifyError(result.error);
      return;
    }
    if (result.slots.length > 0 && !HAS_SLOTS_STATUSES.includes(day.availability_status)) {
      onStatusChange(day.date, 'AVAILABLE');
    }
    onSlotsChange(day.date, result.slots);
  }

  return (
    <div className="cal-calendar">
      <div className="cal-grid-wrap">
        <div className={`cal-grid${hasPresenceData ? ' cal-grid--presence' : ''}${canEdit ? ' cal-grid--edit' : ''}`}>
        <div className="cal-hour-column">
          <div className="cal-corner" />
          {hours.map((hour) => (
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
                  <>
                  <div className="cal-day-status-toggle" role="group" aria-label='Statut de disponibilité'>
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
                        <option value="">Copier vers…</option>
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
                  {(!day.availability_status || HAS_SLOTS_STATUSES.includes(day.availability_status)) && (
                    <DayRangeInput day={day} onApply={applyRangeText} />
                  )}
                  </>
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
                style={{ height: `${ROW_HEIGHT * hours.length}px` }}
                ref={(el) => {
                  columnRefs.current[day.date] = el;
                }}
                onPointerDown={(event) => handleColumnPointerDown(event, day)}
                onPointerMove={(event) => handleColumnPointerMove(event, day)}
                onPointerUp={(event) => handleColumnPointerUp(event, day)}
              >
                {hours.map((hour) => (
                  <div key={hour} className="cal-hour-row" style={{ height: `${ROW_HEIGHT}px` }} />
                ))}

                {!day.availability_status && canEdit && (
                  <div className="cal-day-empty-hint">Choisissez un statut</div>
                )}
                {isBlocked && (
                  <div className="cal-day-empty-hint">{STATUS_LABELS[day.availability_status]}</div>
                )}

                {presenceSummary?.missingSegments.map((segment, segmentIndex) => (
                  <PresenceBlock key={`missing-${segmentIndex}`} segment={segment} range={range} />
                ))}

                {presenceSummary?.displaySegments.map((segment, segmentIndex) => (
                  <PresenceBlock key={`presence-${segmentIndex}`} segment={segment} range={range} />
                ))}

                {day.time_slots.map((slot, slotIndex) => (
                  <SlotBlock
                    key={slotIndex}
                    day={day}
                    slot={slot}
                    slotIndex={slotIndex}
                    canEdit={canEdit}
                    drag={drag}
                    range={range}
                    onHandlePointerDown={(event, index, edge) => handleSlotHandlePointerDown(event, day, index, edge)}
                    onBodyPointerDown={(event, index) => handleSlotBodyPointerDown(event, day, index)}
                    onDelete={(index) => handleDeleteSlot(day, index)}
                  />
                ))}

                {drag && drag.mode === 'create' && drag.date === day.date && (
                  <div
                    className="cal-slot cal-slot--preview"
                    style={{
                      top: `${((Math.min(drag.anchor, drag.current) - range.startMinutes) / 60) * ROW_HEIGHT}px`,
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

      {/* Légende : sans elle, les bandes hachurées et les nuances de couleur des blocs de
          présence n'étaient explicités que par une infobulle au survol. */}
      {hasPresenceData && (
        <ul className="cal-legend">
          {['ontime', 'late', 'off', 'missing'].map((variant) => (
            <li className="cal-legend-item" key={variant}>
              <span className={`cal-legend-swatch cal-session-block--${variant}`} aria-hidden="true" />
              {PRESENCE_VARIANT_LABELS[variant]}
            </li>
          ))}
        </ul>
      )}

      {canEdit && isMobile && (
        <MobileDayEditor
          days={days}
          statusOptions={statusOptions}
          onStatusChange={onStatusChange}
          onSlotsChange={onSlotsChange}
        />
      )}

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
