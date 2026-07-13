const express = require('express');
const hierarchyController = require('../controllers/hierarchyController');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authMiddleware);

const requireAdmin = authMiddleware.requireRole('ADMIN');

// Route statique déclarée avant /spaces/:id (aucune route :id ici pour l'instant, mais on garde l'habitude)
router.get('/spaces/tree', hierarchyController.getSpacesTree);

router.get('/spaces', hierarchyController.listSpaces);
router.post('/spaces', requireAdmin, hierarchyController.createSpace);
router.put('/spaces/:id', requireAdmin, hierarchyController.updateSpace);
router.delete('/spaces/:id', requireAdmin, hierarchyController.deleteSpace);

router.get('/folders', hierarchyController.listFolders);
router.post('/folders', requireAdmin, hierarchyController.createFolder);
router.put('/folders/:id', requireAdmin, hierarchyController.updateFolder);
router.delete('/folders/:id', requireAdmin, hierarchyController.deleteFolder);

router.get('/lists', hierarchyController.listLists);
router.post('/lists', requireAdmin, hierarchyController.createList);
router.put('/lists/:id', requireAdmin, hierarchyController.updateList);
router.delete('/lists/:id', requireAdmin, hierarchyController.deleteList);

module.exports = router;
