export function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function matchesTerms(haystack, query) {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const text = normalize(Array.isArray(haystack) ? haystack.filter(Boolean).join(' ') : haystack);
  return terms.every((term) => text.includes(term));
}
