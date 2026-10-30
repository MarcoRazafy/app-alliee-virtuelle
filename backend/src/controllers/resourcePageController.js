const resourceModel = require('../models/resource.model');
const taskModel = require('../models/task.model');
const pageMedia = require('../services/pageMedia.service');
const { lireBlocs, filesUsedBy, isPageFileName, PageBlockError } = require('../utils/pageBlocks');
const { videoAccessError } = require('../utils/videoAccess');
const { rawPdfAccessError } = require('../utils/pdfAccess');
const { isUuid } = require('../utils/documentMedia');
const { sendFileOr404 } = require('../utils/sendFile');
const { canReadFolderType } = require('./resourceController');

const MAX_TITLE_CHARS = 255;

function readTitle(value) {
  const title = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (!title) throw new PageBlockError('Le titre de la page est requis.');
  if (title.length > MAX_TITLE_CHARS) throw new PageBlockError(`Le titre dépasse ${MAX_TITLE_CHARS} caractères.`);
  return title;
}

function sendPageError(res, next, err) {
  if (err instanceof PageBlockError || err instanceof pageMedia.PageMediaError) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  return next(err);
}

async function uploadPageMedia(req, res, next) {
  try {
    const result = await pageMedia.storeUpload(req.file, req.user.id);
    return res.status(201).json(result);
  } catch (err) {
    return sendPageError(res, next, err);
  }
}

async function createPage(req, res, next) {
  let created = null;
  let moves = [];
  try {
    const title = readTitle(req.body.file_name);
    const { id: folderId } = req.params;
    const folder = isUuid(folderId) ? await resourceModel.findFolderById(folderId) : null;
    if (!folder || folder.deleted_at) return res.status(404).json({ error: 'Dossier introuvable' });

    const { blocs, tokens } = lireBlocs(req.body.blocks);
    const uploads = await pageMedia.claimUploads(tokens, req.user.id);

    created = await resourceModel.createPage({ folderId, fileName: title, createdBy: req.user.id });
    const materialized = await pageMedia.materialize(blocs, { resourceId: created.id, uploads });
    moves = materialized.moves;
    const page = await resourceModel.updatePage(created.id, { blocks: materialized.blocs });
    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'CREATE_RESOURCE_PAGE',
      entityType: 'resources_file',
      entityId: created.id,
      details: { file_name: title, folder_id: folderId, blocks: page.blocks.length },
    });
    await pageMedia.forgetUploads(moves);
    return res.status(201).json(page);
  } catch (err) {
    if (created) {
      await pageMedia.undoMoves(moves);
      await resourceModel.hardDeletePage(created.id).catch(() => {});
      await pageMedia.removePageDir(created.id).catch(() => {});
    }
    return sendPageError(res, next, err);
  }
}

async function updatePage(req, res, next) {
  let moves = [];
  try {
    const { id } = req.params;
    const existing = isUuid(id) ? await resourceModel.findFileById(id) : null;
    if (!existing || existing.deleted_at || existing.folder_deleted_at || existing.kind !== 'PAGE') {
      return res.status(404).json({ error: 'Page introuvable' });
    }
    const title = readTitle(req.body.file_name);
    const existingFiles = await pageMedia.existingFiles(id);
    const { blocs, tokens } = lireBlocs(req.body.blocks, { existingFiles });
    const uploads = await pageMedia.claimUploads(tokens, req.user.id);

    const materialized = await pageMedia.materialize(blocs, { resourceId: id, uploads });
    moves = materialized.moves;
    const page = await resourceModel.updatePage(id, { fileName: title, blocks: materialized.blocs });
    if (!page) throw new PageBlockError('Page introuvable');
    const committed = moves;
    moves = [];
    await pageMedia.forgetUploads(committed);
    const removed = await pageMedia.removeUnusedFiles(id, page.blocks);
    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'UPDATE_RESOURCE_PAGE',
      entityType: 'resources_file',
      entityId: id,
      details: { file_name: title, blocks: page.blocks.length, removed_files: removed.length },
    });
    return res.status(200).json(page);
  } catch (err) {
    await pageMedia.undoMoves(moves);
    return sendPageError(res, next, err);
  }
}

async function servePageMedia(req, res, next) {
  try {
    const { id, name } = req.params;
    if (!isUuid(id) || !isPageFileName(name)) return res.status(404).json({ error: 'Média introuvable' });
    const file = await resourceModel.findFileById(id);
    if (
      !file ||
      file.deleted_at ||
      file.folder_deleted_at ||
      file.kind !== 'PAGE' ||
      !canReadFolderType(file.folder_type, req.user) ||
      !filesUsedBy(file.blocks).has(name)
    ) {
      return res.status(404).json({ error: 'Média introuvable' });
    }
    if (name.startsWith('video-')) {
      const refused = videoAccessError({ disposition: 'inline', fetchDest: req.get('Sec-Fetch-Dest') });
      if (refused) return res.status(403).json({ error: refused });
    }
    if (name.startsWith('document-')) {
      const refused = rawPdfAccessError(req.user.role);
      if (refused) return res.status(403).json({ error: refused });
    }
    res.setHeader('Cache-Control', 'private');
    res.setHeader('Content-Disposition', 'inline');
    return sendFileOr404(res, pageMedia.mediaPath(id, name), 'Média introuvable');
  } catch (err) {
    return next(err);
  }
}

module.exports = { uploadPageMedia, createPage, updatePage, servePageMedia };
