// Aller-retour entre un instant et un champ <input type="datetime-local">.
//
// Un champ datetime-local ne connaît pas de fuseau : « 2026-09-17T10:54 » veut dire 10:54 À
// L'HEURE DU NAVIGATEUR. Envoyée telle quelle au serveur, cette valeur est relue à l'heure du
// SERVEUR — UTC sur Railway — et une saisie de 10:54 à Madagascar devenait 13:54. Le poste de
// développement, lui, est à l'heure de Madagascar : le décalage ne s'y voyait pas.
//
// Règle : on ne transmet jamais la valeur brute d'un champ datetime-local, toujours
// datetimeLocalToIso(valeur).

// Instant (ISO, Date…) → valeur à placer dans le champ, à l'heure du navigateur.
export function toDatetimeLocal(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Valeur du champ → instant absolu (ISO en UTC), sans ambiguïté pour le serveur.
// Une chaîne « AAAA-MM-JJTHH:MM » sans fuseau est lue par le navigateur à son heure locale.
export function datetimeLocalToIso(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
