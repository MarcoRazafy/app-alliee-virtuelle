const db = require('../config/database');
const taskModel = require('../models/task.model');
const userModel = require('../models/user.model');
const { isValidTitle, isValidPriority, isFutureDate } = require('../utils/validators');

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

async function listTasks(req, res, next) {
  try {
    const { status, priority, deadline } = req.query;
    const tasks =
      req.user.role === 'ADMIN'
        ? await taskModel.findAllTasks({ status, priority, deadline })
        : await taskModel.findAssignedTasks(req.user.id, { status, priority, deadline });
    res.status(200).json(tasks);
  } catch (err) {
    next(err);
  }
}

async function getTask(req, res, next) {
  try {
    const task = await taskModel.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Tâche introuvable' });
    }

    const isOwner = task.assigned_to === req.user.id;
    const isAdmin = req.user.role === 'ADMIN';

    // Une tâche DECLAREE n'est pas encore visible à l'employé (DECISIONS.md)
    if (task.status === taskModel.TASK_STATUS.DECLARED && !isAdmin) {
      return res.status(404).json({ error: 'Tâche introuvable' });
    }
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Accès refusé à cette tâche' });
    }

    res.status(200).json({
      id: task.id,
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
      deadline: task.deadline,
    });
  } catch (err) {
    next(err);
  }
}

async function createTask(req, res, next) {
  try {
    const { title, description, assigned_to, priority, deadline, start_date } = req.body;
    const errors = [];

    if (!isValidTitle(title)) errors.push('Le titre est requis (moins de 255 caractères)');
    if (!isValidPriority(priority)) errors.push('Priorité invalide');
    if (!isFutureDate(deadline)) errors.push("La deadline doit être postérieure à aujourd'hui");
    if (!assigned_to) errors.push('assigned_to est requis');

    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    const assignee = await userModel.findById(assigned_to);
    if (!assignee) {
      return res.status(400).json({ error: 'Utilisateur assigné introuvable' });
    }

    const task = await taskModel.create({
      title,
      description,
      assignedTo: assigned_to,
      createdBy: req.user.id,
      priority,
      deadline,
      startDate: start_date,
    });

    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'CREATE_TASK',
      entityType: 'task',
      entityId: task.id,
      details: { title, assigned_to, priority, deadline },
    });

    res.status(201).json({ id: task.id, status: task.status });
  } catch (err) {
    next(err);
  }
}

async function startTimelog(req, res, next) {
  try {
    const { taskId } = req.params;
    const task = await taskModel.findById(taskId);

    if (!task) {
      return res.status(404).json({ error: 'Tâche introuvable' });
    }
    if (task.assigned_to !== req.user.id) {
      return res.status(403).json({ error: "Cette tâche ne vous est pas assignée" });
    }
    if (![taskModel.TASK_STATUS.VALIDATED, taskModel.TASK_STATUS.DONE].includes(task.status)) {
      return res.status(400).json({ error: 'Le chrono ne peut pas être démarré depuis ce statut' });
    }

    const activeSession = await taskModel.findActiveSessionForEmployee(req.user.id);
    if (activeSession) {
      return res.status(409).json({ error: 'Une session de chrono est déjà active sur une autre tâche' });
    }

    const session = await db.withTransaction(async (client) => {
      const newSession = await taskModel.startSession(taskId, req.user.id, client);
      await taskModel.updateStatus(taskId, taskModel.TASK_STATUS.IN_PROGRESS, client);
      await taskModel.recordHistory(
        {
          taskId,
          fieldChanged: 'status',
          oldValue: task.status,
          newValue: taskModel.TASK_STATUS.IN_PROGRESS,
          changedBy: req.user.id,
        },
        client
      );
      await taskModel.recordAudit(
        {
          userId: req.user.id,
          action: 'START_TIMELOG',
          entityType: 'task',
          entityId: taskId,
          details: { sessionId: newSession.id },
        },
        client
      );
      return newSession;
    });

    res.status(201).json({ sessionId: session.id, taskId: session.task_id, start_time: session.start_time });
  } catch (err) {
    next(err);
  }
}

async function stopTimelog(req, res, next) {
  try {
    const { taskId } = req.params;
    const task = await taskModel.findById(taskId);

    if (!task) {
      return res.status(404).json({ error: 'Tâche introuvable' });
    }
    if (task.assigned_to !== req.user.id) {
      return res.status(403).json({ error: "Cette tâche ne vous est pas assignée" });
    }

    const activeSession = await taskModel.findActiveSessionForTask(taskId, req.user.id);
    if (!activeSession) {
      return res.status(404).json({ error: 'Aucune session de chrono active sur cette tâche' });
    }

    const stopped = await taskModel.stopSession(activeSession.id);
    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'STOP_TIMELOG',
      entityType: 'task',
      entityId: taskId,
      details: { sessionId: stopped.id, duration_seconds: stopped.duration_seconds },
    });

    res.status(200).json({
      sessionId: stopped.id,
      duration: stopped.duration_seconds,
      start_time: stopped.start_time,
      end_time: stopped.end_time,
    });
  } catch (err) {
    next(err);
  }
}

async function getTimelogHistory(req, res, next) {
  try {
    const { taskId } = req.params;
    const task = await taskModel.findById(taskId);

    if (!task) {
      return res.status(404).json({ error: 'Tâche introuvable' });
    }
    if (task.assigned_to !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Accès refusé à cette tâche' });
    }

    const history = await taskModel.findTimelogHistory(taskId);
    res.status(200).json(history);
  } catch (err) {
    next(err);
  }
}

async function getMyDay(req, res, next) {
  try {
    const selection = await taskModel.findDailySelection(req.user.id, todayDateString());
    res.status(200).json(
      selection.map((row) => ({
        task_id: row.task_id,
        selected_order: row.selected_order,
        validated_at: row.validated_at,
        task_data: {
          title: row.title,
          description: row.description,
          priority: row.priority,
          status: row.status,
          deadline: row.deadline,
        },
      }))
    );
  } catch (err) {
    next(err);
  }
}

async function setMyDay(req, res, next) {
  try {
    const { task_ids: taskIds } = req.body;

    if (!Array.isArray(taskIds)) {
      return res.status(400).json({ error: 'task_ids doit être un tableau' });
    }

    // Vérifie que chaque tâche est bien assignée à l'employé avant de l'ajouter à sa sélection
    for (const taskId of taskIds) {
      const task = await taskModel.findById(taskId);
      if (!task || task.assigned_to !== req.user.id) {
        return res.status(400).json({ error: `Tâche ${taskId} invalide ou non assignée` });
      }
    }

    const date = todayDateString();
    await taskModel.replaceDailySelection(req.user.id, date, taskIds);
    const selection = await taskModel.findDailySelection(req.user.id, date);

    res.status(200).json(
      selection.map((row) => ({
        task_id: row.task_id,
        selected_order: row.selected_order,
        validated_at: row.validated_at,
        task_data: {
          title: row.title,
          description: row.description,
          priority: row.priority,
          status: row.status,
          deadline: row.deadline,
        },
      }))
    );
  } catch (err) {
    next(err);
  }
}

async function validateMyDay(req, res, next) {
  try {
    const date = todayDateString();
    await taskModel.validateDailySelection(req.user.id, date);
    res.status(200).json({ validated: true, date });
  } catch (err) {
    next(err);
  }
}

async function completeTask(req, res, next) {
  try {
    const { id } = req.params;
    const task = await taskModel.findById(id);

    if (!task) {
      return res.status(404).json({ error: 'Tâche introuvable' });
    }
    if (task.assigned_to !== req.user.id) {
      return res.status(403).json({ error: "Cette tâche ne vous est pas assignée" });
    }
    if (task.status !== taskModel.TASK_STATUS.IN_PROGRESS) {
      return res.status(400).json({ error: 'Seule une tâche En cours peut être marquée Terminée' });
    }

    await db.withTransaction(async (client) => {
      const activeSession = await taskModel.findActiveSessionForTask(id, req.user.id);
      if (activeSession) {
        await taskModel.stopSession(activeSession.id, client);
      }

      await taskModel.updateStatus(id, taskModel.TASK_STATUS.DONE, client);
      await taskModel.recordHistory(
        {
          taskId: id,
          fieldChanged: 'status',
          oldValue: task.status,
          newValue: taskModel.TASK_STATUS.DONE,
          changedBy: req.user.id,
        },
        client
      );
      await taskModel.recordAudit(
        {
          userId: req.user.id,
          action: 'COMPLETE_TASK',
          entityType: 'task',
          entityId: id,
        },
        client
      );
    });

    res.status(200).json({ status: taskModel.TASK_STATUS.DONE });
  } catch (err) {
    next(err);
  }
}

async function confirmTask(req, res, next) {
  try {
    const { id } = req.params;
    const task = await taskModel.findById(id);

    if (!task) {
      return res.status(404).json({ error: 'Tâche introuvable' });
    }
    if (task.status !== taskModel.TASK_STATUS.DONE) {
      return res.status(400).json({ error: 'Seule une tâche Terminée peut être confirmée' });
    }

    await db.withTransaction(async (client) => {
      await taskModel.updateStatus(id, taskModel.TASK_STATUS.CONFIRMED, client);
      await taskModel.recordHistory(
        {
          taskId: id,
          fieldChanged: 'status',
          oldValue: task.status,
          newValue: taskModel.TASK_STATUS.CONFIRMED,
          changedBy: req.user.id,
        },
        client
      );
      await taskModel.recordAudit(
        {
          userId: req.user.id,
          action: 'CONFIRM_TASK',
          entityType: 'task',
          entityId: id,
        },
        client
      );
    });

    res.status(200).json({ status: taskModel.TASK_STATUS.CONFIRMED });
  } catch (err) {
    next(err);
  }
}

async function rejectTask(req, res, next) {
  try {
    const { id } = req.params;
    const { motif } = req.body;

    if (!motif || !motif.trim()) {
      return res.status(400).json({ error: 'Le motif est requis' });
    }

    const task = await taskModel.findById(id);
    if (!task) {
      return res.status(404).json({ error: 'Tâche introuvable' });
    }
    if (task.status !== taskModel.TASK_STATUS.DONE) {
      return res.status(400).json({ error: 'Seule une tâche Terminée peut être renvoyée' });
    }

    await db.withTransaction(async (client) => {
      await taskModel.updateStatus(id, taskModel.TASK_STATUS.IN_PROGRESS, client);
      await taskModel.recordHistory(
        {
          taskId: id,
          fieldChanged: 'status',
          oldValue: task.status,
          newValue: `${taskModel.TASK_STATUS.IN_PROGRESS} (motif: ${motif})`,
          changedBy: req.user.id,
        },
        client
      );
      await taskModel.recordAudit(
        {
          userId: req.user.id,
          action: 'REJECT_TASK',
          entityType: 'task',
          entityId: id,
          details: { motif },
        },
        client
      );
    });

    res.status(200).json({ status: taskModel.TASK_STATUS.IN_PROGRESS, motif });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listTasks,
  getTask,
  createTask,
  startTimelog,
  stopTimelog,
  getTimelogHistory,
  getMyDay,
  setMyDay,
  validateMyDay,
  completeTask,
  confirmTask,
  rejectTask,
};
