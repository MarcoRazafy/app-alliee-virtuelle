const db = require('../config/database');
const planningModel = require('../models/planning.model');
const planningDates = require('../utils/planningDates');

const ALL_AVAILABILITY_STATUSES = Object.values(planningDates.AVAILABILITY_STATUS);
const EMPLOYEE_AVAILABILITY_STATUSES = planningDates.EMPLOYEE_AVAILABILITY_STATUSES;

const WINDOW_CLOSED_MESSAGE =
  'La période de saisie du planning est fermée. Seul un administrateur peut modifier le planning pendant la semaine.';

const toDateString = planningDates.formatDbDate;

function validateDaysPayload(days, weekStartDate, { allowedStatuses }) {
  const errors = [];
  const weekDates = planningDates.getWeekDates(weekStartDate);

  if (!Array.isArray(days) || days.length !== 7) {
    errors.push('Les sept jours de la semaine sont requis.');
    return errors;
  }

  const providedDates = new Set();

  days.forEach((day) => {
    if (!day || typeof day.date !== 'string') {
      errors.push('Chaque jour doit avoir une date.');
      return;
    }
    if (!weekDates.includes(day.date)) {
      errors.push(`La date ${day.date} n'appartient pas à la semaine du planning.`);
      return;
    }
    providedDates.add(day.date);

    const dayLabel = planningDates.formatFrenchDayDate(day.date);

    if (!allowedStatuses.includes(day.availability_status)) {
      errors.push(`Statut de disponibilité invalide pour le ${dayLabel}.`);
      return;
    }

    const slots = Array.isArray(day.time_slots) ? day.time_slots : [];
    const isUnavailableStyle = ['UNAVAILABLE', 'LEAVE', 'SICK'].includes(day.availability_status);

    if (isUnavailableStyle) {
      if (slots.length > 0) {
        errors.push(`Une journée indisponible ne peut pas contenir de plage horaire (${dayLabel}).`);
      }
      return;
    }

    const sortedSlots = [...slots].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
    sortedSlots.forEach((slot, index) => {
      if (!slot.start_time || !slot.end_time) {
        errors.push(`Heure de début et de fin requises pour le ${dayLabel}.`);
        return;
      }
      if (slot.end_time <= slot.start_time) {
        errors.push(`L'heure de fin doit être postérieure à l'heure de début (${dayLabel}).`);
      }
      if (index > 0 && slot.start_time < sortedSlots[index - 1].end_time) {
        errors.push(`Deux plages horaires se chevauchent pour le ${dayLabel}.`);
      }
    });
  });

  if (providedDates.size !== 7) {
    errors.push('Les sept jours de la semaine sont requis.');
  }

  return errors;
}

function buildPlanningResponse({ planning, days, weekStart, weekEnd, now, forEmployee }) {
  const effectiveStatus = planningDates.computeEffectiveStatus({
    status: planning?.status || null,
    weekStartDateString: weekStart,
    referenceDateTime: now,
  });
  const { closesAt } = planningDates.getEditingWindowBounds(now);
  const canEdit = forEmployee ? planningDates.canEmployeeEditWeek(weekStart, now) : true;

  return {
    week_start_date: weekStart,
    week_end_date: weekEnd,
    planning: planning
      ? {
          id: planning.id,
          status: planning.status,
          general_note: planning.general_note,
          submitted_at: planning.submitted_at,
          locked_at: planning.locked_at,
          last_modified_by: planning.last_modified_by,
          last_modified_by_name: planning.last_modified_by_name || null,
          admin_modified_at: planning.admin_modified_at,
          last_admin_change_reason: planning.last_admin_change_reason,
          created_at: planning.created_at,
          updated_at: planning.updated_at,
        }
      : null,
    effective_status: effectiveStatus,
    can_edit: canEdit,
    editing_window_open: planningDates.isEmployeeWindowOpen(now),
    editing_window_closes_at: closesAt.toISO(),
    admin_modified: effectiveStatus === planningDates.PLANNING_STATUS.ADMIN_MODIFIED,
    days: days.map((day) => ({
      id: day.id,
      date: typeof day.planning_date === 'string' ? day.planning_date : toDateString(day.planning_date),
      availability_status: day.availability_status,
      note: day.note,
      time_slots: (day.time_slots || []).map((slot) => ({
        id: slot.id,
        start_time: slot.start_time,
        end_time: slot.end_time,
      })),
    })),
    total_hours: planningModel.computeTotalHours(days),
  };
}

// ---------- Employé ----------

async function getCurrentWeek(req, res, next) {
  try {
    const now = planningDates.nowInPlanningZone();
    const weekStartDT = planningDates.getCurrentWeekStart(now);
    const weekStart = planningDates.formatDate(weekStartDT);
    const weekEnd = planningDates.formatDate(planningDates.getWeekEnd(weekStartDT));

    const planning = await planningModel.findPlanningByUserAndWeek(req.user.id, weekStart);
    const days = planning ? await planningModel.findDaysWithSlots(planning.id) : planningModel.buildEmptyWeekDays(weekStart);

    res.status(200).json(buildPlanningResponse({ planning, days, weekStart, weekEnd, now, forEmployee: true }));
  } catch (err) {
    next(err);
  }
}

async function getNextWeek(req, res, next) {
  try {
    const now = planningDates.nowInPlanningZone();
    const weekStartDT = planningDates.getNextWeekStart(now);
    const weekStart = planningDates.formatDate(weekStartDT);
    const weekEnd = planningDates.formatDate(planningDates.getWeekEnd(weekStartDT));

    const planning = await planningModel.findPlanningByUserAndWeek(req.user.id, weekStart);
    const days = planning ? await planningModel.findDaysWithSlots(planning.id) : planningModel.buildEmptyWeekDays(weekStart);

    res.status(200).json(buildPlanningResponse({ planning, days, weekStart, weekEnd, now, forEmployee: true }));
  } catch (err) {
    next(err);
  }
}

// Filtrage par semaine (consultation) : n'importe quelle semaine passée, actuelle ou future
// de l'employé connecté. Toujours en lecture — can_edit reste calculé par canEmployeeEditWeek,
// donc seule la "vraie" semaine prochaine pourra ressortir modifiable, sans logique dupliquée.
async function getWeekByDate(req, res, next) {
  try {
    const { week_start_date: requestedDate } = req.query;
    if (!requestedDate) {
      return res.status(400).json({ error: 'Le paramètre week_start_date est requis.' });
    }

    const now = planningDates.nowInPlanningZone();
    const weekStartDT = planningDates.getCurrentWeekStart(planningDates.parsePlanningDate(requestedDate));
    const weekStart = planningDates.formatDate(weekStartDT);
    const weekEnd = planningDates.formatDate(planningDates.getWeekEnd(weekStartDT));

    const planning = await planningModel.findPlanningByUserAndWeek(req.user.id, weekStart);
    const days = planning ? await planningModel.findDaysWithSlots(planning.id) : planningModel.buildEmptyWeekDays(weekStart);

    res.status(200).json(buildPlanningResponse({ planning, days, weekStart, weekEnd, now, forEmployee: true }));
  } catch (err) {
    next(err);
  }
}

async function createNextWeekPlanning(req, res, next) {
  try {
    const now = planningDates.nowInPlanningZone();
    const weekStartDT = planningDates.getNextWeekStart(now);
    const weekStart = planningDates.formatDate(weekStartDT);
    const weekEnd = planningDates.formatDate(planningDates.getWeekEnd(weekStartDT));

    if (!planningDates.canEmployeeEditWeek(weekStart, now)) {
      return res.status(403).json({ error: WINDOW_CLOSED_MESSAGE });
    }

    const existing = await planningModel.findPlanningByUserAndWeek(req.user.id, weekStart);
    if (existing) {
      return res.status(409).json({ error: 'Un planning existe déjà pour cette semaine.' });
    }

    const planning = await planningModel.createPlanning({ userId: req.user.id, weekStartDate: weekStart, weekEndDate: weekEnd });
    await planningModel.recordPlanningHistory(db, {
      planningId: planning.id,
      action: 'CREATE_WEEKLY_PLANNING',
      oldValue: null,
      newValue: { status: planning.status },
      changedBy: req.user.id,
      changeReason: null,
    });
    await planningModel.recordAudit({
      userId: req.user.id,
      action: 'CREATE_WEEKLY_PLANNING',
      entityType: 'weekly_planning',
      entityId: planning.id,
      details: { week_start_date: weekStart },
    });

    const days = planningModel.buildEmptyWeekDays(weekStart);
    res.status(201).json(buildPlanningResponse({ planning, days, weekStart, weekEnd, now, forEmployee: true }));
  } catch (err) {
    next(err);
  }
}

async function updateNextWeekPlanning(req, res, next) {
  try {
    const now = planningDates.nowInPlanningZone();
    const weekStartDT = planningDates.getNextWeekStart(now);
    const weekStart = planningDates.formatDate(weekStartDT);
    const weekEnd = planningDates.formatDate(planningDates.getWeekEnd(weekStartDT));

    if (!planningDates.canEmployeeEditWeek(weekStart, now)) {
      return res.status(403).json({ error: WINDOW_CLOSED_MESSAGE });
    }

    const { general_note: generalNote, days } = req.body;
    const errors = validateDaysPayload(days, weekStart, { allowedStatuses: EMPLOYEE_AVAILABILITY_STATUSES });
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    const updatedPlanning = await db.withTransaction(async (client) => {
      let planning = await planningModel.findPlanningByUserAndWeek(req.user.id, weekStart, client);
      if (!planning) {
        planning = await planningModel.createPlanning({ userId: req.user.id, weekStartDate: weekStart, weekEndDate: weekEnd }, client);
      }

      const before = await planningModel.fullSnapshot(planning.id, client);
      const wasSubmitted = planning.status === planningDates.PLANNING_STATUS.SUBMITTED;

      await planningModel.replacePlanningDays(client, planning.id, days);

      const metaUpdates = { general_note: generalNote ?? null };
      if (wasSubmitted) {
        // Règle métier §6 : modifier un planning déjà soumis le repasse en brouillon.
        metaUpdates.status = planningDates.PLANNING_STATUS.DRAFT;
        metaUpdates.submitted_at = null;
      }
      const result = await planningModel.updatePlanningMeta(client, planning.id, metaUpdates);

      const after = await planningModel.fullSnapshot(planning.id, client);
      await planningModel.recordPlanningHistory(client, {
        planningId: planning.id,
        action: 'UPDATE_WEEKLY_PLANNING',
        oldValue: before,
        newValue: after,
        changedBy: req.user.id,
        changeReason: null,
      });

      return result;
    });

    await planningModel.recordAudit({
      userId: req.user.id,
      action: 'UPDATE_WEEKLY_PLANNING',
      entityType: 'weekly_planning',
      entityId: updatedPlanning.id,
      details: { week_start_date: weekStart },
    });

    const daysWithSlots = await planningModel.findDaysWithSlots(updatedPlanning.id);
    res
      .status(200)
      .json(buildPlanningResponse({ planning: updatedPlanning, days: daysWithSlots, weekStart, weekEnd, now, forEmployee: true }));
  } catch (err) {
    next(err);
  }
}

async function submitNextWeekPlanning(req, res, next) {
  try {
    const now = planningDates.nowInPlanningZone();
    const weekStartDT = planningDates.getNextWeekStart(now);
    const weekStart = planningDates.formatDate(weekStartDT);
    const weekEnd = planningDates.formatDate(planningDates.getWeekEnd(weekStartDT));

    if (!planningDates.canEmployeeEditWeek(weekStart, now)) {
      return res.status(403).json({ error: WINDOW_CLOSED_MESSAGE });
    }

    const planning = await planningModel.findPlanningByUserAndWeek(req.user.id, weekStart);
    if (!planning) {
      return res.status(404).json({ error: 'Planning introuvable.' });
    }

    const days = await planningModel.findDaysWithSlots(planning.id);
    if (days.length !== 7 || days.some((day) => !day.availability_status)) {
      return res
        .status(400)
        .json({ error: 'Les sept jours de la semaine doivent être renseignés avant de soumettre le planning.' });
    }

    const updatedPlanning = await db.withTransaction(async (client) => {
      const before = { status: planning.status, submitted_at: planning.submitted_at };
      const result = await planningModel.updatePlanningMeta(client, planning.id, {
        status: planningDates.PLANNING_STATUS.SUBMITTED,
        submitted_at: new Date().toISOString(),
      });
      await planningModel.recordPlanningHistory(client, {
        planningId: planning.id,
        action: 'SUBMIT_WEEKLY_PLANNING',
        oldValue: before,
        newValue: { status: result.status, submitted_at: result.submitted_at },
        changedBy: req.user.id,
        changeReason: null,
      });
      return result;
    });

    await planningModel.recordAudit({
      userId: req.user.id,
      action: 'SUBMIT_WEEKLY_PLANNING',
      entityType: 'weekly_planning',
      entityId: planning.id,
      details: { week_start_date: weekStart },
    });

    res
      .status(200)
      .json(buildPlanningResponse({ planning: updatedPlanning, days, weekStart, weekEnd, now, forEmployee: true }));
  } catch (err) {
    next(err);
  }
}

async function getMyPlanningHistory(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const history = await planningModel.findEmployeeHistory(req.user.id, { page, limit });
    res.status(200).json(history);
  } catch (err) {
    next(err);
  }
}

// Filtrage par semaine (liste) : reprend le même modèle que l'admin (listPlanningsForAdmin)
// mais forcé sur l'utilisateur connecté — aucune logique de filtre dupliquée.
async function getMyPlannings(req, res, next) {
  try {
    const now = planningDates.nowInPlanningZone();
    const { week_start_date: weekStartDate, status, submitted } = req.query;

    const rows = await planningModel.listPlanningsForAdmin({
      userId: req.user.id,
      weekStartDate,
      status,
      submitted,
    });

    const items = rows.map((row) => {
      const rowWeekStart = toDateString(row.week_start_date);
      return {
        planning_id: row.planning_id,
        week_start_date: rowWeekStart,
        week_end_date: toDateString(row.week_end_date),
        status: row.status,
        effective_status: planningDates.computeEffectiveStatus({
          status: row.status,
          weekStartDateString: rowWeekStart,
          referenceDateTime: now,
        }),
        submitted_at: row.submitted_at,
        is_submitted: !!row.submitted_at,
        updated_at: row.updated_at,
        admin_modified_at: row.admin_modified_at,
        total_hours: Math.round(Number(row.total_hours) * 100) / 100,
      };
    });

    res.status(200).json(items);
  } catch (err) {
    next(err);
  }
}

// ---------- Administrateur ----------

async function adminListPlannings(req, res, next) {
  try {
    const now = planningDates.nowInPlanningZone();
    const { week_start_date: weekStartDate, user_id: userId, status, search, availability_status: availabilityStatus, submitted } =
      req.query;

    const rows = await planningModel.listPlanningsForAdmin({ weekStartDate, userId, status, search, availabilityStatus, submitted });

    const items = rows.map((row) => {
      const rowWeekStart = toDateString(row.week_start_date);
      return {
        planning_id: row.planning_id,
        user_id: row.user_id,
        full_name: row.full_name,
        position: row.position,
        week_start_date: rowWeekStart,
        week_end_date: toDateString(row.week_end_date),
        status: row.status,
        effective_status: planningDates.computeEffectiveStatus({
          status: row.status,
          weekStartDateString: rowWeekStart,
          referenceDateTime: now,
        }),
        submitted_at: row.submitted_at,
        is_submitted: !!row.submitted_at,
        updated_at: row.updated_at,
        last_modified_by_name: row.last_modified_by_name,
        admin_modified_at: row.admin_modified_at,
        last_admin_change_reason: row.last_admin_change_reason,
        total_hours: Math.round(Number(row.total_hours) * 100) / 100,
      };
    });

    res.status(200).json(items);
  } catch (err) {
    next(err);
  }
}

async function adminGetPlanningSummary(req, res, next) {
  try {
    const { week_start_date: weekStartDate } = req.query;
    const now = planningDates.nowInPlanningZone();
    const today = planningDates.formatDate(now);
    const weekStart = weekStartDate || planningDates.formatDate(planningDates.getNextWeekStart(now));

    const [activeEmployees, submittedCount, availableToday] = await Promise.all([
      planningModel.countActiveEmployees(),
      planningModel.countSubmittedForWeek(weekStart),
      planningModel.countAvailableToday(today),
    ]);

    res.status(200).json({
      active_employees: activeEmployees,
      submitted_count: submittedCount,
      not_submitted_count: Math.max(0, activeEmployees - submittedCount),
      available_today: availableToday,
      week_start_date: weekStart,
    });
  } catch (err) {
    next(err);
  }
}

async function adminGetPlanningDetail(req, res, next) {
  try {
    const { planningId } = req.params;
    const planning = await planningModel.findPlanningById(planningId);
    if (!planning) {
      return res.status(404).json({ error: 'Planning introuvable.' });
    }

    const weekStart = toDateString(planning.week_start_date);
    const weekEnd = toDateString(planning.week_end_date);
    const existingDays = await planningModel.findDaysWithSlots(planning.id);
    // Un planning tout juste créé par un admin (POST /planning/admin) n'a encore aucune
    // ligne planning_days : on retombe sur le squelette vide des 7 jours, comme côté employé.
    const days = existingDays.length > 0 ? existingDays : planningModel.buildEmptyWeekDays(weekStart);
    const now = planningDates.nowInPlanningZone();

    const response = buildPlanningResponse({ planning, days, weekStart, weekEnd, now, forEmployee: false });
    response.user = { id: planning.user_id, full_name: planning.user_full_name, position: planning.user_position };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

async function adminUpdatePlanning(req, res, next) {
  try {
    const { planningId } = req.params;
    const { change_reason: changeReason, general_note: generalNote, days } = req.body;

    if (!changeReason || !changeReason.trim()) {
      return res.status(400).json({ error: 'Le motif de la modification est obligatoire.' });
    }

    const planning = await planningModel.findPlanningById(planningId);
    if (!planning) {
      return res.status(404).json({ error: 'Planning introuvable.' });
    }

    const weekStart = toDateString(planning.week_start_date);
    const weekEnd = toDateString(planning.week_end_date);
    const errors = validateDaysPayload(days, weekStart, { allowedStatuses: ALL_AVAILABILITY_STATUSES });
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    const trimmedReason = changeReason.trim();

    const updatedPlanning = await db.withTransaction(async (client) => {
      const before = await planningModel.fullSnapshot(planning.id, client);

      await planningModel.replacePlanningDays(client, planning.id, days);

      const nowIso = new Date().toISOString();
      const result = await planningModel.updatePlanningMeta(client, planning.id, {
        general_note: generalNote ?? null,
        status: planningDates.PLANNING_STATUS.ADMIN_MODIFIED,
        last_modified_by: req.user.id,
        admin_modified_at: nowIso,
        last_admin_change_reason: trimmedReason,
      });

      const after = await planningModel.fullSnapshot(planning.id, client);
      await planningModel.recordPlanningHistory(client, {
        planningId: planning.id,
        action: 'ADMIN_UPDATE_WEEKLY_PLANNING',
        oldValue: before,
        newValue: after,
        changedBy: req.user.id,
        changeReason: trimmedReason,
      });

      return result;
    });

    await planningModel.recordAudit({
      userId: req.user.id,
      action: 'ADMIN_UPDATE_WEEKLY_PLANNING',
      entityType: 'weekly_planning',
      entityId: planning.id,
      details: { target_user_id: planning.user_id, week_start_date: weekStart, change_reason: trimmedReason },
    });

    const daysWithSlots = await planningModel.findDaysWithSlots(planning.id);
    const now = planningDates.nowInPlanningZone();
    const response = buildPlanningResponse({
      planning: { ...updatedPlanning, last_modified_by_name: req.user.full_name },
      days: daysWithSlots,
      weekStart,
      weekEnd,
      now,
      forEmployee: false,
    });
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

async function adminCreatePlanningForUser(req, res, next) {
  try {
    const { user_id: userId, week_start_date: weekStartDate } = req.body;
    if (!userId || !weekStartDate) {
      return res.status(400).json({ error: 'user_id et week_start_date sont requis.' });
    }

    const existing = await planningModel.findPlanningByUserAndWeek(userId, weekStartDate);
    if (existing) {
      return res.status(409).json({ error: 'Un planning existe déjà pour cette semaine.' });
    }

    const weekEnd = planningDates.formatDate(planningDates.getWeekEnd(planningDates.parsePlanningDate(weekStartDate)));
    const planning = await planningModel.createPlanning({ userId, weekStartDate, weekEndDate: weekEnd });

    await planningModel.recordPlanningHistory(db, {
      planningId: planning.id,
      action: 'CREATE_WEEKLY_PLANNING',
      oldValue: null,
      newValue: { status: planning.status },
      changedBy: req.user.id,
      changeReason: null,
    });
    await planningModel.recordAudit({
      userId: req.user.id,
      action: 'CREATE_WEEKLY_PLANNING',
      entityType: 'weekly_planning',
      entityId: planning.id,
      details: { target_user_id: userId, week_start_date: weekStartDate, created_by_admin: true },
    });

    res.status(201).json({ planning_id: planning.id });
  } catch (err) {
    next(err);
  }
}

async function adminNonSubmitted(req, res, next) {
  try {
    const { week_start_date: weekStartDate } = req.query;
    if (!weekStartDate) {
      return res.status(400).json({ error: 'Le paramètre week_start_date est requis.' });
    }
    const employees = await planningModel.findNonSubmittedEmployees(weekStartDate);
    res.status(200).json(employees);
  } catch (err) {
    next(err);
  }
}

async function adminAvailabilitySearch(req, res, next) {
  try {
    const { date, start_time: startTime, end_time: endTime } = req.query;
    if (!date || !startTime || !endTime) {
      return res.status(400).json({ error: 'Les paramètres date, start_time et end_time sont requis.' });
    }
    if (endTime <= startTime) {
      return res.status(400).json({ error: "L'heure de fin doit être postérieure à l'heure de début." });
    }
    const employees = await planningModel.findAvailableEmployees({ date, startTime, endTime });
    res.status(200).json(employees);
  } catch (err) {
    next(err);
  }
}

async function adminPlanningHistory(req, res, next) {
  try {
    const { planningId } = req.params;
    const planning = await planningModel.findPlanningById(planningId);
    if (!planning) {
      return res.status(404).json({ error: 'Planning introuvable.' });
    }
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const history = await planningModel.findPlanningHistory(planningId, { page, limit });
    res.status(200).json(history);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getCurrentWeek,
  getNextWeek,
  getWeekByDate,
  createNextWeekPlanning,
  updateNextWeekPlanning,
  submitNextWeekPlanning,
  getMyPlanningHistory,
  getMyPlannings,
  adminListPlannings,
  adminGetPlanningSummary,
  adminGetPlanningDetail,
  adminUpdatePlanning,
  adminCreatePlanningForUser,
  adminNonSubmitted,
  adminAvailabilitySearch,
  adminPlanningHistory,
};
