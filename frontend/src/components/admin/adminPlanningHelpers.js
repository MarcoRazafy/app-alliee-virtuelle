import { toDateInputValue, HAS_SLOTS_STATUSES, timeToMinutes } from '../../utils/planningFormat';

// Helpers purs de la page/modale Planning admin (extraits pour alléger AdminPlanning).

export function todayDateInputValue() {
  return toDateInputValue(new Date());
}

// Décale une date (chaîne YYYY-MM-DD) de n jours et renvoie une chaîne YYYY-MM-DD.
export function shiftDays(dateString, days) {
  const date = new Date(dateString);
  date.setDate(date.getDate() + days);
  return toDateInputValue(date);
}

export function initials(name) {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

export function totalHoursOf(days) {
  let minutes = 0;
  days.forEach((day) => {
    if (HAS_SLOTS_STATUSES.includes(day.availability_status)) {
      day.time_slots.forEach((slot) => {
        minutes += timeToMinutes(slot.end_time) - timeToMinutes(slot.start_time);
      });
    }
  });
  return Math.round((minutes / 60) * 10) / 10;
}
