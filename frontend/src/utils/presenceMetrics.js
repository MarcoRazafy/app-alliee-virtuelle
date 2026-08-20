import { HAS_SLOTS_STATUSES, timeToMinutes } from './planningFormat.js';

export const PRESENCE_LATE_GRACE_MINUTES = 10;
export const PLANNING_TIME_ZONE = 'Indian/Antananarivo';

export const PRESENCE_VARIANT_LABELS = {
  ontime: 'Présence conforme',
  late: 'Arrivée en retard',
  off: 'Connexion hors planning',
  missing: 'Période planifiée non couverte',
};

function intervalDuration(intervals) {
  return intervals.reduce((total, interval) => total + interval.end - interval.start, 0);
}

function normalizeIntervals(items = [], { keepLive = false } = {}) {
  const intervals = items
    .map((item) => ({
      start: timeToMinutes(item.start_time),
      end: timeToMinutes(item.end_time),
      isLive: keepLive && Boolean(item.is_live),
    }))
    .filter((interval) => Number.isFinite(interval.start) && Number.isFinite(interval.end) && interval.end > interval.start)
    .sort((first, second) => first.start - second.start || first.end - second.end);

  return intervals.reduce((merged, interval) => {
    const previous = merged[merged.length - 1];
    if (!previous || interval.start > previous.end) {
      merged.push({ ...interval });
      return merged;
    }
    previous.end = Math.max(previous.end, interval.end);
    previous.isLive = previous.isLive || interval.isLive;
    return merged;
  }, []);
}

function intersectIntervals(firstIntervals, secondIntervals) {
  const result = [];
  firstIntervals.forEach((first) => {
    secondIntervals.forEach((second) => {
      const start = Math.max(first.start, second.start);
      const end = Math.min(first.end, second.end);
      if (end > start) result.push({ start, end, isLive: Boolean(second.isLive) });
    });
  });
  return normalizeIntervals(
    result.map((interval) => ({
      start_time: minutesToClock(interval.start),
      end_time: minutesToClock(interval.end),
      is_live: interval.isLive,
    })),
    { keepLive: true }
  );
}

function subtractIntervals(baseIntervals, coveredIntervals) {
  const result = [];
  baseIntervals.forEach((base) => {
    let cursor = base.start;
    coveredIntervals.forEach((covered) => {
      if (covered.end <= cursor || covered.start >= base.end) return;
      if (covered.start > cursor) result.push({ start: cursor, end: Math.min(covered.start, base.end) });
      cursor = Math.max(cursor, covered.end);
    });
    if (cursor < base.end) result.push({ start: cursor, end: base.end });
  });
  return result;
}

function clipIntervals(intervals, endLimit) {
  if (endLimit <= 0) return [];
  return intervals
    .map((interval) => ({ ...interval, end: Math.min(interval.end, endLimit) }))
    .filter((interval) => interval.end > interval.start);
}

function minutesToClock(totalMinutes) {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(totalMinutes)));
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function planningNow(referenceDate = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PLANNING_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(referenceDate);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    minutes: Number(values.hour) * 60 + Number(values.minute),
  };
}

function elapsedLimitForDate(date, now) {
  if (date < now.date) return 24 * 60;
  if (date > now.date) return 0;
  return now.minutes;
}

function splitSessionIntervals(sessionIntervals, plannedIntervals, delayMinutes) {
  const pieces = [];

  sessionIntervals.forEach((session) => {
    const boundaries = new Set([session.start, session.end]);
    plannedIntervals.forEach((planned) => {
      if (planned.start > session.start && planned.start < session.end) boundaries.add(planned.start);
      if (planned.end > session.start && planned.end < session.end) boundaries.add(planned.end);
    });
    const sortedBoundaries = [...boundaries].sort((first, second) => first - second);

    for (let index = 0; index < sortedBoundaries.length - 1; index += 1) {
      const start = sortedBoundaries[index];
      const end = sortedBoundaries[index + 1];
      const midpoint = start + (end - start) / 2;
      const insidePlanning = plannedIntervals.some((planned) => midpoint >= planned.start && midpoint < planned.end);
      pieces.push({ start, end, variant: insidePlanning ? 'ontime' : 'off', isLive: session.isLive });
    }
  });

  if (delayMinutes > PRESENCE_LATE_GRACE_MINUTES) {
    const firstCoveredIndex = pieces.findIndex((piece) => piece.variant === 'ontime');
    if (firstCoveredIndex >= 0) {
      const firstCovered = pieces[firstCoveredIndex];
      const lateMarkerEnd = Math.min(firstCovered.end, firstCovered.start + 15);
      const replacements = [{ ...firstCovered, end: lateMarkerEnd, variant: 'late' }];
      if (lateMarkerEnd < firstCovered.end) {
        replacements.push({ ...firstCovered, start: lateMarkerEnd });
      }
      pieces.splice(firstCoveredIndex, 1, ...replacements);
    }
  }

  return pieces;
}

function buildDayStatus({ planned, sessions, coveredMinutes, missedMinutes, delayMinutes, elapsedLimit }) {
  const hasLiveSession = sessions.some((session) => session.isLive);

  if (planned.length === 0) {
    if (sessions.length === 0) return { variant: 'neutral', label: 'Non planifié' };
    return { variant: 'off', label: hasLiveSession ? 'En cours hors planning' : 'Hors planning' };
  }

  const firstPlannedStart = planned[0].start;
  if (sessions.length === 0) {
    if (elapsedLimit <= firstPlannedStart + PRESENCE_LATE_GRACE_MINUTES) {
      return { variant: 'neutral', label: elapsedLimit === 0 ? 'À venir' : 'En attente' };
    }
    return { variant: 'missing', label: 'Absent' };
  }

  if (delayMinutes > PRESENCE_LATE_GRACE_MINUTES) {
    return { variant: 'late', label: `Retard de ${formatPresenceMinutes(delayMinutes)}` };
  }
  if (coveredMinutes === 0) {
    return { variant: 'off', label: hasLiveSession ? 'En cours hors planning' : 'Hors planning' };
  }
  if (missedMinutes > PRESENCE_LATE_GRACE_MINUTES) {
    return { variant: 'missing', label: 'Présence partielle' };
  }
  if (hasLiveSession) return { variant: 'ontime', label: 'En cours' };
  return { variant: 'ontime', label: 'À l’heure' };
}

export function formatPresenceMinutes(minutes) {
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  if (hours > 0 && rest > 0) return `${hours} h ${String(rest).padStart(2, '0')}`;
  if (hours > 0) return `${hours} h`;
  return `${rest} min`;
}

// Durée cumulée en heures décimales (« 8,3 h »). À utiliser pour les totaux de retard :
// le format « 8 h 17 » de formatPresenceMinutes se lit comme une heure d'horloge (8h17 du
// matin) alors qu'il s'agit d'un cumul.
export function formatPresenceHours(minutes) {
  const rounded = Math.max(0, Math.round(minutes));
  if (rounded < 60) return `${rounded} min`;
  const hours = rounded / 60;
  const display = hours < 10 ? Math.round(hours * 10) / 10 : Math.round(hours);
  return `${String(display).replace('.', ',')} h`;
}

export function computeDayPresence(day, segments = [], options = {}) {
  const now = options.now || planningNow(options.referenceDate);
  const planned = HAS_SLOTS_STATUSES.includes(day.availability_status)
    ? normalizeIntervals(day.time_slots || [])
    : [];
  const sessions = normalizeIntervals(segments, { keepLive: true });
  const elapsedLimit = elapsedLimitForDate(day.date, now);
  const elapsedPlanned = clipIntervals(planned, elapsedLimit);
  const covered = intersectIntervals(planned, sessions);
  const missing = subtractIntervals(elapsedPlanned, sessions);
  // Le retard porte sur le premier créneau de la journée. Une connexion uniquement
  // pendant un créneau ultérieur relève d'une présence partielle, pas d'un retard artificiel
  // de plusieurs heures par rapport au matin.
  const firstRelevantSession = planned.length > 0
    ? sessions.find((session) => session.end > planned[0].start && session.start < planned[0].end)
    : null;
  const delayMinutes = firstRelevantSession ? Math.max(0, firstRelevantSession.start - planned[0].start) : 0;
  const plannedMinutes = intervalDuration(planned);
  const connectedMinutes = intervalDuration(sessions);
  const coveredMinutes = intervalDuration(covered);
  const missedMinutes = intervalDuration(missing);
  const outsideMinutes = Math.max(0, connectedMinutes - coveredMinutes);
  const status = buildDayStatus({
    planned,
    sessions,
    coveredMinutes,
    missedMinutes,
    delayMinutes,
    elapsedLimit,
  });

  return {
    date: day.date,
    status,
    plannedMinutes,
    connectedMinutes,
    coveredMinutes,
    outsideMinutes,
    missedMinutes,
    delayMinutes,
    firstConnection: sessions[0] ? minutesToClock(sessions[0].start) : null,
    isLive: sessions.some((session) => session.isLive),
    plannedIntervals: planned,
    sessionIntervals: sessions,
    displaySegments: splitSessionIntervals(sessions, planned, delayMinutes),
    missingSegments: missing.map((interval) => ({ ...interval, variant: 'missing', isLive: false })),
  };
}

export function computeWeekPresence(days = [], segmentsByDate = {}, options = {}) {
  const now = options.now || planningNow(options.referenceDate);
  const daySummaries = days.map((day) => computeDayPresence(day, segmentsByDate[day.date] || [], { now }));

  return daySummaries.reduce(
    (summary, day) => {
      summary.days[day.date] = day;
      summary.plannedMinutes += day.plannedMinutes;
      summary.connectedMinutes += day.connectedMinutes;
      summary.coveredMinutes += day.coveredMinutes;
      summary.outsideMinutes += day.outsideMinutes;
      summary.missedMinutes += day.missedMinutes;
      if (day.delayMinutes > PRESENCE_LATE_GRACE_MINUTES) {
        summary.lateDays += 1;
        summary.lateMinutes += day.delayMinutes;
      }
      if (day.status.label === 'Absent') summary.absentDays += 1;
      return summary;
    },
    {
      days: {},
      plannedMinutes: 0,
      connectedMinutes: 0,
      coveredMinutes: 0,
      outsideMinutes: 0,
      missedMinutes: 0,
      lateDays: 0,
      lateMinutes: 0,
      absentDays: 0,
    }
  );
}
