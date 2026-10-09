export function mergeFilteredMove(full, filteredNew, matches) {
  const newIds = new Set(filteredNew.map((item) => item.id));
  const fullIds = new Set(full.map((item) => item.id));

  const kept = full.filter((item) => !matches(item) || newIds.has(item.id));
  const reordered = filteredNew.filter((item) => fullIds.has(item.id));

  let next = 0;
  const result = kept.map((item) => (matches(item) ? reordered[next++] || item : item));
  const arrivals = filteredNew.filter((item) => !fullIds.has(item.id));
  return [...result, ...arrivals];
}
