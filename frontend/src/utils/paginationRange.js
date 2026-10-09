export const GAP = '…';

export function paginationRange(page, totalPages, siblings = 1) {
  const total = Math.max(1, Math.floor(totalPages) || 1);
  const current = Math.min(Math.max(1, Math.floor(page) || 1), total);

  const maxSlots = 5 + siblings * 2;
  if (total <= maxSlots) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const left = Math.max(current - siblings, 1);
  const right = Math.min(current + siblings, total);

  const gapLeft = left > 2;
  const gapRight = right < total - 1;

  if (!gapLeft && gapRight) {
    const block = 3 + siblings * 2;
    return [...Array.from({ length: block }, (_, i) => i + 1), GAP, total];
  }

  if (gapLeft && !gapRight) {
    const block = 3 + siblings * 2;
    return [1, GAP, ...Array.from({ length: block }, (_, i) => total - block + 1 + i)];
  }

  return [1, GAP, ...Array.from({ length: right - left + 1 }, (_, i) => left + i), GAP, total];
}
