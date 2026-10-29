require('./setupTestDb');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/config/database');
const pdfRender = require('../../src/services/pdfRender.service');
const { makePdf } = require('../helpers/makePdf');
const { seedAll, PASSWORD, ADMIN, EMPLOYEE } = require('./seed');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resources-pdf-'));
const pdfPath = path.join(dir, 'guide.pdf');
fs.writeFileSync(
  pdfPath,
  makePdf([
    { width: 300, height: 400, text: 'Guide interne' },
    { width: 300, height: 400, text: 'Suite' },
  ])
);

let adminToken;
let employeeToken;
let pdfId;
let adminOnlyPdfId;
let mediaId;

const as = (token) => ({ Authorization: `Bearer ${token}` });

async function login(identifier) {
  const res = await request(app).post('/api/auth/login').send({ identifier, password: PASSWORD });
  return res.body.token;
}

async function insertPdf(folderType, adminId) {
  const folder = await db.query(
    'INSERT INTO resources_folders (name, type, created_by) VALUES ($1, $2, $3) RETURNING id',
    [`Dossier ${folderType}`, folderType, adminId]
  );
  const file = await db.query(
    `INSERT INTO resources_files (folder_id, file_name, file_path, file_type, file_size, created_by, kind, mime_type)
     VALUES ($1, 'guide.pdf', $2, 'PDF', $3, $4, 'FILE', 'application/pdf') RETURNING id`,
    [folder.rows[0].id, pdfPath, fs.statSync(pdfPath).size, adminId]
  );
  return { folderId: folder.rows[0].id, fileId: file.rows[0].id };
}

before(async () => {
  const { adminId } = await seedAll();
  await db.query('TRUNCATE resources_folders CASCADE');
  const interne = await insertPdf('INTERNE', adminId);
  pdfId = interne.fileId;
  adminOnlyPdfId = (await insertPdf('ADMIN', adminId)).fileId;
  const media = await db.query(
    `INSERT INTO resources_document_media (folder_id, file_name, file_path, mime_type, file_size, created_by)
     VALUES ($1, 'annexe.pdf', $2, 'application/pdf', $3, $4) RETURNING id`,
    [interne.folderId, pdfPath, fs.statSync(pdfPath).size, adminId]
  );
  mediaId = media.rows[0].id;
  adminToken = await login(ADMIN.email);
  employeeToken = await login(EMPLOYEE.email);
});

after(async () => {
  await pdfRender.shutdown();
  await db.pool.end();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('employé : le PDF d’origine est refusé, quels que soient les en-têtes envoyés', async () => {
  for (const headers of [{}, { 'Sec-Fetch-Dest': 'empty' }, { 'Sec-Fetch-Dest': 'document' }]) {
    const preview = await request(app).get(`/api/resources/files/${pdfId}/preview`).set({ ...as(employeeToken), ...headers });
    assert.equal(preview.status, 403, JSON.stringify(headers));
  }
  assert.equal((await request(app).get(`/api/resources/files/${pdfId}/download`).set(as(employeeToken))).status, 403);
  assert.equal((await request(app).get(`/api/resources/media/${mediaId}`).set(as(employeeToken))).status, 403);
});

test('employé : les pages arrivent en images, jamais en PDF', async () => {
  const info = await request(app).get(`/api/resources/files/${pdfId}/pages`).set(as(employeeToken));
  assert.equal(info.status, 200);
  assert.deepEqual(info.body.pages, [
    { width: 300, height: 400 },
    { width: 300, height: 400 },
  ]);

  const page = await request(app).get(`/api/resources/files/${pdfId}/pages/2`).set(as(employeeToken));
  assert.equal(page.status, 200);
  assert.equal(page.headers['content-type'], 'image/webp');
  assert.match(page.headers['cache-control'], /no-store/);
  assert.equal(page.body.subarray(8, 12).toString('latin1'), 'WEBP');
  assert.notEqual(page.body.subarray(0, 4).toString('latin1'), '%PDF');

  const media = await request(app).get(`/api/resources/media/${mediaId}/pages/1`).set(as(employeeToken));
  assert.equal(media.status, 200);
  assert.equal(media.headers['content-type'], 'image/webp');
});

test('les numéros de page et identifiants invalides sont rejetés proprement', async () => {
  const base = `/api/resources/files/${pdfId}/pages`;
  assert.equal((await request(app).get(`${base}/3`).set(as(employeeToken))).status, 404);
  assert.equal((await request(app).get(`${base}/0`).set(as(employeeToken))).status, 400);
  assert.equal((await request(app).get(`${base}/abc`).set(as(employeeToken))).status, 400);
  assert.equal((await request(app).get(`${base}/1e3`).set(as(employeeToken))).status, 400);
  assert.equal((await request(app).get('/api/resources/files/pas-un-uuid/pages').set(as(employeeToken))).status, 404);
});

test('employé : un PDF du dossier réservé à l’admin reste invisible', async () => {
  assert.equal((await request(app).get(`/api/resources/files/${adminOnlyPdfId}/pages`).set(as(employeeToken))).status, 404);
  assert.equal((await request(app).get(`/api/resources/files/${adminOnlyPdfId}/pages/1`).set(as(employeeToken))).status, 404);
});

test('sans jeton : aucune page', async () => {
  assert.equal((await request(app).get(`/api/resources/files/${pdfId}/pages/1`)).status, 401);
});

test('admin : garde le PDF d’origine et le téléchargement', async () => {
  const preview = await request(app).get(`/api/resources/files/${pdfId}/preview`).set(as(adminToken));
  assert.equal(preview.status, 200);
  assert.match(preview.headers['content-type'], /application\/pdf/);
  assert.equal((await request(app).get(`/api/resources/files/${pdfId}/download`).set(as(adminToken))).status, 200);
});
