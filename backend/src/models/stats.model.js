const db = require('../config/database');
const { computeCompletionRate } = require('../utils/kpi');

const STATUS_LIST = ['DECLAREE', 'VALIDEE', 'EN_COURS', 'TERMINEE', 'CONFIRMEE'];

// Toutes les métriques respectent la même plage [from, to] :
// - tâches (by_status, by_employee) : filtrées sur la deadline
// - temps travaillé : filtré sur la date de début de session (start_time)
// - tâches confirmées "par jour" : filtrées sur la date de confirmation (updated_at, terminale pour CONFIRMEE)
async function computeTeamStats(from, to) {
  const byStatusResult = await db.query(
    `SELECT status, COUNT(*)::INTEGER AS count
     FROM tasks WHERE deadline BETWEEN $1 AND $2
     GROUP BY status`,
    [from, to]
  );
  const by_status = STATUS_LIST.reduce((acc, status) => ({ ...acc, [status]: 0 }), {});
  byStatusResult.rows.forEach((row) => {
    by_status[row.status] = row.count;
  });

  const summaryResult = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'CONFIRMEE')::INTEGER AS tasks_confirmed,
       COUNT(*)::INTEGER AS total_tasks
     FROM tasks WHERE deadline BETWEEN $1 AND $2`,
    [from, to]
  );

  const timeResult = await db.query(
    `SELECT COALESCE(SUM(duration_seconds), 0)::BIGINT AS total_seconds,
            COUNT(DISTINCT task_id)::INTEGER AS tasks_with_time
     FROM timelog WHERE start_time::date BETWEEN $1 AND $2`,
    [from, to]
  );

  const tasksConfirmed = summaryResult.rows[0].tasks_confirmed;
  const totalTasks = summaryResult.rows[0].total_tasks;
  const totalSeconds = Number(timeResult.rows[0].total_seconds);
  const tasksWithTime = timeResult.rows[0].tasks_with_time;

  const summary = {
    tasks_confirmed: tasksConfirmed,
    completion_rate: computeCompletionRate(tasksConfirmed, totalTasks),
    average_time_per_task_seconds: tasksWithTime > 0 ? Math.round(totalSeconds / tasksWithTime) : 0,
  };

  const confirmedByDayResult = await db.query(
    `SELECT updated_at::date AS date, COUNT(*)::INTEGER AS tasks_confirmed
     FROM tasks WHERE status = 'CONFIRMEE' AND updated_at::date BETWEEN $1 AND $2
     GROUP BY updated_at::date`,
    [from, to]
  );
  const hoursByDayResult = await db.query(
    `SELECT start_time::date AS date, COALESCE(SUM(duration_seconds), 0)::BIGINT AS hours_worked_seconds
     FROM timelog WHERE start_time::date BETWEEN $1 AND $2
     GROUP BY start_time::date`,
    [from, to]
  );
  // Temps de connexion (présence) agrégé par jour, indépendant du chrono de tâche.
  const connectedByDayResult = await db.query(
    `SELECT login_at::date AS date,
            COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(logout_at, now()) - login_at))), 0)::BIGINT AS connected_seconds
     FROM user_sessions WHERE login_at::date BETWEEN $1 AND $2
     GROUP BY login_at::date`,
    [from, to]
  );

  const byDayMap = {};
  const emptyDay = (date) => ({ date, tasks_confirmed: 0, hours_worked_seconds: 0, connected_seconds: 0 });
  confirmedByDayResult.rows.forEach((row) => {
    const date = row.date.toISOString().slice(0, 10);
    byDayMap[date] = { ...emptyDay(date), tasks_confirmed: row.tasks_confirmed };
  });
  hoursByDayResult.rows.forEach((row) => {
    const date = row.date.toISOString().slice(0, 10);
    if (!byDayMap[date]) byDayMap[date] = emptyDay(date);
    byDayMap[date].hours_worked_seconds = Number(row.hours_worked_seconds);
  });
  connectedByDayResult.rows.forEach((row) => {
    const date = row.date.toISOString().slice(0, 10);
    if (!byDayMap[date]) byDayMap[date] = emptyDay(date);
    byDayMap[date].connected_seconds = Number(row.connected_seconds);
  });
  const by_day = Object.values(byDayMap).sort((a, b) => a.date.localeCompare(b.date));

  const employeesResult = await db.query(`SELECT id, full_name FROM users WHERE role IN ('EMPLOYEE', 'ADMIN') ORDER BY full_name ASC`);

  // 2 requêtes groupées sur tous les employés plutôt que 2 requêtes par employé (N+1)
  const [taskStatsResult, hoursStatsResult, connStatsResult] = await Promise.all([
    db.query(
      // Assignation multiple : on compte via task_assignees → une tâche partagée compte pour
      // CHAQUE personne assignée (pas seulement l'assigné « principal »).
      `SELECT ta.user_id AS assigned_to,
              COUNT(*)::INTEGER AS total_tasks,
              COUNT(*) FILTER (WHERE t.status = 'CONFIRMEE')::INTEGER AS confirmed,
              COUNT(*) FILTER (WHERE t.status = 'EN_COURS')::INTEGER AS in_progress,
              COUNT(*) FILTER (WHERE t.deadline < CURRENT_DATE AND t.status != 'CONFIRMEE')::INTEGER AS late
       FROM tasks t JOIN task_assignees ta ON ta.task_id = t.id
       WHERE t.deadline BETWEEN $1 AND $2
       GROUP BY ta.user_id`,
      [from, to]
    ),
    db.query(
      `SELECT employee_id, COALESCE(SUM(duration_seconds), 0)::BIGINT AS hours_worked_seconds
       FROM timelog WHERE start_time::date BETWEEN $1 AND $2
       GROUP BY employee_id`,
      [from, to]
    ),
    // Présence par employé : temps de connexion, nb de sessions, jours présents, dernière connexion.
    db.query(
      `SELECT user_id,
              COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(logout_at, now()) - login_at))), 0)::BIGINT AS connected_seconds,
              COUNT(*)::INTEGER AS sessions_count,
              COUNT(DISTINCT login_at::date)::INTEGER AS days_present,
              MAX(login_at) AS last_login
       FROM user_sessions WHERE login_at::date BETWEEN $1 AND $2
       GROUP BY user_id`,
      [from, to]
    ),
  ]);

  const taskStatsByEmployee = new Map(taskStatsResult.rows.map((row) => [row.assigned_to, row]));
  const hoursByEmployee = new Map(hoursStatsResult.rows.map((row) => [row.employee_id, Number(row.hours_worked_seconds)]));
  const connByEmployee = new Map(connStatsResult.rows.map((row) => [row.user_id, row]));

  const by_employee = employeesResult.rows.map((employee) => {
    const stats = taskStatsByEmployee.get(employee.id) || { total_tasks: 0, confirmed: 0, in_progress: 0, late: 0 };
    const conn = connByEmployee.get(employee.id);
    return {
      user_id: employee.id,
      full_name: employee.full_name,
      total_tasks: stats.total_tasks,
      confirmed: stats.confirmed,
      in_progress: stats.in_progress,
      late: stats.late,
      completion_rate: computeCompletionRate(stats.confirmed, stats.total_tasks),
      hours_worked_seconds: hoursByEmployee.get(employee.id) || 0,
      connected_seconds: Number(conn?.connected_seconds || 0),
      sessions_count: conn?.sessions_count || 0,
      days_present: conn?.days_present || 0,
      last_login: conn?.last_login || null,
    };
  });

  // Agrégats de présence pour l'équipe (calculés après by_employee).
  const totalConnectedSeconds = by_employee.reduce((sum, e) => sum + Number(e.connected_seconds || 0), 0);
  const presentEmployees = by_employee.filter((e) => Number(e.connected_seconds || 0) > 0).length;
  summary.total_connected_seconds = totalConnectedSeconds;
  summary.present_employees = presentEmployees;
  summary.average_connected_seconds = presentEmployees > 0 ? Math.round(totalConnectedSeconds / presentEmployees) : 0;

  return {
    period: { from, to },
    summary,
    by_day,
    by_status,
    by_employee,
  };
}

// Mêmes métriques que computeTeamStats mais restreintes à un seul employé (son propre espace stats).
// tasks_confirmed/total_tasks sont filtrés sur updated_at (date de confirmation), pas sur deadline :
// cette page affiche aussi un détail par jour basé sur la date de confirmation (by_day plus bas),
// les deux doivent compter les mêmes tâches sous peine de se contredire à l'écran.
async function computeEmployeeStats(employeeId, from, to) {
  const summaryResult = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE t.status = 'CONFIRMEE')::INTEGER AS tasks_confirmed,
       COUNT(*)::INTEGER AS total_tasks
     FROM tasks t JOIN task_assignees ta ON ta.task_id = t.id
     WHERE ta.user_id = $1 AND t.updated_at::date BETWEEN $2 AND $3`,
    [employeeId, from, to]
  );

  const timeResult = await db.query(
    `SELECT COALESCE(SUM(duration_seconds), 0)::BIGINT AS total_seconds,
            COUNT(DISTINCT task_id)::INTEGER AS tasks_with_time
     FROM timelog WHERE employee_id = $1 AND start_time::date BETWEEN $2 AND $3`,
    [employeeId, from, to]
  );

  // Chrono de connexion (présence), indépendant du chrono de tâche ci-dessus : même
  // simplification que timeResult (filtre sur la date de début de la session).
  const connectedResult = await db.query(
    `SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(logout_at, now()) - login_at))), 0)::BIGINT AS total_seconds
     FROM user_sessions WHERE user_id = $1 AND login_at::date BETWEEN $2 AND $3`,
    [employeeId, from, to]
  );

  const tasksConfirmed = summaryResult.rows[0].tasks_confirmed;
  const totalTasks = summaryResult.rows[0].total_tasks;
  const totalSeconds = Number(timeResult.rows[0].total_seconds);
  const tasksWithTime = timeResult.rows[0].tasks_with_time;

  const summary = {
    tasks_confirmed: tasksConfirmed,
    completion_rate: computeCompletionRate(tasksConfirmed, totalTasks),
    average_time_per_task_seconds: tasksWithTime > 0 ? Math.round(totalSeconds / tasksWithTime) : 0,
    total_hours_worked_seconds: totalSeconds,
    total_connected_seconds: Number(connectedResult.rows[0].total_seconds),
  };

  const confirmedByDayResult = await db.query(
    `SELECT t.updated_at::date AS date, COUNT(*)::INTEGER AS tasks_confirmed
     FROM tasks t JOIN task_assignees ta ON ta.task_id = t.id
     WHERE ta.user_id = $1 AND t.status = 'CONFIRMEE' AND t.updated_at::date BETWEEN $2 AND $3
     GROUP BY t.updated_at::date`,
    [employeeId, from, to]
  );
  const hoursByDayResult = await db.query(
    `SELECT start_time::date AS date, COALESCE(SUM(duration_seconds), 0)::BIGINT AS hours_worked_seconds
     FROM timelog WHERE employee_id = $1 AND start_time::date BETWEEN $2 AND $3
     GROUP BY start_time::date`,
    [employeeId, from, to]
  );

  const byDayMap = {};
  confirmedByDayResult.rows.forEach((row) => {
    const date = row.date.toISOString().slice(0, 10);
    byDayMap[date] = { date, tasks_confirmed: row.tasks_confirmed, hours_worked_seconds: 0 };
  });
  hoursByDayResult.rows.forEach((row) => {
    const date = row.date.toISOString().slice(0, 10);
    if (!byDayMap[date]) byDayMap[date] = { date, tasks_confirmed: 0, hours_worked_seconds: 0 };
    byDayMap[date].hours_worked_seconds = Number(row.hours_worked_seconds);
  });
  const by_day = Object.values(byDayMap).sort((a, b) => a.date.localeCompare(b.date));

  return {
    period: { from, to },
    summary,
    by_day,
  };
}

module.exports = { computeTeamStats, computeEmployeeStats };
