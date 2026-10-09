const fs = require('fs');

function sendFileOr404(res, filePath, notFoundMessage = 'Fichier introuvable') {
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
