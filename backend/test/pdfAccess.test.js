const test = require('node:test');
const assert = require('node:assert/strict');
const { rawPdfAccessError, PDF_CONSULT_ONLY } = require('../src/utils/pdfAccess');

test('un employé ne reçoit jamais le PDF d’origine d’une ressource', () => {
  assert.equal(rawPdfAccessError('EMPLOYEE'), PDF_CONSULT_ONLY);
});

test('un rôle absent ou inconnu est traité comme un employé', () => {
  assert.equal(rawPdfAccessError(undefined), PDF_CONSULT_ONLY);
  assert.equal(rawPdfAccessError('admin'), PDF_CONSULT_ONLY);
});

test('l’admin garde le PDF d’origine', () => {
  assert.equal(rawPdfAccessError('ADMIN'), null);
});
