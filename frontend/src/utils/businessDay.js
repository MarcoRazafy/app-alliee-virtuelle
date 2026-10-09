export const DAY_CUTOFF_HOUR = 2;

const MS_PER_HOUR = 3600 * 1000;

export function businessDayOf(date = new Date()) {
  const shifted = new Date(date.getTime() - DAY_CUTOFF_HOUR * MS_PER_HOUR);
  if (Number.isNaN(shifted.getTime())) return null;
  const year = shifted.getFullYear();
  const month = String(shifted.getMonth() + 1).padStart(2, '0');
  const day = String(shifted.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function businessDayNow() {
  return businessDayOf(new Date());
}

export function businessDayShifted(days) {
  const base = new Date();
  base.setDate(base.getDate() + days);
  return businessDayOf(base);
}
