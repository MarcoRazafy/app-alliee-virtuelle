const DOWNLOAD_REFUSED = "Cette vidéo se regarde dans l'application : elle ne peut pas être téléchargée.";

function videoAccessError({ disposition, fetchDest }) {
  if (disposition === 'attachment') return DOWNLOAD_REFUSED;
  if (fetchDest && fetchDest !== 'video') return DOWNLOAD_REFUSED;
  return null;
}

module.exports = { videoAccessError, DOWNLOAD_REFUSED };
