// Extension explicite : ce module est couvert par des tests exécutés directement par Node
// (node:test), qui ne résout pas les imports sans extension comme le fait Vite.
import { timeToMinutes } from './planningFormat.js';

// Plage horaire affichée par la grille de planning hebdomadaire. Dessiner les 24 heures
// gaspillait la moitié de la grille en lignes vides (la nuit) : on se borne aux créneaux
// réels, avec une marge d'une heure de chaque côté.
export const FALLBACK_START_HOUR = 7;
export const FALLBACK_END_HOUR = 20;
const RANGE_PADDING_HOURS = 1;

// Bornée par les créneaux déclarés ET les segments de présence réels (une connexion hors
// planning doit rester visible). En mode édition on garde au minimum 07:00–20:00
// dessinables, pour ne pas s'interdire de créer un créneau tôt le matin ou tard le soir.
export function computeHourRange(days = [], sessionSegmentsByDate, canEdit = false) {
  let min = Infinity;
  let max = -Infinity;
  const consider = (startTime, endTime) => {
    if (!startTime || !endTime) return;
    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
    min = Math.min(min, start);
    max = Math.max(max, end);
  };
  (days || []).forEach((day) => {
    (day.time_slots || []).forEach((slot) => consider(slot.start_time, slot.end_time));
    (sessionSegmentsByDate?.[day.date] || []).forEach((seg) => consider(seg.start_time, seg.end_time));
  });

  let startHour = FALLBACK_START_HOUR;
  let endHour = FALLBACK_END_HOUR;
  if (min !== Infinity) {
    startHour = Math.max(0, Math.floor(min / 60) - RANGE_PADDING_HOURS);
    endHour = Math.min(24, Math.ceil(max / 60) + RANGE_PADDING_HOURS);
  }
  if (canEdit) {
    startHour = Math.min(startHour, FALLBACK_START_HOUR);
    endHour = Math.max(endHour, FALLBACK_END_HOUR);
  }
  return { startHour, endHour: Math.max(endHour, startHour + 1) };
}
