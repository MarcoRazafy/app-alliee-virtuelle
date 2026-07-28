const { DateTime } = require('luxon');
const db = require('../config/database');
const planningModel = require('../models/planning.model');
const sessionModel = require('../models/session.model');
const userModel = require('../models/user.model');
const planningDates = require('../utils/planningDates');
const { computeAttendanceMetrics } = require('../utils/attendanceMetrics');

const ALL_AVAILABILITY_STATUSES = Object.values(planningDates.AVAILABILITY_STATUS);
const EMPLOYEE_AVAILABILITY_STATUSES = planningDates.EMPLOYEE_AVAILABILITY_STATUSES;

const WINDOW_CLOSED_MESSAGE =
  'The schedule entry period is closed. Only an administrator can modify the schedule during the week.';

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
      errors.push(`Date ${day.date} does not belong to the schedule week.`);
      return;
    }
    providedDates.add(day.date);

    const dayLabel = planningDates.formatFrenchDayDate(day.date);

    if (!allowedStatuses.includes(day.availability_status)) {
      errors.push(`Invalid availability status for ${dayLabel}.`);
      return;
    }

    const slots = Array.isArray(day.time_slots) ? day.time_slots : [];
    const isUnavailableStyle = ['UNAVAILABLE', 'LEAVE', 'SICK'].includes(day.availability_status);

    if (isUnavailableStyle) {
      if (slots.length > 0) {
        errors.push(`An unavailable day cannot contain a time slot (${dayLabel}).`);
      }
      return;
    }

    const sortedSlots = [...slots].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
    sortedSlots.forEach((slot, index) => {
      if (!slot.start_time || !slot.end_time) {
        errors.push(`Start and end time required for ${dayLabel}.`);
        return;
      }
      if (slot.end_time <= slot.start_time) {
        errors.push(`The end time must be after the start time (${dayLabel}).`);
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

// Statuts d'un planning qui comptent comme "déjà soumis" (donc plus éligibles au rattrapage
// de la semaine en cours).
const SUBMITTED_LIKE_STATUSES = [
  planningDates.PLANNING_STATUS.SUBMITTED,
  planningDates.PLANNING_STATUS.LOCKED,
  planningDates.PLANNING_STATUS.ADMIN_MODIFIED,
];

// Contexte nécessaire à la règle de rattrapage : l'employé a-t-il déjà un planning pour la
// semaine prochaine, et sa semaine en cours est-elle déjà soumise ? (2 lectures légères)
async function employeeEditContext(userId, now, client = db) {
  const currentWeekStart = planningDates.formatDate(planningDates.getCurrentWeekStart(now));
  const nextWeekStart = planningDates.formatDate(planningDates.getNextWeekStart(now));
  const [current, nextPlanning] = await Promise.all([
    planningModel.findPlanningByUserAndWeek(userId, currentWeekStart, client),
    planningModel.findPlanningByUserAndWeek(userId, nextWeekStart, client),
  ]);
  return {
    hasNextWeekPlanning: Boolean(nextPlanning),
    currentWeekSubmitted: Boolean(current) && SUBMITTED_LIKE_STATUSES.includes(current.status),
  };
}

function buildPlanningResponse({ planning, days, weekStart, weekEnd, now, forEmployee, editContext = {} }) {
  const effectiveStatus = planningDates.computeEffectiveStatus({
    status: planning?.status || null,
    weekStartDateString: weekStart,
    referenceDateTime: now,
  });
  const { closesAt } = planningDates.getEditingWindowBounds(now);
  const canEdit = forEmployee ? planningDates.canEmployeeEditWeek(weekStart, now, editContext) : true;

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
    const editContext = await employeeEditContext(req.user.id, now);

    res.status(200).json(buildPlanningResponse({ planning, days, weekStart, weekEnd, now, forEmployee: true, editContext }));
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
    const editContext = await employeeEditContext(req.user.id, now);

    res.status(200).json(buildPlanningResponse({ planning, days, weekStart, weekEnd, now, forEmployee: true, editContext }));
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
      return res.status(400).json({ error: 'The week_start_date parameter is required.' });
    }

    const now = planningDates.nowInPlanningZone();
    const weekStartDT = planningDates.getCurrentWeekStart(planningDates.parsePlanningDate(requestedDate));
    const weekStart = planningDates.formatDate(weekStartDT);
    const weekEnd = planningDates.formatDate(planningDates.getWeekEnd(weekStartDT));

    const planning = await planningModel.findPlanningByUserAndWeek(req.user.id, weekStart);
    const days = planning ? await planningModel.findDaysWithSlots(planning.id) : planningModel.buildEmptyWeekDays(weekStart);
    const editContext = await employeeEditContext(req.user.id, now);

    res.status(200).json(buildPlanningResponse({ planning, days, weekStart, weekEnd, now, forEmployee: true, editContext }));
  } catch (err) {
    next(err);
  }
}

// Semaine ciblée par une écriture employé : 'next' (préparation normale) ou 'current' (rattrapage).
function planningWeekBounds(weekMode, now) {
  const weekStartDT = weekMode === 'current' ? planningDates.getCurrentWeekStart(now) : planningDates.getNextWeekStart(now);
  return {
    weekStart: planningDates.formatDate(weekStartDT),
    weekEnd: planningDates.formatDate(planningDates.getWeekEnd(weekStartDT)),
  };
}

function makeCreatePlanning(weekMode) {
  return async function createPlanningHandler(req, res, next) {
    try {
      const now = planningDates.nowInPlanningZone();
      const { weekStart, weekEnd } = planningWeekBounds(weekMode, now);

      const editContext = await employeeEditContext(req.user.id, now);
      if (!planningDates.canEmployeeEditWeek(weekStart, now, editContext)) {
        return res.status(403).json({ error: WINDOW_CLOSED_MESSAGE });
      }

      const existing = await planningModel.findPlanningByUserAndWeek(req.user.id, weekStart);
      if (existing) {
        return res.status(409).json({ error: 'A schedule already exists for this week.' });
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
      const responseContext = await employeeEditContext(req.user.id, now);
      res.status(201).json(buildPlanningResponse({ planning, days, weekStart, weekEnd, now, forEmployee: true, editContext: responseContext }));
    } catch (err) {
      next(err);
    }
  };
}

function makeUpdatePlanning(weekMode) {
  return async function updatePlanningHandler(req, res, next) {
    try {
      const now = planningDates.nowInPlanningZone();
      const { weekStart, weekEnd } = planningWeekBounds(weekMode, now);

      const editContext = await employeeEditContext(req.user.id, now);
      if (!planningDates.canEmployeeEditWeek(weekStart, now, editContext)) {
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
      const responseContext = await employeeEditContext(req.user.id, now);
      res
        .status(200)
        .json(buildPlanningResponse({ planning: updatedPlanning, days: daysWithSlots, weekStart, weekEnd, now, forEmployee: true, editContext: responseContext }));
    } catch (err) {
      next(err);
    }
  };
}

function makeSubmitPlanning(weekMode) {
  return async function submitPlanningHandler(req, res, next) {
    try {
      const now = planningDates.nowInPlanningZone();
      const { weekStart, weekEnd } = planningWeekBounds(weekMode, now);

      const editContext = await employeeEditContext(req.user.id, now);
      if (!planningDates.canEmployeeEditWeek(weekStart, now, editContext)) {
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
          .json({ error: 'All seven days of the week must be filled in before submitting the schedule.' });
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

      const responseContext = await employeeEditContext(req.user.id, now);
      res
        .status(200)
        .json(buildPlanningResponse({ planning: updatedPlanning, days, weekStart, weekEnd, now, forEmployee: true, editContext: responseContext }));
    } catch (err) {
      next(err);
    }
  };
}

// Semaine prochaine (préparation normale) + semaine en cours (rattrapage) partagent la même logique.
const createNextWeekPlanning = makeCreatePlanning('next');
const updateNextWeekPlanning = makeUpdatePlanning('next');
const submitNextWeekPlanning = makeSubmitPlanning('next');
const createCurrentWeekPlanning = makeCreatePlanning('current');
const updateCurrentWeekPlanning = makeUpdatePlanning('current');
const submitCurrentWeekPlanning = makeSubmitPlanning('current');

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

    // Le motif est désormais facultatif : une modification peut être enregistrée sans motif.
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

    const trimmedReason = changeReason && changeReason.trim() ? changeReason.trim() : null;

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
      return res.status(409).json({ error: 'A schedule already exists for this week.' });
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
      return res.status(400).json({ error: 'The week_start_date parameter is required.' });
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
      return res.status(400).json({ error: 'The date, start_time and end_time parameters are required.' });
    }
    if (endTime <= startTime) {
      return res.status(400).json({ error: 'The end time must be after the start time.' });
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

// ---------- Présence : croise le planning déclaré du jour avec les sessions de connexion réelles ----------

const ATTENDANCE_HAS_SLOTS = ['AVAILABLE', 'PARTIALLY_AVAILABLE'];
const MANUAL_ATTENDANCE_STATUSES = new Set(['present', 'late', 'absent']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hmToMin(hm) {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

function elapsedMinutesForDate(dateString, now) {
  const todayString = planningDates.formatDate(now);
  if (dateString < todayString) return 24 * 60;
  if (dateString > todayString) return 0;
  return now.hour * 60 + now.minute + now.second / 60;
}

function buildAttendanceResult({ employee, planning, sessionRows, override, dateString, dayStart, now }) {
  const availabilityStatus = planning ? planning.availability_status : null;
  const scheduled = availabilityStatus != null && ATTENDANCE_HAS_SLOTS.includes(availabilityStatus);
  const slots = ((planning && planning.slots) || []).map((slot) => ({
    start: hmToMin(slot.start),
    end: hmToMin(slot.end),
  }));
  const plannedStart = slots.length ? Math.min(...slots.map((slot) => slot.start)) : null;
  const toMin = (dateTime) => dateTime.diff(dayStart, 'minutes').minutes;

  const intervals = (sessionRows || [])
    .map((session) => {
      const login = DateTime.fromJSDate(session.login_at, { zone: planningDates.PLANNING_TIMEZONE });
      const effectiveLogout = DateTime.fromJSDate(session.effective_logout_at, {
        zone: planningDates.PLANNING_TIMEZONE,
      });
      return {
        start: Math.max(0, toMin(login)),
        end: Math.min(24 * 60, toMin(effectiveLogout)),
        isLive: Boolean(session.is_live),
      };
    })
    .filter((interval) => interval.end > interval.start);

  const metrics = computeAttendanceMetrics({
    slots: scheduled ? slots : [],
    sessions: intervals,
    elapsedLimit: elapsedMinutesForDate(dateString, now),
  });
  const automaticStatus = metrics.status;
  const finalStatus = override?.status || automaticStatus;
  const lateMinutes = override
    ? override.status === 'late'
      ? Number(override.late_minutes) || 0
      : 0
    : automaticStatus === 'late'
      ? Math.round(metrics.delayMinutes)
      : 0;

  return {
    id: employee.id,
    full_name: employee.full_name,
    position: employee.position,
    has_avatar: employee.has_avatar,
    date: dateString,
    availability_status: availabilityStatus,
    scheduled,
    calculated_presence_status: automaticStatus,
    presence_status: finalStatus,
    manual_correction: override
      ? {
          id: override.id,
          status: override.status,
          late_minutes: Number(override.late_minutes) || 0,
          reason: override.reason || null,
          corrected_by: override.corrected_by,
          corrected_by_name: override.corrected_by_name || null,
          corrected_at: override.corrected_at,
        }
      : null,
    accomplishment:
      scheduled && !['upcoming', 'waiting'].includes(automaticStatus) ? metrics.accomplishment : null,
    planned_minutes: Math.round(metrics.plannedMinutes),
    connected_minutes: Math.round(metrics.connectedMinutes),
    covered_minutes: Math.round(metrics.coveredMinutes),
    missed_minutes: Math.round(metrics.missedMinutes),
    outside_minutes: Math.round(metrics.outsideMinutes),
    planned_start: minToHm(plannedStart),
    first_login: minToHm(metrics.firstConnection),
    late_minutes: lateMinutes,
    is_connected_now: metrics.isLive,
  };
}

function minToHm(min) {
  if (min == null) return null;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

async function adminAttendance(req, res, next) {
  try {
    const dateString = req.query.date || planningDates.formatDate(planningDates.nowInPlanningZone());
    const employees = await planningModel.findActiveEmployees();
    const userIds = employees.map((e) => e.id);

    const dayStart = planningDates.parsePlanningDate(dateString);
    if (!dayStart.isValid) {
      return res.status(400).json({ error: 'La date doit respecter le format YYYY-MM-DD.' });
    }
    const dayEnd = dayStart.plus({ days: 1 });
    const now = planningDates.nowInPlanningZone();
    await sessionModel.expireStaleSessions();
    const [planningRows, sessionRows, overrideRows] = await Promise.all([
      planningModel.findDayAvailabilityByUserForDate(dateString),
      sessionModel.findSessionsForUsersOverlapping(userIds, dayStart.toISO(), dayEnd.toISO()),
      planningModel.findAttendanceOverridesForDate(dateString),
    ]);

    const planningByUser = new Map(planningRows.map((r) => [r.user_id, r]));
    const sessionsByUser = new Map();
    sessionRows.forEach((s) => {
      if (!sessionsByUser.has(s.user_id)) sessionsByUser.set(s.user_id, []);
      sessionsByUser.get(s.user_id).push(s);
    });
    const overridesByUser = new Map(overrideRows.map((row) => [row.user_id, row]));

    const results = employees.map((employee) =>
      buildAttendanceResult({
        employee,
        planning: planningByUser.get(employee.id),
        sessionRows: sessionsByUser.get(employee.id) || [],
        override: overridesByUser.get(employee.id),
        dateString,
        dayStart,
        now,
      })
    );

    const assessedResults = results.filter(
      (result) => result.scheduled && !['upcoming', 'waiting'].includes(result.presence_status)
    );
    const summary = {
      total: results.length,
      present: results.filter((r) => r.presence_status === 'present').length,
      late: results.filter((r) => r.presence_status === 'late').length,
      partial: results.filter((r) => r.presence_status === 'partial').length,
      outside: results.filter((r) => r.presence_status === 'outside').length,
      absent: results.filter((r) => r.presence_status === 'absent').length,
      pending: results.filter((r) => ['upcoming', 'waiting'].includes(r.presence_status)).length,
      off: results.filter((r) => r.presence_status === 'off').length,
      avg_accomplishment: assessedResults.length
        ? Math.round(assessedResults.reduce((a, r) => a + (r.accomplishment || 0), 0) / assessedResults.length)
        : null,
    };

    res.status(200).json({ date: dateString, summary, employees: results });
  } catch (err) {
    next(err);
  }
}

async function adminSetAttendanceOverride(req, res, next) {
  try {
    const { userId } = req.params;
    const { date, status, late_minutes: requestedLateMinutes, reason } = req.body || {};
    if (!UUID_PATTERN.test(userId)) {
      return res.status(400).json({ error: 'Invalid employee identifier.' });
    }
    const day = planningDates.parsePlanningDate(date);
    if (!date || !day.isValid || planningDates.formatDate(day) !== date) {
      return res.status(400).json({ error: 'La date doit respecter le format YYYY-MM-DD.' });
    }
    if (date > planningDates.formatDate(planningDates.nowInPlanningZone())) {
      return res.status(400).json({ error: 'Future attendance cannot be corrected.' });
    }

    const employee = await userModel.findById(userId);
    if (!employee || employee.role !== userModel.USER_ROLE.EMPLOYEE) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    if (status == null || status === 'automatic') {
      const removed = await db.withTransaction(async (client) => {
        const deleted = await planningModel.deleteAttendanceOverride(userId, date, client);
        await planningModel.recordAudit(
          {
            userId: req.user.id,
            action: 'RESET_ATTENDANCE_OVERRIDE',
            entityType: 'attendance_override',
            entityId: userId,
            details: { employee_id: userId, date, previous: deleted },
          },
          client
        );
        return deleted;
      });
      return res.status(200).json({ automatic: true, removed: Boolean(removed) });
    }

    if (!MANUAL_ATTENDANCE_STATUSES.has(status)) {
      return res.status(400).json({ error: 'The status must be present, late, absent or automatic.' });
    }
    const lateMinutes = status === 'late' ? Number(requestedLateMinutes) : 0;
    if (status === 'late' && (!Number.isInteger(lateMinutes) || lateMinutes < 1 || lateMinutes > 1440)) {
      return res.status(400).json({ error: 'The number of minutes late must be between 1 and 1440.' });
    }
    const normalizedReason = typeof reason === 'string' ? reason.trim() : '';
    if (normalizedReason.length > 500) {
      return res.status(400).json({ error: 'The reason cannot exceed 500 characters.' });
    }

    const correction = await db.withTransaction(async (client) => {
      const updated = await planningModel.upsertAttendanceOverride(
        {
          userId,
          date,
          status,
          lateMinutes,
          reason: normalizedReason,
          correctedBy: req.user.id,
        },
        client
      );
      await planningModel.recordAudit(
        {
          userId: req.user.id,
          action: 'SET_ATTENDANCE_OVERRIDE',
          entityType: 'attendance_override',
          entityId: userId,
          details: { employee_id: userId, date, status, late_minutes: lateMinutes, reason: normalizedReason || null },
        },
        client
      );
      return updated;
    });
    res.status(200).json(correction);
  } catch (err) {
    next(err);
  }
}

async function adminAttendanceStats(req, res, next) {
  try {
    const { userId } = req.params;
    const month = req.query.month || planningDates.formatDate(planningDates.nowInPlanningZone()).slice(0, 7);
    if (!UUID_PATTERN.test(userId)) {
      return res.status(400).json({ error: 'Invalid employee identifier.' });
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({ error: 'Le mois doit respecter le format YYYY-MM.' });
    }

    const employee = await userModel.findById(userId);
    if (!employee || employee.role !== userModel.USER_ROLE.EMPLOYEE) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    const monthStart = planningDates.parsePlanningDate(`${month}-01`);
    const monthEnd = monthStart.plus({ months: 1 });
    const now = planningDates.nowInPlanningZone();
    const tomorrow = now.startOf('day').plus({ days: 1 });
    const assessedEnd = monthEnd < tomorrow ? monthEnd : tomorrow;

    await sessionModel.expireStaleSessions({ userId });
    const [planningRows, sessionRows, overrideRows] = await Promise.all([
      planningModel.findDayAvailabilityForUserRange(
        userId,
        planningDates.formatDate(monthStart),
        planningDates.formatDate(monthEnd)
      ),
      sessionModel.findSessionsForUsersOverlapping([userId], monthStart.toISO(), monthEnd.toISO()),
      planningModel.findAttendanceOverridesForUserRange(
        userId,
        planningDates.formatDate(monthStart),
        planningDates.formatDate(monthEnd)
      ),
    ]);

    const planningByDate = new Map(planningRows.map((row) => [toDateString(row.planning_date), row]));
    const overrideByDate = new Map(overrideRows.map((row) => [toDateString(row.attendance_date), row]));
    const days = [];

    for (let cursor = monthStart; cursor < assessedEnd; cursor = cursor.plus({ days: 1 })) {
      const dateString = planningDates.formatDate(cursor);
      const planning = planningByDate.get(dateString);
      const override = overrideByDate.get(dateString);
      const scheduled = planning && ATTENDANCE_HAS_SLOTS.includes(planning.availability_status);
      if (!scheduled && !override) continue;

      const dayEnd = cursor.plus({ days: 1 });
      const relevantSessions = sessionRows.filter((session) => {
        const login = DateTime.fromJSDate(session.login_at, { zone: planningDates.PLANNING_TIMEZONE });
        const logout = DateTime.fromJSDate(session.effective_logout_at, { zone: planningDates.PLANNING_TIMEZONE });
        return login < dayEnd && logout > cursor;
      });
      days.push(
        buildAttendanceResult({
          employee,
          planning,
          sessionRows: relevantSessions,
          override,
          dateString,
          dayStart: cursor,
          now,
        })
      );
    }

    const summary = {
      present: days.filter((day) => day.presence_status === 'present').length,
      late: days.filter((day) => day.presence_status === 'late').length,
      absent: days.filter((day) => day.presence_status === 'absent').length,
      partial: days.filter((day) => day.presence_status === 'partial').length,
      outside: days.filter((day) => day.presence_status === 'outside').length,
      pending: days.filter((day) => ['waiting', 'upcoming'].includes(day.presence_status)).length,
      total_late_minutes: days.reduce(
        (total, day) => total + (day.presence_status === 'late' ? day.late_minutes : 0),
        0
      ),
    };
    summary.average_late_minutes = summary.late
      ? Math.round(summary.total_late_minutes / summary.late)
      : 0;
    summary.assessed_days = summary.present + summary.late + summary.absent + summary.partial + summary.outside;

    res.status(200).json({
      employee: {
        id: employee.id,
        full_name: employee.full_name,
        position: employee.position,
        has_avatar: Boolean(employee.has_avatar),
      },
      month,
      summary,
      days: days.reverse(),
    });
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
  createCurrentWeekPlanning,
  updateCurrentWeekPlanning,
  submitCurrentWeekPlanning,
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
  adminAttendance,
  adminSetAttendanceOverride,
  adminAttendanceStats,
};
