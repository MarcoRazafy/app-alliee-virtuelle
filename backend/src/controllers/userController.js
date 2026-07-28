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
      return res.status(404).json({ error: 'User not found' });
    }

    const avatar = await avatarModel.findByUserId(id);
    if (!avatar) {
      return res.status(404).json({ error: 'No profile photo' });
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
      return res.status(404).json({ error: 'User not found' });
    }
    if (user.status !== userModel.USER_STATUS.PENDING) {
      return res.status(400).json({ error: 'Only a pending account can be approved' });
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
      return res.status(404).json({ error: 'User not found' });
    }
    if (user.status !== userModel.USER_STATUS.PENDING) {
      return res.status(400).json({ error: 'Only a pending account can be rejected' });
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
      return res.status(404).json({ error: 'User not found' });
    }
    if (user.status !== userModel.USER_STATUS.ACTIVE) {
      return res.status(400).json({ error: 'Only an active account can be suspended' });
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
      return res.status(404).json({ error: 'User not found' });
    }
    if (user.status !== userModel.USER_STATUS.SUSPENDED) {
      return res.status(400).json({ error: 'Only a suspended account can be reactivated' });
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
      return res.status(400).json({ error: 'You cannot change your own role' });
    }

    const user = await userModel.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (user.role !== userModel.USER_ROLE.EMPLOYEE) {
      return res.status(400).json({ error: 'Only an employee can be promoted to administrator' });
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
      return res.status(404).json({ error: 'User not found' });
    }

    const today = new Date().toISOString().slice(0, 10);
    const [stats, tasks, recentActivity, avatar, dailySelection] = await Promise.all([
      taskModel.computeEmployeeStats(id),
      taskModel.findTasksForEmployee(id),
      taskModel.findRecentAuditForUser(id, 10),
      avatarModel.findByUserId(id),
      taskModel.findDailySelection(id, today),
    ]);

    res.status(200).json({
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        position: user.position,
        status: user.status,
        has_avatar: !!avatar,
      },
      stats,
      tasks,
      // Tâches que l'employé a sélectionnées dans « Ma journée » aujourd'hui (onglet "Aujourd'hui").
      daily_task_ids: dailySelection.map((row) => row.task_id),
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
