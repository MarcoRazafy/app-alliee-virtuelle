const fs = require('fs');
const db = require('../config/database');
const taskModel = require('../models/task.model');
const userModel = require('../models/user.model');
const extraTaskRequestModel = require('../models/extraTaskRequest.model');
const mailService = require('../services/mail.service');
const { isValidTitle, isValidPriority, isTodayOrFuture, isValidEmail } = require('../utils/validators');
const { businessDayNow } = require('../utils/businessDay');
const { FINISHED_STATUSES } = require('../utils/lateTasks');
const { DateTime } = require('luxon');
const dailyModel = require('../models/daily.model');

function isTaskAssignee(task, userId) {
  if (!task) return false;
  if (task.assigned_to === userId) return true;
  return Array.isArray(task.assignees) && task.assignees.some((a) => a.id === userId);
}

function canAccessTask(task, user) {
  if (user.role === 'ADMIN') return true;
  return isTaskAssignee(task, user.id);
}

const todayDateString = businessDayNow;

async function listTasks(req, res, next) {
  try {
    const { status, priority, deadline, list_id: listId, active_only: activeOnlyParam } = req.query;
    const activeOnly = activeOnlyParam === 'true' || activeOnlyParam === '1';
    const tasks =
      req.user.role === 'ADMIN'
        ? await taskModel.findAllTasks({ status, priority, deadline, listId, activeOnly })
        : await taskModel.findAssignedTasks(req.user.id, { status, priority, deadline, listId });
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

    const isOwner = isTaskAssignee(task, req.user.id);
    const isAdmin = req.user.role === 'ADMIN';
    if (task.status === taskModel.TASK_STATUS.DECLARED && !isAdmin && !isOwner) return res.status(404).json({ error: 'Tâche introuvable' });
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Accès refusé à cette tâche' });
    }

    res.status(200).json({
      id: task.id,
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
      start_date: task.start_date,
      deadline: task.deadline,
      assigned_to: task.assigned_to,
      assignee_name: task.assignee_name,
      assignees: task.assignees || [],
      created_by: task.created_by,
      creator_name: task.creator_name,
      creator_has_avatar: task.creator_has_avatar,
      creator_role: task.creator_role,
      client_name: task.client_name,
      client_email: task.client_email,
    });
  } catch (err) {
    next(err);
  }
}

async function validateTask(req, res, next) {
  try {
    const task = await taskModel.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    if (task.status !== taskModel.TASK_STATUS.DECLARED) return res.status(409).json({ error: 'Seules les tâches déclarées peuvent être validées' });
    return res.json(await taskModel.updateStatus(task.id, taskModel.TASK_STATUS.VALIDATED));
  } catch (err) { return next(err); }
}

async function reassignTask(req, res, next) {
  try {
    const task = await taskModel.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });

    const newAssigneeId = req.body.assigned_to;
    if (!newAssigneeId) return res.status(400).json({ error: 'assigned_to est requis' });
    const assignee = await userModel.findById(newAssigneeId);
    if (!assignee) return res.status(400).json({ error: 'Utilisateur assigné introuvable' });

    for (const a of task.assignees && task.assignees.length ? task.assignees : [{ id: task.assigned_to }]) {
      const s = await taskModel.findActiveSessionForTask(task.id, a.id);
      if (s) await taskModel.stopSession(s.id);
    }
    await taskModel.setAssignees(task.id, [newAssigneeId]);
    await taskModel.updateAssignee(task.id, newAssigneeId);
    let newStatus = task.status;
    if (task.status === taskModel.TASK_STATUS.IN_PROGRESS || task.status === 'EN_PAUSE') {
      newStatus = (await taskModel.updateStatus(task.id, taskModel.TASK_STATUS.VALIDATED)).status;
    }
    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'REASSIGN_TASK',
      entityType: 'task',
      entityId: task.id,
      details: { title: task.title, to: newAssigneeId },
    });
    return res
      .status(200)
      .json({ id: task.id, assigned_to: newAssigneeId, status: newStatus, assignees: await taskModel.getAssignees(task.id) });
  } catch (err) {
    return next(err);
  }
}

async function addTaskAssignee(req, res, next) {
  try {
    const task = await taskModel.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });

    const newAssigneeId = req.body.assigned_to;
    if (!newAssigneeId) return res.status(400).json({ error: 'assigned_to est requis' });
    const assignee = await userModel.findById(newAssigneeId);
    if (!assignee) return res.status(400).json({ error: 'Utilisateur assigné introuvable' });
    if (isTaskAssignee(task, newAssigneeId)) {
      return res.status(400).json({ error: 'Cette personne est déjà assignée à la tâche' });
    }

    await taskModel.addAssignee(task.id, newAssigneeId);
    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'REASSIGN_TASK',
      entityType: 'task',
      entityId: task.id,
      details: { title: task.title, added: newAssigneeId },
    });
    return res.status(200).json({ id: task.id, assignees: await taskModel.getAssignees(task.id) });
  } catch (err) {
    return next(err);
  }
}

async function removeTaskAssignee(req, res, next) {
  try {
    const task = await taskModel.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });

    const userId = req.params.userId || req.body.user_id;
    if (!userId) return res.status(400).json({ error: 'user_id est requis' });
    const current = task.assignees || [];
    if (!current.some((a) => a.id === userId)) {
      return res.status(400).json({ error: "Cette personne n'est pas assignée à la tâche" });
    }
    if (current.length <= 1) {
      return res.status(400).json({ error: 'Impossible de retirer la dernière personne (une tâche doit avoir au moins un assigné)' });
    }

    const s = await taskModel.findActiveSessionForTask(task.id, userId);
    if (s) await taskModel.stopSession(s.id);

    await taskModel.removeAssignee(task.id, userId);
    if (task.assigned_to === userId) {
      const remaining = current.find((a) => a.id !== userId);
      if (remaining) await taskModel.updateAssignee(task.id, remaining.id);
    }
    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'REASSIGN_TASK',
      entityType: 'task',
      entityId: task.id,
      details: { title: task.title, removed: userId },
    });
    return res.status(200).json({ id: task.id, assignees: await taskModel.getAssignees(task.id) });
  } catch (err) {
    return next(err);
  }
}

async function updateTask(req, res, next) {
  try {
    const task = await taskModel.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });

    const isAdmin = req.user.role === 'ADMIN';
    const isCreator = task.created_by === req.user.id;
    if (!isAdmin && !isCreator) {
      return res.status(403).json({
        error: 'Vous ne pouvez modifier que les tâches que vous avez créées',
      });
    }

    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const { description, priority, deadline, start_date: startDate } = req.body;
    const errors = [];
    if (!isValidTitle(title)) errors.push('Le titre est requis (moins de 255 caractères)');
    if (!isValidPriority(priority)) errors.push('Priorité invalide');
    if (!deadline) errors.push("L'échéance est requise");

    const toYMD = (d) => {
      if (!d) return null;
      if (typeof d === 'string') return d.slice(0, 10);
      const dt = new Date(d);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    };
    const effectiveStart = startDate ? toYMD(startDate) : toYMD(task.start_date);
    if (effectiveStart && deadline && effectiveStart > toYMD(deadline)) {
      errors.push("La date de début ne peut pas être postérieure à l'échéance");
    }

    if (errors.length > 0) return res.status(400).json({ errors });

    const updated = await taskModel.updateTask(task.id, {
      title,
      description,
      priority,
      deadline,
      startDate: startDate ? String(startDate) : undefined,
    });
    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'UPDATE_TASK',
      entityType: 'task',
      entityId: task.id,
      details: { title },
    });
    return res.status(200).json(updated);
  } catch (err) {
    return next(err);
  }
}

async function updateTaskDeadline(req, res, next) {
  try {
    const task = await taskModel.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });

    const isAdmin = req.user.role === 'ADMIN';
    if (!isAdmin && task.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Vous ne pouvez modifier que les tâches que vous avez créées' });
    }

    const deadline = typeof req.body.deadline === 'string' ? req.body.deadline.trim() : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || !DateTime.fromISO(deadline).isValid) {
      return res.status(400).json({ error: "Date d'échéance invalide" });
    }
    const start = task.start_date
      ? typeof task.start_date === 'string'
        ? task.start_date.slice(0, 10)
        : DateTime.fromJSDate(task.start_date).toISODate()
      : null;
    if (start && deadline < start) {
      const startLabel = DateTime.fromISO(start).setLocale('fr').toFormat('d MMMM yyyy');
      return res.status(400).json({ error: `L'échéance ne peut pas précéder la date de début (${startLabel})` });
    }

    const before = task.deadline
      ? typeof task.deadline === 'string'
        ? task.deadline.slice(0, 10)
        : DateTime.fromJSDate(task.deadline).toISODate()
      : null;
    const updated = await taskModel.updateDeadline(task.id, deadline);
    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'UPDATE_TASK_DEADLINE',
      entityType: 'task',
      entityId: task.id,
      details: { title: task.title, before, after: deadline },
    });

    const isLate = deadline < businessDayNow() && !FINISHED_STATUSES.includes(updated.status);
    return res.status(200).json({ id: updated.id, deadline: updated.deadline, is_late: isLate });
  } catch (err) {
    return next(err);
  }
}

const ADMIN_SETTABLE_STATUSES = [
  taskModel.TASK_STATUS.VALIDATED,
  taskModel.TASK_STATUS.IN_PROGRESS,
  taskModel.TASK_STATUS.DONE,
  taskModel.TASK_STATUS.CONFIRMED,
];

const MAX_DESCRIPTION_LENGTH = 20000;

async function updateTaskDescription(req, res, next) {
  try {
    const task = await taskModel.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });

    const isAdmin = req.user.role === 'ADMIN';
    if (!isAdmin && !isTaskAssignee(task, req.user.id)) {
      return res.status(403).json({ error: 'Cette tâche ne vous est pas assignée' });
    }

    const description = typeof req.body.description === 'string' ? req.body.description : '';
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      return res.status(400).json({ error: 'La description est trop longue' });
    }

    const updated = await taskModel.updateDescription(task.id, description || null);

    await taskModel.recordHistory({
      taskId: task.id,
      fieldChanged: 'description',
      oldValue: null,
      newValue: null,
      changedBy: req.user.id,
    });

    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}

async function updateTaskStatus(req, res, next) {
  try {
    const task = await taskModel.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });

    const requested = req.body.status;

    const wantsPaused = requested === 'A_REPRENDRE';
    const newStatus = wantsPaused ? taskModel.TASK_STATUS.IN_PROGRESS : requested;

    if (!ADMIN_SETTABLE_STATUSES.includes(newStatus)) {
      return res.status(400).json({ error: 'Statut invalide' });
    }
    if (newStatus === task.status && !wantsPaused) {
      return res.status(200).json({ id: task.id, status: task.status });
    }

    await db.withTransaction(async (client) => {
      if (wantsPaused || task.status === taskModel.TASK_STATUS.IN_PROGRESS) {
        const assignees = task.assignees && task.assignees.length ? task.assignees : [{ id: task.assigned_to }];
        for (const a of assignees) {
          const s = await taskModel.findActiveSessionForTask(task.id, a.id);
          if (s) await taskModel.stopSession(s.id, client);
        }
      }
      await taskModel.updateStatus(task.id, newStatus, client);
      await taskModel.recordHistory(
        { taskId: task.id, fieldChanged: 'status', oldValue: task.status, newValue: newStatus, changedBy: req.user.id },
        client
      );
      await taskModel.recordAudit(
        {
          userId: req.user.id,
          action: 'UPDATE_TASK_STATUS',
          entityType: 'task',
          entityId: task.id,
          details: { title: task.title, from: task.status, to: newStatus, paused: wantsPaused || undefined },
        },
        client
      );
    });

    return res.status(200).json({ id: task.id, status: newStatus });
  } catch (err) {
    return next(err);
  }
}

async function getTaskDetail(req, res, next) {
  try {
    const { id } = req.params;
    const task = await taskModel.findById(id);
    if (!task) {
      return res.status(404).json({ error: 'Tâche introuvable' });
    }

    const isAdmin = req.user.role === 'ADMIN';
    if (!canAccessTask(task, req.user)) {
      return res.status(403).json({ error: 'Accès refusé à cette tâche' });
    }

    const detail = await taskModel.getTaskDetail(id);
    detail.assignees = task.assignees || [];
    if (!isAdmin) {
      detail.subtasks = detail.subtasks.filter((s) => s.status !== taskModel.TASK_STATUS.DECLARED);
    }
    res.status(200).json(detail);
  } catch (err) {
    next(err);
  }
}

async function getSubtasks(req, res, next) {
  try {
    const { id } = req.params;
    const task = await taskModel.findById(id);
    if (!task) {
      return res.status(404).json({ error: 'Tâche introuvable' });
    }
    if (!canAccessTask(task, req.user)) {
      return res.status(403).json({ error: 'Accès refusé à cette tâche' });
    }

    const isAdmin = req.user.role === 'ADMIN';
    const subtasks = await taskModel.findSubtasks(id);
    const visibleSubtasks = isAdmin
      ? subtasks
      : subtasks.filter((s) => s.status !== taskModel.TASK_STATUS.DECLARED);
    res.status(200).json(visibleSubtasks);
  } catch (err) {
    next(err);
  }
}

async function createTask(req, res, next) {
  try {
    const {
      title,
      description,
      assigned_to,
      assignee_ids: assigneeIdsRaw,
      priority,
      deadline,
      start_date,
      list_id: listId,
      parent_task_id: parentTaskId,
      client_name: clientName,
      client_email: clientEmail,
    } = req.body;
    const isAdmin = req.user.role === 'ADMIN';

    const assigneeList = isAdmin
      ? [...new Set((Array.isArray(assigneeIdsRaw) && assigneeIdsRaw.length ? assigneeIdsRaw : [assigned_to]).filter(Boolean))]
      : [req.user.id];
    const targetAssignee = assigneeList[0];

    const errors = [];

    if (!isValidTitle(title)) errors.push('Le titre est requis (moins de 255 caractères)');
    if (!isValidPriority(priority)) errors.push('Priorité invalide');
    if (!isTodayOrFuture(deadline)) errors.push("La deadline ne peut pas être dans le passé (aujourd'hui accepté)");
    if (!listId) errors.push('Le projet est requis');
    if (isAdmin && assigneeList.length === 0) errors.push('Au moins une personne à assigner est requise');
    if (clientEmail && !isValidEmail(clientEmail)) errors.push('Email du client invalide');

    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    for (const uid of assigneeList) {
      // eslint-disable-next-line no-await-in-loop
      if (!(await userModel.findById(uid))) {
        return res.status(400).json({ error: 'Utilisateur assigné introuvable' });
      }
    }

    if (isAdmin && parentTaskId) {
      const parentTask = await taskModel.findById(parentTaskId);
      if (!parentTask) {
        return res.status(400).json({ error: 'Tâche parente introuvable' });
      }
    }

    const initialStatus = taskModel.TASK_STATUS.VALIDATED;

    const task = await taskModel.create({
      title,
      description,
      assignedTo: targetAssignee,
      assigneeIds: assigneeList,
      createdBy: req.user.id,
      priority,
      deadline,
      startDate: start_date || null,
      listId: listId || null,
      parentTaskId: isAdmin ? parentTaskId : null,
      clientName: clientName || null,
      clientEmail: clientEmail || null,
      status: initialStatus,
    });

    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'CREATE_TASK',
      entityType: 'task',
      entityId: task.id,
      details: {
        title,
        assigned_to: targetAssignee,
        priority,
        deadline,
        status: initialStatus,
        created_as: isAdmin ? 'ADMIN' : 'EMPLOYEE',
        list_id: listId || null,
        parent_task_id: isAdmin ? parentTaskId || null : null,
        client_name: isAdmin ? clientName || null : null,
        client_email: isAdmin ? clientEmail || null : null,
      },
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
    if (!isTaskAssignee(task, req.user.id) && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Cette tâche ne vous est pas assignée' });
    }
    const startableStatuses = [
      taskModel.TASK_STATUS.VALIDATED,
      taskModel.TASK_STATUS.IN_PROGRESS,
      taskModel.TASK_STATUS.DONE,
    ];
    if (!startableStatuses.includes(task.status)) {
      return res.status(400).json({ error: 'Le chrono ne peut pas être démarré depuis ce statut' });
    }

    const isResuming = task.status === taskModel.TASK_STATUS.IN_PROGRESS;

    const result = await db.withTransaction(async (client) => {
      const activeSession = await taskModel.findActiveSessionForEmployee(req.user.id);
      let switchedFrom = null;

      if (activeSession) {
        if (activeSession.task_id === taskId) {
          const alreadyRunning = new Error('Le chrono est déjà actif sur cette tâche');
          alreadyRunning.status = 409;
          throw alreadyRunning;
        }

        const stopped = await taskModel.stopSession(activeSession.id, client);
        await taskModel.recordAudit(
          {
            userId: req.user.id,
            action: 'AUTO_STOP_TIMELOG',
            entityType: 'task',
            entityId: activeSession.task_id,
            details: { sessionId: activeSession.id, durationSeconds: stopped.duration_seconds },
          },
          client
        );
        switchedFrom = { taskId: activeSession.task_id, duration: stopped.duration_seconds };
      }

      const newSession = await taskModel.startSession(taskId, req.user.id, client);

      if (!isResuming && isTaskAssignee(task, req.user.id)) {
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
      }

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

      return { newSession, switchedFrom };
    });

    res.status(201).json({
      sessionId: result.newSession.id,
      taskId: result.newSession.task_id,
      start_time: result.newSession.start_time,
      switchedFromTaskId: result.switchedFrom?.taskId || null,
      switchedFromDuration: result.switchedFrom != null ? result.switchedFrom.duration : null,
    });
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
    if (!isTaskAssignee(task, req.user.id) && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Cette tâche ne vous est pas assignée' });
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

async function getActiveTask(req, res, next) {
  try {
    const active = await taskModel.findActiveTaskForEmployee(req.user.id);
    res.status(200).json(active);
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
    if (!isTaskAssignee(task, req.user.id) && req.user.role !== 'ADMIN') {
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
          list_id: row.list_id,
          list_name: row.list_name,
          folder_name: row.folder_name,
          space_name: row.space_name,
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

    for (const taskId of taskIds) {
      const task = await taskModel.findById(taskId);
      if (!task || !isTaskAssignee(task, req.user.id)) {
        return res.status(400).json({ error: `Tâche ${taskId} invalide ou non assignée` });
      }
    }

    const date = todayDateString();
    await db.withTransaction(async (client) => {
      const { wasValidated, added } = await taskModel.replaceDailySelection(req.user.id, date, taskIds, client);
      if (wasValidated) {
        for (const taskId of added) await dailyModel.addDailyDone(req.user.id, date, taskId, client);
      }
    });
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
          list_id: row.list_id,
          list_name: row.list_name,
          folder_name: row.folder_name,
          space_name: row.space_name,
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
    const updatedCount = await db.withTransaction(async (client) => {
      const count = await taskModel.validateDailySelection(req.user.id, date, client);
      if (count === 0) return 0;
      const selection = await client.query(
        'SELECT task_id FROM user_daily_selection WHERE user_id = $1 AND date = $2 ORDER BY selected_order',
        [req.user.id, date]
      );
      for (const row of selection.rows) await dailyModel.addDailyDone(req.user.id, date, row.task_id, client);
      return count;
    });
    if (updatedCount === 0) {
      return res.status(400).json({ error: 'Sélectionnez au moins une tâche avant de valider votre journée' });
    }
    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'VALIDATE_MY_DAY',
      entityType: 'user_daily_selection',
      entityId: req.user.id,
      details: { date },
    });
    res.status(200).json({ validated: true, date });
  } catch (err) {
    next(err);
  }
}

async function getMyActivity(req, res, next) {
  try {
    const activity = await taskModel.findRecentAuditForUser(req.user.id, 8);
    res.status(200).json(activity);
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
    if (!isTaskAssignee(task, req.user.id)) {
      return res.status(403).json({ error: 'Cette tâche ne vous est pas assignée' });
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

      await dailyModel.addDailyDone(req.user.id, todayDateString(), id, client);
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
      const updated = await client.query(
        `UPDATE tasks
         SET status = $1, updated_at = now()
         WHERE id = $2 AND status = $3
         RETURNING id, status`,
        [taskModel.TASK_STATUS.CONFIRMED, id, taskModel.TASK_STATUS.DONE]
      );
      if (updated.rowCount === 0) {
        const conflict = new Error('La tâche n’est plus au statut Terminée');
        conflict.status = 409;
        throw conflict;
      }
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

async function getComments(req, res, next) {
  try {
    const { id } = req.params;
    const task = await taskModel.findById(id);
    if (!task) {
      return res.status(404).json({ error: 'Tâche introuvable' });
    }
    if (!canAccessTask(task, req.user)) {
      return res.status(403).json({ error: 'Accès refusé à cette tâche' });
    }

    const comments = await taskModel.findComments(id, { onlyType: 'COMMENT', viewerId: req.user.id });
    res.status(200).json(comments);
  } catch (err) {
    next(err);
  }
}

const MENTION_RE = /@\[[^\]]+\]\(([0-9a-fA-F-]{36})\)/g;

function extractMentionIds(content) {
  const ids = new Set();
  for (const match of String(content || '').matchAll(MENTION_RE)) ids.add(match[1]);
  return [...ids];
}

async function notifyMentions({ content, taskId, taskTitle, commentId, authorId, adminsOnly = false }) {
  const ids = extractMentionIds(content).filter((uid) => uid !== authorId);
  if (ids.length === 0) return;
  await Promise.all(
    ids.map(async (uid) => {
      try {
        const mentioned = await userModel.findById(uid);
        if (!mentioned) return;
        if (adminsOnly && mentioned.role !== 'ADMIN') return;
        await taskModel.recordAudit({
          userId: authorId,
          action: 'MENTION_IN_COMMENT',
          entityType: 'task_comment',
          entityId: commentId,
          details: { task_id: taskId, task_title: taskTitle, target_user_id: uid, comment_id: commentId },
        });
      } catch (err) {
        console.error('Notification de mention échouée :', err.message);
      }
    })
  );
}

async function createComment(req, res, next) {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Le contenu est requis' });
    }

    const task = await taskModel.findById(id);
    if (!task) {
      return res.status(404).json({ error: 'Tâche introuvable' });
    }
    if (!canAccessTask(task, req.user)) {
      return res.status(403).json({ error: 'Accès refusé à cette tâche' });
    }

    const comment = await taskModel.createComment({
      taskId: id,
      authorId: req.user.id,
      content,
      type: 'COMMENT',
      isVisibleToEmployee: true,
    });

    await notifyMentions({
      content,
      taskId: id,
      taskTitle: task.title,
      commentId: comment.id,
      authorId: req.user.id,
    });

    res.status(201).json(comment);
  } catch (err) {
    next(err);
  }
}

async function updateComment(req, res, next) {
  try {
    const { id, commentId } = req.params;
    const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
    if (!content) {
      return res.status(400).json({ error: 'Le commentaire ne peut pas être vide' });
    }

    const comment = await taskModel.findCommentById(commentId);
    if (!comment || comment.task_id !== id) {
      return res.status(404).json({ error: 'Commentaire introuvable' });
    }

    const task = await taskModel.findById(id);
    if (!task || !canAccessTask(task, req.user)) {
      return res.status(403).json({ error: 'Accès refusé à cette tâche' });
    }
    if (comment.type === 'NOTE' && req.user.role !== 'ADMIN') {
      return res.status(404).json({ error: 'Commentaire introuvable' });
    }
    if (comment.author_id !== req.user.id) {
      return res.status(403).json({ error: 'Vous ne pouvez modifier que vos propres commentaires.' });
    }

    const updated = await taskModel.updateCommentContent(commentId, content);
    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}

const COMMENT_REACTIONS = ['✔️'];

async function toggleCommentReaction(req, res, next) {
  try {
    const { id, commentId } = req.params;
    const emoji = typeof req.body.emoji === 'string' ? req.body.emoji : '';
    if (!COMMENT_REACTIONS.includes(emoji)) {
      return res.status(400).json({ error: 'Réaction non prise en charge' });
    }

    const comment = await taskModel.findCommentById(commentId);
    if (!comment || comment.task_id !== id) {
      return res.status(404).json({ error: 'Commentaire introuvable' });
    }

    const task = await taskModel.findById(id);
    if (!task || !canAccessTask(task, req.user)) {
      return res.status(403).json({ error: 'Accès refusé à cette tâche' });
    }
    if (comment.type === 'NOTE' && req.user.role !== 'ADMIN') {
      return res.status(404).json({ error: 'Commentaire introuvable' });
    }

    const reactions = await taskModel.toggleCommentReaction(commentId, req.user.id, emoji);
    res.status(200).json({ id: commentId, reactions });
  } catch (err) {
    next(err);
  }
}

async function deleteComment(req, res, next) {
  try {
    const { id, commentId } = req.params;
    const comment = await taskModel.findCommentById(commentId);
    if (!comment || comment.task_id !== id) {
      return res.status(404).json({ error: 'Commentaire introuvable' });
    }

    const task = await taskModel.findById(id);
    if (!task || !canAccessTask(task, req.user)) {
      return res.status(403).json({ error: 'Accès refusé à cette tâche' });
    }

    const isAdmin = req.user.role === 'ADMIN';
    if (comment.type === 'NOTE' && !isAdmin) {
      return res.status(404).json({ error: 'Commentaire introuvable' });
    }
    if (!isAdmin && comment.author_id !== req.user.id) {
      return res.status(403).json({ error: 'Vous ne pouvez supprimer que vos propres commentaires.' });
    }

    const attachments = await taskModel.findAttachmentsByComment(commentId);
    await taskModel.deleteComment(commentId);
    attachments.forEach((a) => fs.unlink(a.file_path, () => {}));

    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'DELETE_TASK_COMMENT',
      entityType: 'task',
      entityId: id,
      details: { comment_id: commentId, removed_files: attachments.length },
    });

    res.status(200).json({ id: commentId });
  } catch (err) {
    next(err);
  }
}

async function getNotes(req, res, next) {
  try {
    const { id } = req.params;
    const task = await taskModel.findById(id);
    if (!task) {
      return res.status(404).json({ error: 'Tâche introuvable' });
    }

    const notes = await taskModel.findComments(id, { onlyType: 'NOTE', viewerId: req.user.id });
    res.status(200).json(notes);
  } catch (err) {
    next(err);
  }
}

async function createNote(req, res, next) {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Le contenu est requis' });
    }

    const task = await taskModel.findById(id);
    if (!task) {
      return res.status(404).json({ error: 'Tâche introuvable' });
    }

    const note = await taskModel.createComment({
      taskId: id,
      authorId: req.user.id,
      content,
      type: 'NOTE',
      isVisibleToEmployee: false,
    });

    await notifyMentions({
      content,
      taskId: id,
      taskTitle: task.title,
      commentId: note.id,
      authorId: req.user.id,
      adminsOnly: true,
    });

    res.status(201).json(note);
  } catch (err) {
    next(err);
  }
}

async function getLateTasks(req, res, next) {
  try {
    const tasks = await taskModel.findLateTasks();
    res.status(200).json(tasks);
  } catch (err) {
    next(err);
  }
}

async function getAttachments(req, res, next) {
  try {
    const { id } = req.params;
    const task = await taskModel.findById(id);
    if (!task) {
      return res.status(404).json({ error: 'Tâche introuvable' });
    }
    if (!canAccessTask(task, req.user)) {
      return res.status(403).json({ error: 'Accès refusé à cette tâche' });
    }

    const attachments = await taskModel.findAttachments(id);
    res.status(200).json(attachments);
  } catch (err) {
    next(err);
  }
}

async function uploadAttachment(req, res, next) {
  try {
    const { id } = req.params;
    const task = await taskModel.findById(id);
    if (!task) {
      return res.status(404).json({ error: 'Tâche introuvable' });
    }
    if (!canAccessTask(task, req.user)) {
      return res.status(403).json({ error: 'Accès refusé à cette tâche' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Fichier requis' });
    }

    let commentId = req.body?.comment_id || null;
    if (commentId) {
      const comment = await taskModel.findCommentById(commentId);
      if (!comment || comment.task_id !== id) {
        return res.status(400).json({ error: 'Commentaire introuvable pour cette tâche' });
      }
    }

    const attachment = await taskModel.createAttachment({
      taskId: id,
      fileName: req.file.originalname,
      filePath: req.file.path,
      fileSize: req.file.size,
      fileType: req.file.mimetype,
      uploadedBy: req.user.id,
      commentId,
    });

    res.status(201).json(attachment);
  } catch (err) {
    next(err);
  }
}

async function downloadAttachment(req, res, next) {
  try {
    const { fileId } = req.params;
    const attachment = await taskModel.findAttachmentById(fileId);
    if (!attachment) {
      return res.status(404).json({ error: 'Fichier introuvable' });
    }

    const task = await taskModel.findById(attachment.task_id);
    if (!task || !canAccessTask(task, req.user)) {
      return res.status(403).json({ error: 'Accès refusé à ce fichier' });
    }

    res.download(attachment.file_path, attachment.file_name);
  } catch (err) {
    next(err);
  }
}

async function deleteAttachment(req, res, next) {
  try {
    const { id, fileId } = req.params;
    const attachment = await taskModel.findAttachmentById(fileId);
    if (!attachment || attachment.task_id !== id) {
      return res.status(404).json({ error: 'Fichier introuvable' });
    }

    const task = await taskModel.findById(id);
    if (!task || !canAccessTask(task, req.user)) {
      return res.status(403).json({ error: 'Accès refusé à cette tâche' });
    }
    if (req.user.role !== 'ADMIN' && attachment.uploaded_by !== req.user.id) {
      return res.status(403).json({ error: 'Vous ne pouvez supprimer que les fichiers que vous avez envoyés.' });
    }

    await taskModel.deleteAttachment(fileId);
    fs.unlink(attachment.file_path, () => {});

    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'DELETE_TASK_ATTACHMENT',
      entityType: 'task_attachment',
      entityId: fileId,
      details: { task_id: id, file_name: attachment.file_name },
    });

    res.status(200).json({ deleted: true });
  } catch (err) {
    next(err);
  }
}

async function deleteTask(req, res, next) {
  try {
    const { id } = req.params;
    const task = await taskModel.findById(id);
    if (!task) {
      return res.status(404).json({ error: 'Tâche introuvable' });
    }

    const isAdmin = req.user.role === 'ADMIN';
    if (!isAdmin && task.created_by !== req.user.id) {
      return res.status(403).json({
        error: "Vous ne pouvez supprimer que les tâches que vous avez créées",
      });
    }

    await taskModel.deleteTask(id);

    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'DELETE_TASK',
      entityType: 'task',
      entityId: id,
      details: { title: task.title, deleted_as: isAdmin ? 'ADMIN' : 'CREATOR' },
    });

    res.status(200).json({ deleted: true });
  } catch (err) {
    next(err);
  }
}

async function updateTimelogEntry(req, res, next) {
  try {
    const { entryId } = req.params;
    const { start_time: startTime, end_time: endTime } = req.body;

    const entry = await taskModel.findTimelogById(entryId);
    if (!entry) return res.status(404).json({ error: 'Session introuvable' });

    if (!startTime || !endTime) {
      return res.status(400).json({ error: 'Le début et la fin sont requis' });
    }
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Dates invalides' });
    }
    if (end <= start) {
      return res.status(400).json({ error: "L'heure de fin doit être après l'heure de début" });
    }

    const updated = await taskModel.updateTimelogEntry(entryId, startTime, endTime);

    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'UPDATE_TIMELOG',
      entityType: 'task',
      entityId: entry.task_id,
      details: {
        timelog_id: entryId,
        before: { start_time: entry.start_time, end_time: entry.end_time, duration_seconds: entry.duration_seconds },
        after: { start_time: updated.start_time, end_time: updated.end_time, duration_seconds: updated.duration_seconds },
      },
    });

    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}

async function deleteTimelogEntry(req, res, next) {
  try {
    const { entryId } = req.params;
    const entry = await taskModel.findTimelogById(entryId);
    if (!entry) return res.status(404).json({ error: 'Session introuvable' });

    await taskModel.deleteTimelogEntry(entryId);

    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'DELETE_TIMELOG',
      entityType: 'task',
      entityId: entry.task_id,
      details: {
        timelog_id: entryId,
        start_time: entry.start_time,
        end_time: entry.end_time,
        duration_seconds: entry.duration_seconds,
      },
    });

    res.status(200).json({ deleted: true });
  } catch (err) {
    next(err);
  }
}

async function addManualTimelog(req, res, next) {
  try {
    const { taskId: id } = req.params;
    const { start_time: startTime, end_time: endTime } = req.body;

    const task = await taskModel.findById(id);
    if (!task) {
      return res.status(404).json({ error: 'Tâche introuvable' });
    }
    if (!task.assigned_to) {
      return res.status(400).json({ error: "La tâche n'est assignée à personne : impossible d'ajouter du temps" });
    }
    if (!startTime || !endTime) {
      return res.status(400).json({ error: 'Le début et la fin sont requis' });
    }
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Dates invalides' });
    }
    if (end <= start) {
      return res.status(400).json({ error: "L'heure de fin doit être après l'heure de début" });
    }

    const entry = await taskModel.addManualTimelog(id, task.assigned_to, startTime, endTime);

    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'ADD_MANUAL_TIMELOG',
      entityType: 'task',
      entityId: id,
      details: { title: task.title, duration_seconds: entry.duration_seconds },
    });

    res.status(201).json(entry);
  } catch (err) {
    next(err);
  }
}

async function createExtraTaskRequest(req, res, next) {
  try {
    const { task_id: taskId, message } = req.body;
    if (!taskId) {
      return res.status(400).json({ error: 'task_id est requis' });
    }

    const date = todayDateString();

    const selection = await taskModel.findDailySelection(req.user.id, date);
    const dayValidated = selection.length > 0 && selection.every((row) => row.validated_at);
    if (!dayValidated) {
      return res.status(400).json({ error: "Validez d'abord votre journée avant de demander une tâche supplémentaire" });
    }

    const task = await taskModel.findById(taskId);
    if (!task || !isTaskAssignee(task, req.user.id)) {
      return res.status(400).json({ error: 'Tâche invalide ou non assignée' });
    }
    if (![taskModel.TASK_STATUS.VALIDATED, taskModel.TASK_STATUS.IN_PROGRESS].includes(task.status)) {
      return res.status(400).json({ error: "Cette tâche n'est pas disponible" });
    }
    if (selection.some((row) => row.task_id === taskId)) {
      return res.status(400).json({ error: 'Cette tâche est déjà dans votre journée' });
    }
    const existing = await extraTaskRequestModel.findPending(req.user.id, taskId, date);
    if (existing) {
      return res.status(409).json({ error: 'Une demande est déjà en attente pour cette tâche' });
    }

    const request = await extraTaskRequestModel.create({ userId: req.user.id, taskId, date, message });
    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'REQUEST_EXTRA_TASK',
      entityType: 'extra_task_requests',
      entityId: request.id,
      details: { task_id: taskId, date },
    });

    Promise.all([userModel.findById(req.user.id).catch(() => null), userModel.findAdminEmails().catch(() => [])])
      .then(([requester, adminEmails]) =>
        mailService.sendNewTaskRequestToAdmins(
          { requesterName: requester?.full_name || requester?.username || null, taskTitle: task.title, message },
          adminEmails
        )
      )
      .catch(() => {});

    res.status(201).json(request);
  } catch (err) {
    next(err);
  }
}

async function getMyExtraTaskRequests(req, res, next) {
  try {
    const requests = await extraTaskRequestModel.findByUserForDate(req.user.id, todayDateString());
    res.status(200).json(requests);
  } catch (err) {
    next(err);
  }
}

async function listExtraTaskRequests(req, res, next) {
  try {
    const { status } = req.query;
    const requests = await extraTaskRequestModel.findForAdmin({ status });
    res.status(200).json(requests);
  } catch (err) {
    next(err);
  }
}

async function approveExtraTaskRequest(req, res, next) {
  try {
    const request = await extraTaskRequestModel.approve(req.params.id, req.user.id);
    if (!request) {
      return res.status(404).json({ error: 'Demande introuvable ou déjà traitée' });
    }
    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'APPROVE_EXTRA_TASK',
      entityType: 'extra_task_requests',
      entityId: request.id,
      details: { task_id: request.task_id, target_user: request.user_id },
    });
    res.status(200).json({ ...request, status: 'APPROVED' });
  } catch (err) {
    next(err);
  }
}

async function rejectExtraTaskRequest(req, res, next) {
  try {
    const request = await extraTaskRequestModel.reject(req.params.id, req.user.id, req.body?.note);
    if (!request) {
      return res.status(404).json({ error: 'Demande introuvable ou déjà traitée' });
    }
    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'REJECT_EXTRA_TASK',
      entityType: 'extra_task_requests',
      entityId: request.id,
      details: { task_id: request.task_id, target_user: request.user_id },
    });
    res.status(200).json(request);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listTasks,
  getTask,
  getTaskDetail,
  createExtraTaskRequest,
  getMyExtraTaskRequests,
  listExtraTaskRequests,
  approveExtraTaskRequest,
  rejectExtraTaskRequest,
  validateTask,
  getSubtasks,
  createTask,
  startTimelog,
  stopTimelog,
  getTimelogHistory,
  getMyDay,
  setMyDay,
  validateMyDay,
  getMyActivity,
  completeTask,
  confirmTask,
  rejectTask,
  getComments,
  createComment,
  getNotes,
  createNote,
  updateComment,
  deleteComment,
  toggleCommentReaction,
  getLateTasks,
  getAttachments,
  uploadAttachment,
  downloadAttachment,
  deleteAttachment,
  deleteTask,
  updateTask,
  updateTaskDescription,
  updateTaskDeadline,
  updateTaskStatus,
  reassignTask,
  addTaskAssignee,
  removeTaskAssignee,
  updateTimelogEntry,
  deleteTimelogEntry,
  addManualTimelog,
  getActiveTask,
};
