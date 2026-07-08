const express = require('express');
const userController = require('../controllers/userController');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/users', userController.listUsers);

module.exports = router;
