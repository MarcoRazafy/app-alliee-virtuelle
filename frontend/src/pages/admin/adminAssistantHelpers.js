// Helpers purs de la page Assistant IA (extraits pour alléger AdminAssistant).

export function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function isImageType(type) {
  return typeof type === 'string' && type.startsWith('image/');
}

export function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

// Plage d'une semaine (lundi→dimanche) ; offsetWeeks=0 = semaine courante (bornée à aujourd'hui).
export function weekRange(offsetWeeks = 0) {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // 0 = lundi
  const monday = new Date(now);
  monday.setDate(now.getDate() - day - offsetWeeks * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: isoDate(monday), to: isoDate(offsetWeeks === 0 ? now : sunday) };
}
