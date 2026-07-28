// Définition unique du taux de complétion (DECISIONS.md : "complétée" = statut CONFIRMEE partout)
function computeCompletionRate(confirmed, assigned) {
  if (!assigned) return 0;
  return Math.round((confirmed / assigned) * 1000) / 10; // ex: 66.7
}

module.exports = { computeCompletionRate };
