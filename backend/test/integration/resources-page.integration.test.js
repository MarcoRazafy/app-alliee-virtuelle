require('./setupTestDb');
const fs = require('fs');
const os = require('os');
const path = require('path');

const uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'resources-page-'));
process.env.RESOURCE_UPLOAD_DIR = uploadRoot;

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const request = require('supertest');
const { createCanvas } = require('@napi-rs/canvas');
const app = require('../../src/app');
const db = require('../../src/config/database');
const pdfRender = require('../../src/services/pdfRender.service');
const { imageSize } = require('../../src/utils/imageInfo');
const { seedAll, PASSWORD, ADMIN, EMPLOYEE } = require('./seed');
const { makePdf } = require('../helpers/makePdf');

const PAGES_DIR = path.join(uploadRoot, 'pages');
const OTHER_ADMIN = { email: 'itest.admin2@alliee.test', username: 'itest_admin2' };

let adminToken;
let otherAdminToken;
let employeeToken;
let interneFolderId;
let adminFolderId;
let pageId;
let photoName;
let videoName;

const as = (token) => ({ Authorization: `Bearer ${token}` });

async function login(identifier) {
  const res = await request(app).post('/api/auth/login').send({ identifier, password: PASSWORD });
  return res.body.token;
}

async function pngBuffer(width, height) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.fillStyle = '#256bff';
  context.fillRect(0, 0, width, height);
  return canvas.encode('png');
}

const mp4Buffer = () => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(200, 1)]);

function uploadAs(token, buffer, filename, contentType) {
  return request(app).post('/api/resources/page-uploads').set(as(token)).attach('file', buffer, { filename, contentType });
}

const filesOf = (id) => (fs.existsSync(path.join(PAGES_DIR, id)) ? fs.readdirSync(path.join(PAGES_DIR, id)).sort() : []);

before(async () => {
  const { adminId } = await seedAll();
  await db.query(
    `INSERT INTO users (email, password_hash, full_name, first_name, last_name, username, role, status)
     VALUES ($1, $2, 'Admin Deux', 'Admin', 'Deux', $3, 'ADMIN', 'ACTIF')`,
    [OTHER_ADMIN.email, bcrypt.hashSync(PASSWORD, 10), OTHER_ADMIN.username]
  );
  await db.query('TRUNCATE resources_folders CASCADE');
  const folder = (type) =>
    db.query('INSERT INTO resources_folders (name, type, created_by) VALUES ($1, $2, $3) RETURNING id', [
      `Dossier ${type}`,
      type,
      adminId,
    ]);
  interneFolderId = (await folder('INTERNE')).rows[0].id;
  adminFolderId = (await folder('ADMIN')).rows[0].id;
  adminToken = await login(ADMIN.email);
  otherAdminToken = await login(OTHER_ADMIN.email);
  employeeToken = await login(EMPLOYEE.email);
});

after(async () => {
  await pdfRender.shutdown();
  await db.pool.end();
  fs.rmSync(uploadRoot, { recursive: true, force: true });
});

test('envoi : réservé à l’équipe, formats contrôlés', async () => {
  const png = await pngBuffer(40, 20);
  assert.equal((await uploadAs(employeeToken, png, 'p.png', 'image/png')).status, 403);
  assert.equal((await request(app).post('/api/resources/page-uploads').attach('file', png, 'p.png')).status, 401);
  assert.equal((await uploadAs(adminToken, Buffer.from('bonjour'), 'n.txt', 'text/plain')).status, 400);
  assert.equal((await uploadAs(adminToken, Buffer.from('pas une image'), 'x.png', 'image/png')).status, 400);
  assert.equal((await uploadAs(adminToken, Buffer.from('pas une vidéo du tout'), 'v.mp4', 'video/mp4')).status, 400);
});

test('création : photo convertie en webp ≤ 1600 px, vidéo et lien rattachés à la page', async () => {
  const photo = await uploadAs(adminToken, await pngBuffer(2000, 1000), 'grande.png', 'image/png');
  assert.equal(photo.status, 201);
  assert.match(photo.body.jeton, /^televersement:[0-9a-f-]{36}$/);
  const video = await uploadAs(adminToken, mp4Buffer(), 'clip.mp4', 'video/mp4');
  assert.equal(video.status, 201);

  const blocks = [
    { type: 'titre', texte: 'Guide d’accueil', niveau: 2 },
    { type: 'texte', lignes: [{ genre: 'p', passages: [{ t: 'Bienvenue', g: true }, { t: ' à tous' }] }] },
    { type: 'photo', fichier: photo.body.jeton, legende: 'Le bureau' },
    { type: 'video', source: 'fichier', fichier: video.body.jeton },
    { type: 'video', source: 'lien', url: 'https://youtu.be/dQw4w9WgXcQ' },
  ];
  const res = await request(app)
    .post(`/api/resources/folders/${interneFolderId}/pages`)
    .set(as(adminToken))
    .send({ file_name: 'Guide', blocks: JSON.stringify(blocks) });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  pageId = res.body.id;
  photoName = res.body.blocks[2].fichier;
  videoName = res.body.blocks[3].fichier;
  assert.match(photoName, /^photo-[0-9a-f]{16}\.webp$/);
  assert.match(videoName, /^video-[0-9a-f]{16}\.mp4$/);
  assert.equal(res.body.blocks[4].url, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assert.deepEqual(filesOf(pageId), [photoName, videoName].sort());

  const stored = fs.readFileSync(path.join(PAGES_DIR, pageId, photoName));
  assert.deepEqual(imageSize(stored), { format: 'webp', width: 1600, height: 800 });

  const reused = await request(app)
    .post(`/api/resources/folders/${interneFolderId}/pages`)
    .set(as(adminToken))
    .send({ file_name: 'Copie', blocks: JSON.stringify([{ type: 'photo', fichier: photo.body.jeton }]) });
  assert.equal(reused.status, 400, 'un jeton déjà utilisé ne sert pas deux fois');
});

test('sécurité : jeton d’un autre membre de l’équipe et fichier forgé refusés', async () => {
  const foreign = await uploadAs(otherAdminToken, await pngBuffer(10, 10), 'a.png', 'image/png');
  const stolen = await request(app)
    .put(`/api/resources/pages/${pageId}`)
    .set(as(adminToken))
    .send({ file_name: 'Guide', blocks: JSON.stringify([{ type: 'photo', fichier: foreign.body.jeton }]) });
  assert.equal(stolen.status, 400);

  for (const fichier of ['../../../../etc/passwd', 'photo-ffffffffffffffff.webp', videoName]) {
    const forged = await request(app)
      .put(`/api/resources/pages/${pageId}`)
      .set(as(adminToken))
      .send({ file_name: 'Guide', blocks: JSON.stringify([{ type: 'photo', fichier }]) });
    assert.equal(forged.status, 400, fichier);
  }
  assert.deepEqual(filesOf(pageId), [photoName, videoName].sort(), 'les refus ne touchent pas aux fichiers');

  const byEmployee = await request(app)
    .put(`/api/resources/pages/${pageId}`)
    .set(as(employeeToken))
    .send({ file_name: 'Pirate', blocks: '[]' });
  assert.equal(byEmployee.status, 403);
});

test('création ratée : tout est annulé, le jeton reste utilisable', async () => {
  const photo = await uploadAs(adminToken, await pngBuffer(10, 10), 'p.png', 'image/png');
  const res = await request(app)
    .post(`/api/resources/folders/${interneFolderId}/pages`)
    .set(as(adminToken))
    .send({ file_name: 'Page ratée', blocks: JSON.stringify([{ type: 'video', source: 'fichier', fichier: photo.body.jeton }]) });
  assert.equal(res.status, 400);
  const { rows } = await db.query("SELECT id FROM resources_files WHERE file_name = 'Page ratée'");
  assert.equal(rows.length, 0);

  const retry = await request(app)
    .post(`/api/resources/folders/${interneFolderId}/pages`)
    .set(as(adminToken))
    .send({ file_name: 'Page réussie', blocks: JSON.stringify([{ type: 'photo', fichier: photo.body.jeton }]) });
  assert.equal(retry.status, 201);
});

test('lecture membre : contenu, photo, vidéo en continu, rien d’autre', async () => {
  const page = await request(app).get(`/api/resources/files/${pageId}`).set(as(employeeToken));
  assert.equal(page.status, 200);
  assert.equal(page.body.kind, 'PAGE');
  assert.equal(page.body.blocks.length, 5);

  const media = (name, headers = {}) =>
    request(app).get(`/api/resources/files/${pageId}/page-media/${name}`).set({ ...as(employeeToken), ...headers });
  const photo = await media(photoName);
  assert.equal(photo.status, 200);
  assert.equal(photo.headers['content-type'], 'image/webp');

  const video = await media(videoName, { 'Sec-Fetch-Dest': 'video', Range: 'bytes=0-9' });
  assert.equal(video.status, 206);
  assert.equal(video.headers['content-range'], `bytes 0-9/${mp4Buffer().length}`);
  assert.equal((await media(videoName, { 'Sec-Fetch-Dest': 'document' })).status, 403);

  assert.equal((await media('photo-ffffffffffffffff.webp')).status, 404);
  assert.equal((await media('..%2F..%2F..%2Fetc%2Fpasswd')).status, 404);
  assert.equal((await request(app).get(`/api/resources/files/${pageId}/page-media/${photoName}`)).status, 401);
});

test('modification : retirer une photo supprime son fichier', async () => {
  const res = await request(app)
    .put(`/api/resources/pages/${pageId}`)
    .set(as(adminToken))
    .send({
      file_name: 'Guide mis à jour',
      blocks: JSON.stringify([
        { type: 'titre', texte: 'Guide d’accueil', niveau: 3, alignement: 'centre', couleur: '#22c55e' },
        { type: 'video', source: 'fichier', fichier: videoName },
      ]),
    });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.file_name, 'Guide mis à jour');
  assert.deepEqual(filesOf(pageId), [videoName]);
  const gone = await request(app).get(`/api/resources/files/${pageId}/page-media/${photoName}`).set(as(employeeToken));
  assert.equal(gone.status, 404);
});

test('dossier réservé à l’admin : la page et ses médias restent invisibles pour un membre', async () => {
  const photo = await uploadAs(adminToken, await pngBuffer(10, 10), 'p.png', 'image/png');
  const res = await request(app)
    .post(`/api/resources/folders/${adminFolderId}/pages`)
    .set(as(adminToken))
    .send({ file_name: 'Interne admin', blocks: JSON.stringify([{ type: 'photo', fichier: photo.body.jeton }]) });
  assert.equal(res.status, 201);
  const name = res.body.blocks[0].fichier;
  assert.equal((await request(app).get(`/api/resources/files/${res.body.id}`).set(as(employeeToken))).status, 404);
  assert.equal(
    (await request(app).get(`/api/resources/files/${res.body.id}/page-media/${name}`).set(as(employeeToken))).status,
    404
  );
  assert.equal(
    (await request(app).get(`/api/resources/files/${res.body.id}/page-media/${name}`).set(as(adminToken))).status,
    200
  );
});

test('document PDF : pages en images pour un membre, PDF d’origine réservé à l’admin', async () => {
  const pdf = makePdf([
    { width: 595, height: 842, text: 'Page un' },
    { width: 842, height: 595, text: 'Page deux' },
  ]);
  assert.equal((await uploadAs(adminToken, Buffer.from('%PDF-1.4 abîmé'), 'r.pdf', 'application/pdf')).status, 400);
  assert.equal((await uploadAs(adminToken, Buffer.from('bonjour'), 'r.pdf', 'application/pdf')).status, 400);
  const upload = await uploadAs(adminToken, pdf, 'reglement.pdf', 'application/pdf');
  assert.equal(upload.status, 201, JSON.stringify(upload.body));
  assert.equal(upload.body.genre, 'document');

  const asPhoto = await request(app)
    .put(`/api/resources/pages/${pageId}`)
    .set(as(adminToken))
    .send({ file_name: 'Guide', blocks: JSON.stringify([{ type: 'photo', fichier: upload.body.jeton }]) });
  assert.equal(asPhoto.status, 400, 'un PDF ne passe pas pour une photo');

  const res = await request(app)
    .put(`/api/resources/pages/${pageId}`)
    .set(as(adminToken))
    .send({
      file_name: 'Guide',
      blocks: JSON.stringify([
        { type: 'video', source: 'fichier', fichier: videoName },
        { type: 'document', fichier: upload.body.jeton, nom: 'Règlement intérieur' },
      ]),
    });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const documentName = res.body.blocks[1].fichier;
  assert.match(documentName, /^document-[0-9a-f]{16}\.pdf$/);
  assert.equal(res.body.blocks[1].nom, 'Règlement intérieur');
  assert.deepEqual(filesOf(pageId), [documentName, videoName].sort());

  const base = `/api/resources/files/${pageId}/page-media/${documentName}`;
  const info = await request(app).get(`${base}/pages`).set(as(employeeToken));
  assert.equal(info.status, 200);
  assert.equal(info.body.pages.length, 2);
  const image = await request(app).get(`${base}/pages/2`).set(as(employeeToken));
  assert.equal(image.status, 200);
  assert.equal(image.headers['content-type'], 'image/webp');
  assert.equal(image.headers['cache-control'], 'private, no-store');
  assert.equal((await request(app).get(`${base}/pages/3`).set(as(employeeToken))).status, 404);

  assert.equal((await request(app).get(base).set(as(employeeToken))).status, 403);
  const original = await request(app).get(base).set(as(adminToken));
  assert.equal(original.status, 200);
  assert.equal(original.headers['content-type'], 'application/pdf');
  assert.equal((await request(app).get(`${base}/pages`)).status, 401);

  const forged = `/api/resources/files/${pageId}/page-media/document-ffffffffffffffff.pdf/pages`;
  assert.equal((await request(app).get(forged).set(as(adminToken))).status, 404);
  assert.equal((await request(app).get(`/api/resources/files/${pageId}/page-media/${videoName}/pages`).set(as(adminToken))).status, 404);
});

test('suppression définitive : le dossier de fichiers de la page disparaît', async () => {
  assert.equal((await request(app).delete(`/api/resources/files/${pageId}`).set(as(adminToken))).status, 200);
  assert.equal((await request(app).delete(`/api/resources/trash/files/${pageId}`).set(as(adminToken))).status, 200);
  assert.equal(fs.existsSync(path.join(PAGES_DIR, pageId)), false);
});
