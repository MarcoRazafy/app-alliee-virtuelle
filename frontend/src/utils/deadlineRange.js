export function toYMD(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function periodBounds(period, today = new Date(), custom = {}) {
  if (period === 'day') {
    const d = toYMD(today);
    return { from: d, to: d };
  }

  if (period === 'week') {
    const day = today.getDay();
    const shift = day === 0 ? 6 : day - 1;
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - shift);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    return { from: toYMD(monday), to: toYMD(sunday) };
  }

  if (period === 'month') {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { from: toYMD(first), to: toYMD(last) };
  }

  if (period === 'custom') {
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
