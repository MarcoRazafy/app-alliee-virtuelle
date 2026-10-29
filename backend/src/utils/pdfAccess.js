const PDF_CONSULT_ONLY = "Ce PDF se consulte dans l'application, sans téléchargement.";

function rawPdfAccessError(role) {
  return role === 'ADMIN' ? null : PDF_CONSULT_ONLY;
}

module.exports = { rawPdfAccessError, PDF_CONSULT_ONLY };
