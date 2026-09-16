// Une vidéo des ressources se regarde DANS l'application, jamais en fichier téléchargé.
//
// Masquer le bouton « Télécharger » ne suffit pas : la route resterait ouverte à quiconque
// la connaît. Ce contrôle décide donc, côté serveur, quelles requêtes reçoivent la vidéo.
//
// Le navigateur signale d'où vient une requête avec l'en-tête Sec-Fetch-Dest : « video »
// pour la balise <video> du lecteur, « document » quand on colle l'adresse dans un onglet,
// « empty » pour un fetch lancé depuis la console. Seul le lecteur est servi.
//
// Limite assumée : c'est un frein, pas un verrou. Un outil qui forge ses en-têtes, ou une
// capture d'écran, contourne toujours ce genre de protection — aucun site n'y échappe.
// Un navigateur ancien qui n'envoie pas l'en-tête reste servi, pour ne pas lui refuser la
// lecture elle-même.

const DOWNLOAD_REFUSED = "Cette vidéo se regarde dans l'application : elle ne peut pas être téléchargée.";

// Rend null si la requête peut recevoir la vidéo, sinon le message de refus.
function videoAccessError({ disposition, fetchDest }) {
  if (disposition === 'attachment') return DOWNLOAD_REFUSED;
  if (fetchDest && fetchDest !== 'video') return DOWNLOAD_REFUSED;
  return null;
}

module.exports = { videoAccessError, DOWNLOAD_REFUSED };
