// Constantes et formatteurs partagés entre la page employé (Planning.jsx) et la page
// admin (AdminPlanning.jsx), pour ne jamais dupliquer ces règles d'affichage.

export const WEEKDAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const EMPLOYEE_STATUS_OPTIONS = [
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'PARTIALLY_AVAILABLE', label: 'Partially available' },
  { value: 'UNAVAILABLE', label: 'Unavailable' },
];

export const ADMIN_STATUS_OPTIONS = [
  ...EMPLOYEE_STATUS_OPTIONS,
  { value: 'LEAVE', label: 'Leave' },
  { value: 'SICK', label: 'Sick' },
];

export const STATUS_LABELS = {
  AVAILABLE: 'Available',
  PARTIALLY_AVAILABLE: 'Partially available',
  UNAVAILABLE: 'Unavailable',
  LEAVE: 'Leave',
  SICK: 'Sick',
};

export const STATUS_PILL_CLASS = {
  AVAILABLE: 'pill--planning-available',
  PARTIALLY_AVAILABLE: 'pill--planning-partial',
  UNAVAILABLE: 'pill--planning-unavailable',
  LEAVE: 'pill--planning-leave',
  SICK: 'pill--planning-sick',
};

export const EFFECTIVE_STATUS_LABELS = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  LOCKED: 'Locked',
  ADMIN_MODIFIED: 'Modified by an administrator',
  NOT_SUBMITTED: 'Not submitted',
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
  const day = date.toLocaleDateString('en-US', { day: 'numeric', month: 'long' });
  return `${WEEKDAY_LABELS[index]} ${day}`;
}

export function formatWeekRange(weekStart, weekEnd) {
  const start = new Date(weekStart).toLocaleDateString('en-US', { day: 'numeric', month: 'long' });
  const end = new Date(weekEnd).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  return `${start} - ${end}`;
}

// Version compacte ("15 janv. - 21 janv.") pour les listes déroulantes de semaines.
export function formatWeekRangeShort(weekStart, weekEnd) {
  const start = new Date(weekStart).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  const end = new Date(weekEnd).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
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
  return new Date(isoString).toLocaleString('en-US', {
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

// Parse un horaire souple saisi à la main : "8", "8h", "8h30", "08:00", "8:30" → minutes.
function parseTimeToken(raw) {
  const token = raw.trim().toLowerCase().replace(/\s+/g, '');
  let match = token.match(/^(\d{1,2})[:.](\d{2})$/); // 08:00 / 8.30
  if (!match) match = token.match(/^(\d{1,2})h(\d{2})?$/); // 8h / 08h30
  if (!match) match = token.match(/^(\d{1,2})$/); // 8
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  if (hours > 24 || minutes > 59) return null;
  const total = hours * 60 + minutes;
  return total > 24 * 60 ? null : total;
}

// Convertit une saisie type "08h - 12h | 13h - 18h" en plages { start_time, end_time }.
// Séparateurs de plages : | , ; retour à la ligne. Séparateur début/fin : - – — ou "à"/"to".
// Renvoie { ok: true, slots } ou { ok: false, error } (message lisible pour l'utilisateur).
export function parseTimeRanges(input) {
  const text = (input || '').trim();
  if (!text) return { ok: true, slots: [] };
  const parts = text.split(/[|,;\n]+/).map((p) => p.trim()).filter(Boolean);
  const slots = [];
  for (const part of parts) {
    const bounds = part.split(/\s*[-–—]\s*|\s+(?:à|to)\s+/i);
    if (bounds.length !== 2) return { ok: false, error: `Invalid range: "${part}"` };
    const start = parseTimeToken(bounds[0]);
    const end = parseTimeToken(bounds[1]);
    if (start == null || end == null) return { ok: false, error: `Invalid time in: "${part}"` };
    if (end <= start) return { ok: false, error: `End must be after start: "${part}"` };
    slots.push({ start_time: minutesToTime(start), end_time: minutesToTime(end) });
  }
  if (slotsOverlap(slots)) return { ok: false, error: 'Ranges overlap.' };
  return { ok: true, slots };
}

// Reconstruit la chaîne "08:00 - 12:00 | 13:00 - 18:00" à partir des plages (pré-remplissage
// du champ texte). Trie par heure de début pour un affichage stable.
export function formatSlotsAsRanges(slots) {
  return [...(slots || [])]
    .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time))
    .map((s) => `${toTimeInputValue(s.start_time)} - ${toTimeInputValue(s.end_time)}`)
    .join(' | ');
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
