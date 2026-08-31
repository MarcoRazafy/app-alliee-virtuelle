const fs = require('fs');
const db = require('../config/database');
const taskModel = require('../models/task.model');
const userModel = require('../models/user.model');
const extraTaskRequestModel = require('../models/extraTaskRequest.model');
const mailService = require('../services/mail.service');
const { isValidTitle, isValidPriority, isTodayOrFuture, isValidEmail } = require('../utils/validators');

// L'utilisateur est-il l'un des assignés de la tâche ? (task issu de findById → contient `assignees`)
// Repli sur assigned_to si la liste n'est pas chargée, pour ne jamais être moins permissif qu'avant.
function isTaskAssignee(task, userId) {
  if (!task) return false;
  if (task.assigned_to === userId) return true;
  return Array.isArray(task.assignees) && task.assignees.some((a) => a.id === userId);
}

function canAccessTask(task, user) {
  if (user.role === 'ADMIN') return true;
  // Le propriétaire (proposeur) peut gérer sa proposition DECLAREE — pièces jointes, commentaires…
  // Les autres employés ne la voient pas (une DECLAREE n'est assignée qu'à son proposeur).
  // Les actions sensibles (chrono, complétion) restent bloquées par leur propre contrôle de statut.
  return isTaskAssignee(task, user.id);
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
      return res.status(404).json({ error: 'Tâche introuvable' });
    }

    const isOwner = isTaskAssignee(task, req.user.id);
    const isAdmin = req.user.role === 'ADMIN';
    // DECLAREE reste caché aux autres employés, mais le propriétaire (proposeur) peut voir sa tâche « Non validée ».
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
      // Qui a créé la tâche : un admin l'a assignée, un employé l'a proposée.
      created_by: task.created_by,
      creator_name: task.creator_name,
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

// Transfère la tâche à UNE seule personne : remplace tous les assignés par elle. Admin uniquement.
async function reassignTask(req, res, next) {
  try {
    const task = await taskModel.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });

    const newAssigneeId = req.body.assigned_to;
    if (!newAssigneeId) return res.status(400).json({ error: 'assigned_to est requis' });
    const assignee = await userModel.findById(newAssigneeId);
    if (!assignee) return res.status(400).json({ error: 'Utilisateur assigné introuvable' });

    // Ferme les minuteurs en cours des anciens assignés (pas de minuteur fantôme).
    for (const a of task.assignees && task.assignees.length ? task.assignees : [{ id: task.assigned_to }]) {
      const s = await taskModel.findActiveSessionForTask(task.id, a.id);
      if (s) await taskModel.stopSession(s.id);
    }
    await taskModel.setAssignees(task.id, [newAssigneeId]);
    await taskModel.updateAssignee(task.id, newAssigneeId);
    // Une tâche déjà démarrée repart « À faire » pour que le nouvel arrivant commence proprement.
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

// Ajoute une personne à la tâche = même tâche PARTAGÉE (assignation multiple). Admin uniquement.
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

// Retire une personne de la tâche. On refuse de retirer la dernière (une tâche a ≥ 1 assigné).
// Si on retire l'assigné « principal », on bascule assigned_to vers un autre restant. Admin uniquement.
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

// Modifie une tâche existante (titre, description, priorité, échéance). Admin uniquement.
// On n'impose pas « échéance dans le futur » ici : une tâche déjà en retard doit pouvoir être éditée.
async function updateTask(req, res, next) {
  try {
    const task = await taskModel.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });

    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const { description, priority, deadline, start_date: startDate } = req.body;
    const isAdmin = req.user.role === 'ADMIN';
    const errors = [];
    if (!isValidTitle(title)) errors.push('Le titre est requis (moins de 255 caractères)');
    if (!isValidPriority(priority)) errors.push('Priorité invalide');
    if (!deadline) errors.push("L'échéance est requise");

    // Cohérence des dates : début ≤ échéance. Le début effectif = celui fourni (admin),
    // sinon celui déjà enregistré. On normalise en YYYY-MM-DD (composantes locales).
    const toYMD = (d) => {
      if (!d) return null;
      if (typeof d === 'string') return d.slice(0, 10);
      const dt = new Date(d);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    };
    const effectiveStart = isAdmin && startDate ? toYMD(startDate) : toYMD(task.start_date);
    if (effectiveStart && deadline && effectiveStart > toYMD(deadline)) {
      errors.push("La date de début ne peut pas être postérieure à l'échéance");
    }

    if (errors.length > 0) return res.status(400).json({ errors });

    const updated = await taskModel.updateTask(task.id, {
      title,
      description,
      priority,
      deadline,
      // Seul un admin fixe la date de début ; chaîne vide → on garde la valeur existante.
      startDate: isAdmin && startDate ? String(startDate) : undefined,
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

// Statuts qu'un admin peut poser à la main depuis la fiche (workflow visible par l'employé).
// DECLAREE est exclue : c'est l'état « proposition » (masqué à l'employé), pas un statut de travail.
const ADMIN_SETTABLE_STATUSES = [
  taskModel.TASK_STATUS.VALIDATED,
  taskModel.TASK_STATUS.IN_PROGRESS,
  taskModel.TASK_STATUS.DONE,
  taskModel.TASK_STATUS.CONFIRMED,
];

// Change le statut d'une tâche (admin) : À faire / En cours / Terminée / Confirmée.
// Effet de bord : en quittant « En cours », on ferme les chronos encore ouverts des assignés
// (pas de minuteur fantôme). Le changement est historisé + audité (l'audit rafraîchit aussi
// le dashboard temps réel via notification:new).
async function updateTaskStatus(req, res, next) {
  try {
    const task = await taskModel.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });

    const newStatus = req.body.status;
    if (!ADMIN_SETTABLE_STATUSES.includes(newStatus)) {
      return res.status(400).json({ error: 'Statut invalide' });
    }
    if (newStatus === task.status) {
      return res.status(200).json({ id: task.id, status: task.status });
    }

    await db.withTransaction(async (client) => {
      if (task.status === taskModel.TASK_STATUS.IN_PROGRESS) {
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
          details: { title: task.title, from: task.status, to: newStatus },
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
    detail.assignees = task.assignees || []; // liste complète des personnes (assignation multiple)
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

    // Liste des assignés : l'admin peut en mettre PLUSIEURS (assignee_ids, ou assigned_to seul) ;
    // un employé ne crée une tâche que pour lui-même. Le 1er est l'assigné « principal ».
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

    // Vérifie que chaque personne assignée existe.
    for (const uid of assigneeList) {
      // eslint-disable-next-line no-await-in-loop
      if (!(await userModel.findById(uid))) {
        return res.status(400).json({ error: 'Utilisateur assigné introuvable' });
      }
    }

    // list_id et parent_task_id sont optionnels (tâche "libre" hors hiérarchie)
    if (isAdmin && parentTaskId) {
      const parentTask = await taskModel.findById(parentTaskId);
      if (!parentTask) {
        return res.status(400).json({ error: 'Tâche parente introuvable' });
      }
    }

    // Une tâche admin est immédiatement disponible ; une proposition employé
    // attend l'approbation admin avant d'être visible et démarrable.
    const initialStatus = isAdmin ? taskModel.TASK_STATUS.VALIDATED : taskModel.TASK_STATUS.DECLARED;

    const task = await taskModel.create({
      title,
      description,
      assignedTo: targetAssignee,
      assigneeIds: assigneeList,
      createdBy: req.user.id,
      priority,
      deadline,
      // start_date et client sont désormais autorisés aussi pour une proposition d'employé
      // (mêmes champs que l'admin) ; l'admin valide/ajuste la proposition ensuite.
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
        created_as: isAdmin ? 'ADMIN' : 'EMPLOYEE_PROPOSAL',
        list_id: listId || null,
        parent_task_id: isAdmin ? parentTaskId || null : null,
        client_name: isAdmin ? clientName || null : null,
        client_email: isAdmin ? clientEmail || null : null,
      },
    });

    // Proposition d'employé (« Non validée ») : prévenir les admins par email qu'une tâche attend
    // validation. Best-effort — ne doit jamais faire échouer la création (email/base admin).
    if (!isAdmin) {
      Promise.all([userModel.findById(req.user.id).catch(() => null), userModel.findAdminEmails().catch(() => [])])
        .then(([proposer, adminEmails]) =>
          mailService.sendNewTaskProposalToAdmins(
            { id: task.id, title },
            proposer?.full_name || proposer?.username || null,
            adminEmails
          )
        )
        .catch(() => {});
    }

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
    // L'employé assigné OU un admin peut chronométrer la tâche (le total additionne les deux).
    if (!isTaskAssignee(task, req.user.id) && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Cette tâche ne vous est pas assignée' });
    }
    // VALIDEE/TERMINEE : premier démarrage ou redémarrage après complétion.
    // EN_COURS : reprise d'une tâche mise en pause (chrono arrêté mais tâche pas terminée).
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

      // L'admin peut chronométrer sans faire avancer le workflow de l'employé : on ne change
      // le statut (→ EN_COURS) que lorsque c'est l'employé assigné qui démarre.
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

// Tâche en cours de chronométrage par l'employé connecté (pour le widget « tâche en cours »).
async function getActiveTask(req, res, next) {
  try {
    const active = await taskModel.findActiveTaskForEmployee(req.user.id);
    res.status(200).json(active); // objet { task_id, title, start_time } ou null
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
      if (!task || !isTaskAssignee(task, req.user.id)) {
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
      return res.status(404).json({ error: 'Tâche introuvable' });
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
      return res.status(404).json({ error: 'Tâche introuvable' });
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

// Suppression définitive d'une tâche (admin uniquement). Supprime aussi ses sous-tâches,
// commentaires, chronos et pièces jointes (cascade BD). Le titre est conservé dans l'audit.
async function deleteTask(req, res, next) {
  try {
    const { id } = req.params;
    const task = await taskModel.findById(id);
    if (!task) {
      return res.status(404).json({ error: 'Tâche introuvable' });
    }

    await taskModel.deleteTask(id);

    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'DELETE_TASK',
      entityType: 'task',
      entityId: id,
      details: { title: task.title },
    });

    res.status(200).json({ deleted: true });
  } catch (err) {
    next(err);
  }
}

// Ajout manuel d'un temps de travail par l'admin (chrono oublié par l'employé). On enregistre
// une plage début→fin déjà terminée, attribuée à l'employé assigné à la tâche.
async function addManualTimelog(req, res, next) {
  try {
    const { id } = req.params;
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
    if (!task || !isTaskAssignee(task, req.user.id)) {
      return res.status(400).json({ error: 'Tâche invalide ou non assignée' });
    }
    // On ne demande que des tâches encore actionnables (pas déjà terminées/confirmées).
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

    // Prévenir les admins par email qu'une demande de tâche attend leur examen. Best-effort.
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
  getLateTasks,
  getAttachments,
  uploadAttachment,
  downloadAttachment,
  deleteAttachment,
  deleteTask,
  updateTask,
  updateTaskStatus,
  reassignTask,
  addTaskAssignee,
  removeTaskAssignee,
  addManualTimelog,
  getActiveTask,
};
