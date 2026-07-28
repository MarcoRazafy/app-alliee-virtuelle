const fs = require('fs');
const db = require('../config/database');
const taskModel = require('../models/task.model');
const userModel = require('../models/user.model');
const extraTaskRequestModel = require('../models/extraTaskRequest.model');
const { isValidTitle, isValidPriority, isFutureDate, isValidEmail } = require('../utils/validators');

function canAccessTask(task, user) {
  if (user.role === 'ADMIN') return true;
  if (task.status === taskModel.TASK_STATUS.DECLARED) return false;
  return task.assigned_to === user.id;
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

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
      return res.status(404).json({ error: 'Task not found' });
    }

    const isOwner = task.assigned_to === req.user.id;
    const isAdmin = req.user.role === 'ADMIN';
    if (task.status === taskModel.TASK_STATUS.DECLARED && !isAdmin) return res.status(404).json({ error: 'Task not found' });
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Access denied to this task' });
    }

    res.status(200).json({
      id: task.id,
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
      deadline: task.deadline,
      assigned_to: task.assigned_to,
      assignee_name: task.assignee_name,
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
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.status !== taskModel.TASK_STATUS.DECLARED) return res.status(409).json({ error: 'Only declared tasks can be validated' });
    return res.json(await taskModel.updateStatus(task.id, taskModel.TASK_STATUS.VALIDATED));
  } catch (err) { return next(err); }
}

async function getTaskDetail(req, res, next) {
  try {
    const { id } = req.params;
    const task = await taskModel.findById(id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const isAdmin = req.user.role === 'ADMIN';
    if (!canAccessTask(task, req.user)) {
      return res.status(403).json({ error: 'Access denied to this task' });
    }

    const detail = await taskModel.getTaskDetail(id);
    // Une sous-tâche DECLAREE n'est pas plus visible à l'employé que sa tâche parente (DECISIONS.md)
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
      return res.status(404).json({ error: 'Task not found' });
    }
    if (!canAccessTask(task, req.user)) {
      return res.status(403).json({ error: 'Access denied to this task' });
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
      priority,
      deadline,
      start_date,
      list_id: listId,
      parent_task_id: parentTaskId,
      client_name: clientName,
      client_email: clientEmail,
    } = req.body;
    const isAdmin = req.user.role === 'ADMIN';

    // Un employé ne peut créer une tâche que pour lui-même ; l'admin assigne librement.
    const targetAssignee = isAdmin ? assigned_to : req.user.id;

    const errors = [];

    if (!isValidTitle(title)) errors.push('Title is required (fewer than 255 characters)');
    if (!isValidPriority(priority)) errors.push('Invalid priority');
    if (!isFutureDate(deadline)) errors.push("La deadline doit être postérieure à aujourd'hui");
    if (isAdmin && !assigned_to) errors.push('assigned_to est requis');
    if (isAdmin && clientEmail && !isValidEmail(clientEmail)) errors.push('Email du client invalide');

    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    const assignee = await userModel.findById(targetAssignee);
    if (!assignee) {
      return res.status(400).json({ error: 'Assigned user not found' });
    }

    // list_id et parent_task_id sont optionnels (tâche "libre" hors hiérarchie)
    if (isAdmin && parentTaskId) {
      const parentTask = await taskModel.findById(parentTaskId);
      if (!parentTask) {
        return res.status(400).json({ error: 'Parent task not found' });
      }
    }

    // Une tâche admin est immédiatement disponible ; une proposition employé
    // attend l'approbation admin avant d'être visible et démarrable.
    const initialStatus = isAdmin ? taskModel.TASK_STATUS.VALIDATED : taskModel.TASK_STATUS.DECLARED;

    const task = await taskModel.create({
      title,
      description,
      assignedTo: targetAssignee,
      createdBy: req.user.id,
      priority,
      deadline,
      startDate: isAdmin ? start_date : null,
      listId: isAdmin ? listId : null,
      parentTaskId: isAdmin ? parentTaskId : null,
      clientName: isAdmin ? clientName : null,
      clientEmail: isAdmin ? clientEmail : null,
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
        created_as: isAdmin ? 'ADMIN' : 'EMPLOYEE_PROPOSAL',
        list_id: isAdmin ? listId || null : null,
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
      return res.status(404).json({ error: 'Task not found' });
    }
    if (task.assigned_to !== req.user.id) {
      return res.status(403).json({ error: 'This task is not assigned to you' });
    }
    // VALIDEE/TERMINEE : premier démarrage ou redémarrage après complétion.
    // EN_COURS : reprise d'une tâche mise en pause (chrono arrêté mais tâche pas terminée).
    const startableStatuses = [
      taskModel.TASK_STATUS.VALIDATED,
      taskModel.TASK_STATUS.IN_PROGRESS,
      taskModel.TASK_STATUS.DONE,
    ];
    if (!startableStatuses.includes(task.status)) {
      return res.status(400).json({ error: 'The timer cannot be started from this status' });
    }

    const isResuming = task.status === taskModel.TASK_STATUS.IN_PROGRESS;

    const result = await db.withTransaction(async (client) => {
      const activeSession = await taskModel.findActiveSessionForEmployee(req.user.id);
      let switchedFrom = null;

      if (activeSession) {
        if (activeSession.task_id === taskId) {
          const alreadyRunning = new Error('The timer is already running on this task');
          alreadyRunning.status = 409;
          throw alreadyRunning;
        }

        // Bascule automatique : on arrête la session en cours sur l'autre tâche avant de démarrer celle-ci
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

      if (!isResuming) {
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
      return res.status(404).json({ error: 'Task not found' });
    }
    if (task.assigned_to !== req.user.id) {
      return res.status(403).json({ error: 'This task is not assigned to you' });
    }

    const activeSession = await taskModel.findActiveSessionForTask(taskId, req.user.id);
    if (!activeSession) {
      return res.status(404).json({ error: 'No active timer session on this task' });
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
      return res.status(404).json({ error: 'Task not found' });
    }
    if (task.assigned_to !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Access denied to this task' });
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
      return res.status(400).json({ error: 'task_ids must be an array' });
    }

    // Vérifie que chaque tâche est bien assignée à l'employé avant de l'ajouter à sa sélection
    for (const taskId of taskIds) {
      const task = await taskModel.findById(taskId);
      if (!task || task.assigned_to !== req.user.id) {
        return res.status(400).json({ error: `Task ${taskId} invalid or not assigned` });
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
          list_id: row.list_id,
          list_name: row.list_name,
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
    const updatedCount = await taskModel.validateDailySelection(req.user.id, date);
    if (updatedCount === 0) {
      return res.status(400).json({ error: 'Select at least one task before validating your day' });
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
      return res.status(404).json({ error: 'Task not found' });
    }
    if (task.assigned_to !== req.user.id) {
      return res.status(403).json({ error: 'This task is not assigned to you' });
    }
    if (task.status !== taskModel.TASK_STATUS.IN_PROGRESS) {
      return res.status(400).json({ error: 'Only an In progress task can be marked Completed' });
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
      return res.status(404).json({ error: 'Task not found' });
    }
    if (task.status !== taskModel.TASK_STATUS.DONE) {
      return res.status(400).json({ error: 'Only a Completed task can be confirmed' });
    }

    await db.withTransaction(async (client) => {
      // Revalide le statut dans la transaction : un autre administrateur peut
      // avoir confirmé ou renvoyé la tâche entre findById() et cette écriture.
      const updated = await client.query(
        `UPDATE tasks
         SET status = $1, updated_at = now()
         WHERE id = $2 AND status = $3
         RETURNING id, status`,
        [taskModel.TASK_STATUS.CONFIRMED, id, taskModel.TASK_STATUS.DONE]
      );
      if (updated.rowCount === 0) {
        const conflict = new Error('The task is no longer in the Completed status');
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
      return res.status(404).json({ error: 'Task not found' });
    }
    if (task.status !== taskModel.TASK_STATUS.DONE) {
      return res.status(400).json({ error: 'Only a Completed task can be sent back' });
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
      return res.status(404).json({ error: 'Task not found' });
    }
    if (!canAccessTask(task, req.user)) {
      return res.status(403).json({ error: 'Access denied to this task' });
    }

    const comments = await taskModel.findComments(id, { onlyType: 'COMMENT' });
    res.status(200).json(comments);
  } catch (err) {
    next(err);
  }
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
      return res.status(404).json({ error: 'Task not found' });
    }
    if (!canAccessTask(task, req.user)) {
      return res.status(403).json({ error: 'Access denied to this task' });
    }

    const comment = await taskModel.createComment({
      taskId: id,
      authorId: req.user.id,
      content,
      type: 'COMMENT',
      isVisibleToEmployee: true,
    });

    res.status(201).json(comment);
  } catch (err) {
    next(err);
  }
}

// Notes internes : admin seul, jamais visibles à l'employé (DECISIONS.md - arbitrage 3)
async function getNotes(req, res, next) {
  try {
    const { id } = req.params;
    const task = await taskModel.findById(id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const notes = await taskModel.findComments(id, { onlyType: 'NOTE' });
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
      return res.status(404).json({ error: 'Task not found' });
    }

    const note = await taskModel.createComment({
      taskId: id,
      authorId: req.user.id,
      content,
      type: 'NOTE',
      isVisibleToEmployee: false,
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
      return res.status(404).json({ error: 'Task not found' });
    }
    if (!canAccessTask(task, req.user)) {
      return res.status(403).json({ error: 'Access denied to this task' });
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
      return res.status(404).json({ error: 'Task not found' });
    }
    if (!canAccessTask(task, req.user)) {
      return res.status(403).json({ error: 'Access denied to this task' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Fichier requis' });
    }

    const attachment = await taskModel.createAttachment({
      taskId: id,
      fileName: req.file.originalname,
      filePath: req.file.path,
      fileSize: req.file.size,
      fileType: req.file.mimetype,
      uploadedBy: req.user.id,
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
      return res.status(403).json({ error: 'Access denied to this file' });
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
      return res.status(403).json({ error: 'Access denied to this task' });
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

// --- Demandes de tâche supplémentaire ---

// L'employé (journée déjà validée) demande à travailler une tâche précise de plus.
async function createExtraTaskRequest(req, res, next) {
  try {
    const { task_id: taskId, message } = req.body;
    if (!taskId) {
      return res.status(400).json({ error: 'task_id est requis' });
    }

    const date = todayDateString();

    // La demande n'a de sens qu'après avoir validé sa journée.
    const selection = await taskModel.findDailySelection(req.user.id, date);
    const dayValidated = selection.length > 0 && selection.every((row) => row.validated_at);
    if (!dayValidated) {
      return res.status(400).json({ error: "Validez d'abord votre journée avant de demander une tâche supplémentaire" });
    }

    const task = await taskModel.findById(taskId);
    if (!task || task.assigned_to !== req.user.id) {
      return res.status(400).json({ error: 'Invalid or unassigned task' });
    }
    // On ne demande que des tâches encore actionnables (pas déjà terminées/confirmées).
    if (![taskModel.TASK_STATUS.VALIDATED, taskModel.TASK_STATUS.IN_PROGRESS].includes(task.status)) {
      return res.status(400).json({ error: 'This task is not available' });
    }
    if (selection.some((row) => row.task_id === taskId)) {
      return res.status(400).json({ error: 'This task is already in your day' });
    }
    const existing = await extraTaskRequestModel.findPending(req.user.id, taskId, date);
    if (existing) {
      return res.status(409).json({ error: 'A request is already pending for this task' });
    }

    const request = await extraTaskRequestModel.create({ userId: req.user.id, taskId, date, message });
    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'REQUEST_EXTRA_TASK',
      entityType: 'extra_task_requests',
      entityId: request.id,
      details: { task_id: taskId, date },
    });
    res.status(201).json(request);
  } catch (err) {
    next(err);
  }
}

// Statut des demandes de l'employé pour aujourd'hui (pour afficher en attente / refusée).
async function getMyExtraTaskRequests(req, res, next) {
  try {
    const requests = await extraTaskRequestModel.findByUserForDate(req.user.id, todayDateString());
    res.status(200).json(requests);
  } catch (err) {
    next(err);
  }
}

// Liste admin (par défaut : en attente ; ?status= pour l'historique).
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
      return res.status(404).json({ error: 'Request not found or already handled' });
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
      return res.status(404).json({ error: 'Request not found or already handled' });
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
  getLateTasks,
  getAttachments,
  uploadAttachment,
  downloadAttachment,
  deleteAttachment,
};
