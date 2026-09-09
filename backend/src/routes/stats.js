const express = require('express');
const statsController = require('../controllers/statsController');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/stats/me', statsController.getMyStats);
router.get('/stats/team', authMiddleware.requireRole('ADMIN'), statsController.getTeamStats);
// Feuille de temps hebdomadaire et relevé individuel, ouverts à toute personne connectée
// mais RESTREINTS PAR RÔLE dans le contrôleur : un admin voit toute l'équipe, un employé
// uniquement lui-même — la requête elle-même est filtrée, rien de superflu n'est envoyé.
// Corriger ou supprimer un temps reste réservé aux admins (/timelog/entry/*, /sessions/admin/*).
router.get('/stats/weekly-connections', statsController.getWeeklyConnections);
router.get('/stats/weekly-timelog', statsController.getWeeklyTimelog);

module.exports = router;
