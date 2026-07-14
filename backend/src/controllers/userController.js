const db = require('../config/database');
const userModel = require('../models/user.model');
const taskModel = require('../models/task.model');
const avatarModel = require('../models/avatar.model');

// Annuaire minimal, ouvert à tout utilisateur connecté (nécessaire pour démarrer une conversation)
async function listDirectory(req, res, next) {
  try {
    const users = await userModel.findActiveExcept(req.user.id);
    res.status(200).json(users);
  } catch (err) {
    next(err);
  }
}


async function getUserAvatar(req, res, next) {
  try {
    const { id } = req.params;
    const user = await userModel.findById(id);

    // L'annuaire de messagerie n'expose que les membres actifs de l'équipe.
    if (!user || user.status !== userModel.USER_STATUS.ACTIVE) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    const avatar = await avatarModel.findByUserId(id);
    if (!avatar) {
      return res.status(404).json({ error: 'Aucune photo de profil' });
    }

    res.sendFile(avatar.file_path);
  } catch (err) {
    next(err);
  }
}

async function listUsers(req, res, next) {
  try {
    const { status, role, search } = req.query;
    const users = await userModel.findAllFiltered({ status, role, search });
    res.status(200).json(users);
  } catch (err) {
    next(err);
  }
}

async function listPending(req, res, next) {
  try {
    const users = await userModel.findPending();
    res.status(200).json(users);
  } catch (err) {
    next(err);
  }
}

async function approveUser(req, res, next) {
  try {
    const { id } = req.params;
    const user = await userModel.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }
    if (user.status !== userModel.USER_STATUS.PENDING) {
      return res.status(400).json({ error: 'Seul un compte en attente peut être approuvé' });
    }

    await db.withTransaction(async (client) => {
      await userModel.updateStatus(id, userModel.USER_STATUS.ACTIVE, client);
      await taskModel.recordAudit(
        { userId: req.user.id, action: 'APPROVE_USER', entityType: 'user', entityId: id },
        client
      );
    });

    res.status(200).json({ status: userModel.USER_STATUS.ACTIVE });
  } catch (err) {
    next(err);
  }
}

async function rejectUser(req, res, next) {
  try {
    const { id } = req.params;
    const { motif } = req.body;

    const user = await userModel.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }
    if (user.status !== userModel.USER_STATUS.PENDING) {
      return res.status(400).json({ error: 'Seul un compte en attente peut être refusé' });
    }

    await db.withTransaction(async (client) => {
      await userModel.updateStatus(id, userModel.USER_STATUS.REJECTED, client);
      await taskModel.recordAudit(
        {
          userId: req.user.id,
          action: 'REJECT_USER',
          entityType: 'user',
          entityId: id,
          details: motif ? { motif } : null,
        },
        client
      );
    });

    res.status(200).json({ status: userModel.USER_STATUS.REJECTED });
  } catch (err) {
    next(err);
  }
}

async function suspendUser(req, res, next) {
  try {
    const { id } = req.params;

    if (id === req.user.id) {
      return res.status(400).json({ error: 'Vous ne pouvez pas suspendre votre propre compte' });
    }

    const user = await userModel.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }
    if (user.status !== userModel.USER_STATUS.ACTIVE) {
      return res.status(400).json({ error: 'Seul un compte actif peut être suspendu' });
    }

    await db.withTransaction(async (client) => {
      await userModel.updateStatus(id, userModel.USER_STATUS.SUSPENDED, client);
      await taskModel.recordAudit(
        { userId: req.user.id, action: 'SUSPEND_USER', entityType: 'user', entityId: id },
        client
      );
    });

    res.status(200).json({ status: userModel.USER_STATUS.SUSPENDED });
  } catch (err) {
    next(err);
  }
}

async function activateUser(req, res, next) {
  try {
    const { id } = req.params;
    const user = await userModel.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }
    if (user.status !== userModel.USER_STATUS.SUSPENDED) {
      return res.status(400).json({ error: 'Seul un compte suspendu peut être réactivé' });
    }

    await db.withTransaction(async (client) => {
      await userModel.updateStatus(id, userModel.USER_STATUS.ACTIVE, client);
      await taskModel.recordAudit(
        { userId: req.user.id, action: 'ACTIVATE_USER', entityType: 'user', entityId: id },
        client
      );
    });

    res.status(200).json({ status: userModel.USER_STATUS.ACTIVE });
  } catch (err) {
    next(err);
  }
}

async function promoteUser(req, res, next) {
  try {
    const { id } = req.params;

    if (id === req.user.id) {
      return res.status(400).json({ error: 'Vous ne pouvez pas modifier votre propre rôle' });
    }

    const user = await userModel.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }
    if (user.role !== userModel.USER_ROLE.EMPLOYEE) {
      return res.status(400).json({ error: 'Seul un employé peut être promu administrateur' });
    }

    await db.withTransaction(async (client) => {
      await userModel.promoteToAdmin(id, client);
      await taskModel.recordAudit(
        { userId: req.user.id, action: 'PROMOTE_USER', entityType: 'user', entityId: id },
        client
      );
    });

    res.status(200).json({ role: userModel.USER_ROLE.ADMIN });
  } catch (err) {
    next(err);
  }
}

async function getUserDetail(req, res, next) {
  try {
    const { id } = req.params;
    const user = await userModel.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    const [stats, tasks, recentActivity] = await Promise.all([
      taskModel.computeEmployeeStats(id),
      taskModel.findTasksForEmployee(id),
      taskModel.findRecentAuditForUser(id, 10),
    ]);

    res.status(200).json({
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        position: user.position,
        status: user.status,
      },
      stats,
      tasks,
      recent_activity: recentActivity,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listDirectory,
  getUserAvatar,
  listUsers,
  listPending,
  approveUser,
  rejectUser,
  suspendUser,
  activateUser,
  promoteUser,
  getUserDetail,
};
