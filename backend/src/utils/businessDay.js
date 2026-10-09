const { DateTime } = require('luxon');
const env = require('../config/env');

const TIMEZONE = env.planningTimezone;
const CUTOFF_HOUR = env.businessDayCutoffHour;

if (!/^[A-Za-z][A-Za-z0-9_+/-]*$/.test(TIMEZONE)) {
  throw new Error(`PLANNING_TIMEZONE invalide : ${TIMEZONE}`);
}
if (!Number.isInteger(CUTOFF_HOUR) || CUTOFF_HOUR < 0 || CUTOFF_HOUR > 12) {
  throw new Error(`BUSINESS_DAY_CUTOFF_HOUR invalide : ${CUTOFF_HOUR}`);
}
if (!DateTime.now().setZone(TIMEZONE).isValid) {
  throw new Error(`PLANNING_TIMEZONE inconnu de luxon : ${TIMEZONE}`);
}

const DATE_FORMAT = 'yyyy-MM-dd';

function businessDayOf(value = new Date()) {
  const dt =
    value instanceof Date
      ? DateTime.fromJSDate(value, { zone: TIMEZONE })
      : DateTime.fromISO(String(value), { zone: TIMEZONE });
  if (!dt.isValid) return null;
  return dt.minus({ hours: CUTOFF_HOUR }).toFormat(DATE_FORMAT);
}

function businessDayNow() {
  return businessDayOf(new Date());
}

function businessDayShifted(days) {
  return DateTime.fromISO(businessDayNow(), { zone: TIMEZONE })
    .plus({ days })
    .toFormat(DATE_FORMAT);
}

function businessDayStart(dateString) {
  return DateTime.fromISO(dateString, { zone: TIMEZONE }).startOf('day').plus({ hours: CUTOFF_HOUR });
}

function sqlBusinessDay(column) {
  return `(((${column}) AT TIME ZONE '${TIMEZONE}') - interval '${CUTOFF_HOUR} hours')::date`;
}

function sqlBusinessDayNaive(column) {
  return `(((${column}) - interval '${CUTOFF_HOUR} hours')::date)`;
}

function sqlToday() {
  return sqlBusinessDay('now()');
}

function splitSecondsByBusinessDay(start, end) {
  const from = start instanceof Date ? DateTime.fromJSDate(start, { zone: TIMEZONE }) : DateTime.fromISO(String(start), { zone: TIMEZONE });
  const to = end instanceof Date ? DateTime.fromJSDate(end, { zone: TIMEZONE }) : DateTime.fromISO(String(end), { zone: TIMEZONE });
  const buckets = {};
  if (!from.isValid || !to.isValid || to <= from) return buckets;

  let cursor = from;
  let guard = 0;
  while (cursor < to && guard < 400) {
    const day = businessDayOf(cursor.toISO());
    const nextCutoff = businessDayStart(day).plus({ days: 1 });
    const segmentEnd = to < nextCutoff ? to : nextCutoff;
    const seconds = Math.max(0, Math.round(segmentEnd.diff(cursor, 'seconds').seconds));
    if (seconds > 0) buckets[day] = (buckets[day] || 0) + seconds;
    cursor = segmentEnd;
    guard += 1;
  }
  return buckets;
}

module.exports = {
  TIMEZONE,
  CUTOFF_HOUR,
  businessDayOf,
  businessDayNow,
  businessDayShifted,
  businessDayStart,
  splitSecondsByBusinessDay,
  sqlBusinessDay,
  sqlBusinessDayNaive,
  sqlToday,
};
