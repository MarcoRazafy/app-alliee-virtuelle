function computeCompletionRate(confirmed, assigned) {
  if (!assigned) return 0;
  return Math.round((confirmed / assigned) * 1000) / 10;
}

module.exports = { computeCompletionRate };
