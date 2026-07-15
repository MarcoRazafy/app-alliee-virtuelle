// Constantes et formatteurs partagés entre la page employé (Planning.jsx) et la page
// admin (AdminPlanning.jsx), pour ne jamais dupliquer ces règles d'affichage.

export const WEEKDAY_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

export const EMPLOYEE_STATUS_OPTIONS = [
  { value: 'AVAILABLE', label: 'Disponible' },
  { value: 'PARTIALLY_AVAILABLE', label: 'Partiellement disponible' },
  { value: 'UNAVAILABLE', label: 'Indisponible' },
];

export const ADMIN_STATUS_OPTIONS = [
  ...EMPLOYEE_STATUS_OPTIONS,
  { value: 'LEAVE', label: 'Congé' },
  { value: 'SICK', label: 'Maladie' },
];

export const STATUS_LABELS = {
  AVAILABLE: 'Disponible',
  PARTIALLY_AVAILABLE: 'Partiellement disponible',
  UNAVAILABLE: 'Indisponible',
  LEAVE: 'Congé',
  SICK: 'Maladie',
};

export const STATUS_PILL_CLASS = {
  AVAILABLE: 'pill--planning-available',
  PARTIALLY_AVAILABLE: 'pill--planning-partial',
  UNAVAILABLE: 'pill--planning-unavailable',
  LEAVE: 'pill--planning-leave',
  SICK: 'pill--planning-sick',
};

export const EFFECTIVE_STATUS_LABELS = {
  DRAFT: 'Brouillon',
  SUBMITTED: 'Soumis',
  LOCKED: 'Verrouillé',
  ADMIN_MODIFIED: 'Modifié par un administrateur',
  NOT_SUBMITTED: 'Non soumis',
};

export const EFFECTIVE_STATUS_PILL_CLASS = {
  DRAFT: 'pill--todo',
  SUBMITTED: 'pill--done',
  LOCKED: 'pill--declared',
  ADMIN_MODIFIED: 'pill--progress',
  NOT_SUBMITTED: 'pill--planning-not-submitted',
};

export const HAS_SLOTS_STATUSES = ['AVAILABLE', 'PARTIALLY_AVAILABLE'];

export function formatDayLabel(dateString, index) {
  const date = new Date(dateString);
  const day = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  return `${WEEKDAY_LABELS[index]} ${day}`;
}

export function formatWeekRange(weekStart, weekEnd) {
  const start = new Date(weekStart).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  const end = new Date(weekEnd).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  return `${start} - ${end}`;
}

// Version compacte ("15 janv. - 21 janv.") pour les listes déroulantes de semaines.
export function formatWeekRangeShort(weekStart, weekEnd) {
  const start = new Date(weekStart).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const end = new Date(weekEnd).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return `${start} - ${end}`;
}

// Liste de semaines (lundi -> dimanche) pour peupler un filtre déroulant : futureCount
// semaines à venir puis pastCount semaines passées, la plus récente en premier.
export function generateWeekOptions({ pastCount = 12, futureCount = 1 } = {}) {
  const todayMonday = getMondayOf(toDateInputValue(new Date()));
  const options = [];

  for (let i = -futureCount; i <= pastCount; i += 1) {
    const monday = new Date(todayMonday);
    monday.setDate(monday.getDate() - i * 7);
    const weekStart = toDateInputValue(monday);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    const weekEnd = toDateInputValue(sunday);
    options.push({ value: weekStart, label: formatWeekRangeShort(weekStart, weekEnd) });
  }

  return options;
}

export function formatDateTime(isoString) {
  if (!isoString) return '';
  return new Date(isoString).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function toTimeInputValue(time) {
  return typeof time === 'string' ? time.slice(0, 5) : time;
}

export function timeToMinutes(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Ramène une date quelconque au lundi de sa semaine (utilisé par tous les filtres "semaine"
// côté employé et admin, pour ne jamais interroger le backend avec une date hors-lundi).
export function getMondayOf(dateString) {
  const date = new Date(dateString);
  const weekday = date.getDay(); // 0 = dimanche ... 6 = samedi (heure locale)
  const diff = weekday === 0 ? -6 : 1 - weekday;
  date.setDate(date.getDate() + diff);
  return toDateInputValue(date);
}

export function minutesToTime(totalMinutes) {
  const clamped = Math.max(0, Math.min(24 * 60, totalMinutes));
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// Deux plages d'une même journée ne peuvent pas se chevaucher (même règle que le backend,
// vérifiée aussi côté client pour un retour instantané pendant le glisser-déposer).
export function slotsOverlap(slots) {
  const sorted = [...slots].sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
  for (let i = 1; i < sorted.length; i += 1) {
    if (timeToMinutes(sorted[i].start_time) < timeToMinutes(sorted[i - 1].end_time)) return true;
  }
  return false;
}

export function computeTotalHours(days) {
  let minutes = 0;
  days.forEach((day) => {
    (day.time_slots || []).forEach((slot) => {
      if (slot.start_time && slot.end_time) {
        const diff = timeToMinutes(slot.end_time) - timeToMinutes(slot.start_time);
        if (diff > 0) minutes += diff;
      }
    });
  });
  return Math.round((minutes / 60) * 100) / 100;
}

export function toDraftDays(days) {
  return days.map((day) => ({
    date: day.date,
    availability_status: day.availability_status || null,
    note: day.note || '',
    time_slots: (day.time_slots || []).map((slot) => ({
      start_time: toTimeInputValue(slot.start_time),
      end_time: toTimeInputValue(slot.end_time),
    })),
  }));
}
