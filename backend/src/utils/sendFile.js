const fs = require('fs');

// Envoie un fichier au client. Si le fichier est absent du disque (volume non monté, fichier
// perdu lors d'un redéploiement, référence orpheline en base…), renvoie un 404 PROPRE au lieu
// de laisser fuiter une erreur ENOENT brute. Le front peut alors retomber proprement sur un
// fallback (ex. initiales à la place d'un avatar) sans afficher d'erreur au visiteur.
function sendFileOr404(res, filePath, notFoundMessage = 'File not found') {
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: notFoundMessage });
  }
  return res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ error: notFoundMessage });
    }
  });
}

module.exports = { sendFileOr404 };
