const DEFAULT_GRACE_MINUTES = 10;

function duration(intervals) {
  return intervals.reduce((total, interval) => total + interval.end - interval.start, 0);
}

function normalizeIntervals(intervals = []) {
  const sorted = intervals
    .map((interval) => ({
      start: Number(interval.start),
      end: Number(interval.end),
      isLive: Boolean(interval.isLive),
    }))
    .filter((interval) => Number.isFinite(interval.start) && Number.isFinite(interval.end) && interval.end > interval.start)
    .sort((first, second) => first.start - second.start || first.end - second.end);

  return sorted.reduce((merged, interval) => {
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
      if (end > start) result.push({ start, end });
    });
  });
  return normalizeIntervals(result);
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

function computeAttendanceMetrics({ slots = [], sessions = [], elapsedLimit = 0, graceMinutes = DEFAULT_GRACE_MINUTES }) {
  const planned = normalizeIntervals(slots);
  const connected = normalizeIntervals(sessions);
  const elapsedPlanned = clipIntervals(planned, elapsedLimit);
  const covered = intersectIntervals(planned, connected);
  const missing = subtractIntervals(elapsedPlanned, connected);
  const firstPlanned = planned[0] || null;
  const firstRelevantSession = firstPlanned
    ? connected.find((session) => session.end > firstPlanned.start && session.start < firstPlanned.end)
    : null;
  const delayMinutes = firstRelevantSession ? Math.max(0, firstRelevantSession.start - firstPlanned.start) : 0;
  const plannedMinutes = duration(planned);
  const connectedMinutes = duration(connected);
  const coveredMinutes = duration(covered);
  const missedMinutes = duration(missing);
  const outsideMinutes = Math.max(0, connectedMinutes - coveredMinutes);
  const isLive = connected.some((session) => session.isLive);

  let status;
  if (planned.length === 0) {
    status = 'off';
  } else if (connected.length === 0) {
    if (elapsedLimit === 0) status = 'upcoming';
    else if (elapsedLimit <= firstPlanned.start + graceMinutes) status = 'waiting';
    else status = 'absent';
  } else if (delayMinutes > graceMinutes) {
    status = 'late';
  } else if (coveredMinutes === 0) {
    status = 'outside';
  } else if (missedMinutes > graceMinutes) {
    status = 'partial';
  } else {
    status = 'present';
  }

  return {
    status,
    plannedMinutes,
    connectedMinutes,
    coveredMinutes,
    outsideMinutes,
    missedMinutes,
    delayMinutes,
    accomplishment: plannedMinutes > 0 ? Math.min(100, Math.round((coveredMinutes / plannedMinutes) * 100)) : null,
    firstConnection: connected[0]?.start ?? null,
    isLive,
  };
}

module.exports = {
  DEFAULT_GRACE_MINUTES,
  normalizeIntervals,
  computeAttendanceMetrics,
};
