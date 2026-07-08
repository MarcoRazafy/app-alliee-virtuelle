const resourceModel = require('../models/resource.model');

const FOLDER_TYPES = ['INTERNE', 'CLIENT'];

async function getFolders(req, res, next) {
  try {
    const { type } = req.query;
    if (!FOLDER_TYPES.includes(type)) {
      return res.status(400).json({ error: "Le paramètre type doit être INTERNE ou CLIENT" });
    }

    const folders = await resourceModel.findFolders(type);
    res.status(200).json(folders);
  } catch (err) {
    next(err);
  }
}

async function getFolderFiles(req, res, next) {
  try {
    const { id } = req.params;

    const folder = await resourceModel.findFolderById(id);
    if (!folder) {
      return res.status(404).json({ error: 'Dossier introuvable' });
    }

    const files = await resourceModel.findFilesByFolder(id);
    res.status(200).json(files);
  } catch (err) {
    next(err);
  }
}

module.exports = { getFolders, getFolderFiles };
