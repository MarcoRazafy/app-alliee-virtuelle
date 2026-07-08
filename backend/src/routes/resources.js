const express = require('express');
const resourceController = require('../controllers/resourceController');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/resources/folders', resourceController.getFolders);
router.get('/resources/folders/:id/files', resourceController.getFolderFiles);

module.exports = router;
