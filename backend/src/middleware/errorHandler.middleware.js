function errorHandler(err, req, res, next) {
  console.error(err);

  const status = err.status || 500;
  // err.status n'est posé que par nos propres erreurs volontaires (ex: chrono déjà actif) ;
  // une erreur sans status (driver DB, bug non prévu) ne doit jamais fuiter son message brut au client
  const message = err.status ? err.message : 'Erreur interne du serveur';

  res.status(status).json({ error: message });
}

module.exports = errorHandler;
