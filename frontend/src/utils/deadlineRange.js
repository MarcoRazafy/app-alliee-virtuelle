// Filtre d'échéance par période : jour, semaine, mois, ou plage saisie à la main.
//
// Tout se compare en chaînes « YYYY-MM-DD » plutôt qu'en objets Date : une échéance arrive
// du serveur sous cette forme, et comparer des chaînes de date évite la conversion en UTC
// qui décale d'un jour dès que le fuseau du navigateur n'est pas UTC.

export function toYMD(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Bornes [from, to] d'une période, incluses. `null` = pas de contrainte de ce côté.
// `today` est injectable pour que les tests ne dépendent pas du jour où ils tournent.
export function periodBounds(period, today = new Date(), custom = {}) {
  if (period === 'day') {
    const d = toYMD(today);
    return { from: d, to: d };
  }

  if (period === 'week') {
    // Semaine du lundi au dimanche : getDay() rend 0 pour dimanche, d'où le décalage.
    const day = today.getDay();
    const shift = day === 0 ? 6 : day - 1;
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - shift);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    return { from: toYMD(monday), to: toYMD(sunday) };
  }

  if (period === 'month') {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    // Jour 0 du mois suivant = dernier jour du mois courant, sans avoir à connaître sa longueur.
    const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { from: toYMD(first), to: toYMD(last) };
  }

  if (period === 'custom') {
    // Bornes indépendantes : ne renseigner qu'une seule extrémité reste utile
    // (« tout ce qui est dû après le 1er »).
    return { from: custom.from || null, to: custom.to || null };
  }

  return { from: null, to: null };
}

export function matchesPeriod(deadline, period, today = new Date(), custom = {}) {
  if (!period) return true;
  const { from, to } = periodBounds(period, today, custom);
  if (!from && !to) return true;
  if (!deadline) return false;

  const value = String(deadline).slice(0, 10);
  if (from && value < from) return false;
  if (to && value > to) return false;
  return true;
}
