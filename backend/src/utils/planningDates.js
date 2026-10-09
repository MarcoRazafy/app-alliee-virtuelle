const { DateTime } = require('luxon');
const env = require('../config/env');

const PLANNING_TIMEZONE = env.planningTimezone;

const DATE_FORMAT = 'yyyy-MM-dd';

const PLANNING_STATUS = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  LOCKED: 'LOCKED',
  ADMIN_MODIFIED: 'ADMIN_MODIFIED',
  NOT_SUBMITTED: 'NOT_SUBMITTED',
};

const AVAILABILITY_STATUS = {
  AVAILABLE: 'AVAILABLE',
  PARTIALLY_AVAILABLE: 'PARTIALLY_AVAILABLE',
  UNAVAILABLE: 'UNAVAILABLE',
  LEAVE: 'LEAVE',
  SICK: 'SICK',
};

const EMPLOYEE_AVAILABILITY_STATUSES = [
  AVAILABILITY_STATUS.AVAILABLE,
  AVAILABILITY_STATUS.PARTIALLY_AVAILABLE,
  AVAILABILITY_STATUS.UNAVAILABLE,
];

function nowInPlanningZone() {
  return DateTime.now().setZone(PLANNING_TIMEZONE);
}

function getWeekStart(dateTime) {
  return dateTime.minus({ days: dateTime.weekday - 1 }).startOf('day');
}

function getCurrentWeekStart(referenceDateTime = nowInPlanningZone()) {
  return getWeekStart(referenceDateTime);
}

function getNextWeekStart(referenceDateTime = nowInPlanningZone()) {
  return getCurrentWeekStart(referenceDateTime).plus({ days: 7 });
}

function getWeekEnd(weekStartDateTime) {
  return weekStartDateTime.plus({ days: 6 }).startOf('day');
}

function isEmployeeWindowOpen(referenceDateTime = nowInPlanningZone()) {
  if (env.planningForceEditWindow) return true;
  return referenceDateTime.weekday === 6 || referenceDateTime.weekday === 7;
}

function getEditingWindowBounds(referenceDateTime = nowInPlanningZone()) {
  const weekStart = getCurrentWeekStart(referenceDateTime);
  const opensAt = weekStart.plus({ days: 5 }).startOf('day');
  const closesAt = weekStart.plus({ days: 6 }).endOf('day');
  return { opensAt, closesAt };
}

function formatDate(dateTime) {
  return dateTime.toFormat(DATE_FORMAT);
}

function parsePlanningDate(dateString) {
  return DateTime.fromISO(dateString, { zone: PLANNING_TIMEZONE }).startOf('day');
}

function isDateInWeek(dateString, weekStartDateString) {
  const date = parsePlanningDate(dateString);
  const weekStart = parsePlanningDate(weekStartDateString);
  const weekEnd = weekStart.plus({ days: 6 });
  return date >= weekStart && date <= weekEnd;
}

function canEmployeeEditWeek(weekStartDateString, referenceDateTime = nowInPlanningZone(), options = {}) {
  const nextWeekStart = formatDate(getNextWeekStart(referenceDateTime));
  if (weekStartDateString === nextWeekStart && isEmployeeWindowOpen(referenceDateTime)) return true;

  const currentWeekStart = formatDate(getCurrentWeekStart(referenceDateTime));
  if (
    weekStartDateString === currentWeekStart &&
    options.hasNextWeekPlanning === false &&
    options.currentWeekSubmitted === false
  ) {
    return true;
  }
  return false;
}

function computeEffectiveStatus({ status, weekStartDateString, referenceDateTime = nowInPlanningZone() }) {
  const weekStart = parsePlanningDate(weekStartDateString);
  const now = referenceDateTime.startOf('day');
  const windowClosedForWeek = now >= weekStart;

  if (!status) {
    return windowClosedForWeek ? PLANNING_STATUS.NOT_SUBMITTED : PLANNING_STATUS.DRAFT;
  }

  if (status === PLANNING_STATUS.ADMIN_MODIFIED) {
    return PLANNING_STATUS.ADMIN_MODIFIED;
  }

  if (windowClosedForWeek) {
    if (status === PLANNING_STATUS.SUBMITTED) return PLANNING_STATUS.LOCKED;
    return PLANNING_STATUS.NOT_SUBMITTED;
  }

  return status;
}

function formatFrenchDayDate(dateString) {
  return parsePlanningDate(dateString).setLocale('fr').toFormat('cccc d MMMM');
}

function getWeekDates(weekStartDateString) {
  const weekStart = parsePlanningDate(weekStartDateString);
  return Array.from({ length: 7 }, (_, i) => formatDate(weekStart.plus({ days: i })));
}

function formatDbDate(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function splitRangeIntoDaySegments(startIso, endIso) {
  const start = DateTime.fromISO(startIso, { zone: PLANNING_TIMEZONE });
  const end = DateTime.fromISO(endIso, { zone: PLANNING_TIMEZONE });
  const segments = [];
  let cursor = start;

  while (cursor < end) {
    const nextMidnight = cursor.plus({ days: 1 }).startOf('day');
    const segmentEnd = end < nextMidnight ? end : nextMidnight;
    const endLabel = segmentEnd.equals(nextMidnight) ? '24:00' : segmentEnd.toFormat('HH:mm');
    segments.push({ date: formatDate(cursor), start_time: cursor.toFormat('HH:mm'), end_time: endLabel });
    cursor = segmentEnd;
  }

  return segments;
}

module.exports = {
  PLANNING_TIMEZONE,
  PLANNING_STATUS,
  AVAILABILITY_STATUS,
  EMPLOYEE_AVAILABILITY_STATUSES,
  nowInPlanningZone,
  getCurrentWeekStart,
  getNextWeekStart,
  getWeekEnd,
  isEmployeeWindowOpen,
  getEditingWindowBounds,
  formatDate,
  parsePlanningDate,
  isDateInWeek,
  canEmployeeEditWeek,
  computeEffectiveStatus,
  formatFrenchDayDate,
  getWeekDates,
  formatDbDate,
  splitRangeIntoDaySegments,
};
