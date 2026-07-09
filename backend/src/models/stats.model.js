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

  const employeesResult = await db.query(`SELECT id, full_name FROM users WHERE role = 'EMPLOYEE' ORDER BY full_name ASC`);

  const by_employee = await Promise.all(
    employeesResult.rows.map(async (employee) => {
      const taskStats = await db.query(
        `SELECT
           COUNT(*)::INTEGER AS total_tasks,
           COUNT(*) FILTER (WHERE status = 'CONFIRMEE')::INTEGER AS confirmed,
           COUNT(*) FILTER (WHERE status = 'EN_COURS')::INTEGER AS in_progress,
           COUNT(*) FILTER (WHERE deadline < CURRENT_DATE AND status != 'CONFIRMEE')::INTEGER AS late
         FROM tasks WHERE assigned_to = $1 AND deadline BETWEEN $2 AND $3`,
        [employee.id, from, to]
      );
      const hoursStats = await db.query(
        `SELECT COALESCE(SUM(duration_seconds), 0)::BIGINT AS hours_worked_seconds
         FROM timelog WHERE employee_id = $1 AND start_time::date BETWEEN $2 AND $3`,
        [employee.id, from, to]
      );

      const stats = taskStats.rows[0];

      return {
        user_id: employee.id,
        full_name: employee.full_name,
        total_tasks: stats.total_tasks,
        confirmed: stats.confirmed,
        in_progress: stats.in_progress,
        late: stats.late,
        completion_rate: computeCompletionRate(stats.confirmed, stats.total_tasks),
        hours_worked_seconds: Number(hoursStats.rows[0].hours_worked_seconds),
      };
    })
  );

  return {
    period: { from, to },
    summary,
    by_day,
    by_status,
    by_employee,
  };
}

module.exports = { computeTeamStats };
