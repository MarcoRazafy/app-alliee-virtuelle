const db = require('../config/database');
const { computeCompletionRate } = require('../utils/kpi');

// Journée de TRAVAIL, terminée à 2 h du matin et non à minuit (voir utils/businessDay) :
// regrouper par `::date` coupait en deux le poste d'un employé de nuit, et CURRENT_DATE
// dépendait du fuseau de la session PostgreSQL — différent en local et sur Railway.
// DAY  : colonnes TIMESTAMPTZ (user_sessions.login_at)
// DAYN : colonnes TIMESTAMP sans fuseau (timelog.start_time, tasks.updated_at) — voir
//        utils/businessDay, où le piège de AT TIME ZONE sur ce type est expliqué.
const { sqlBusinessDay: DAY, sqlBusinessDayNaive: DAYN, sqlToday } = require('../utils/businessDay');
// Les colonnes DATE remontent de `pg` construites avec les getters LOCAUX : les relire avec
// toISOString() décalait l'étiquette du jour quand le fuseau du serveur n'est pas UTC.
const { formatDbDate } = require('../utils/planningDates');
const { sqlIsLate } = require('../utils/lateTasks');
const planningDates = require('../utils/planningDates');
const businessDay = require('../utils/businessDay');
const sessionModel = require('./session.model');
const TODAY = sqlToday();

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
     FROM timelog WHERE ${DAYN('start_time')} BETWEEN $1 AND $2`,
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
    `SELECT ${DAYN('updated_at')} AS date, COUNT(*)::INTEGER AS tasks_confirmed
     FROM tasks WHERE status = 'CONFIRMEE' AND ${DAYN('updated_at')} BETWEEN $1 AND $2
     GROUP BY ${DAYN('updated_at')}`,
    [from, to]
  );
  const hoursByDayResult = await db.query(
    `SELECT ${DAYN('start_time')} AS date, COALESCE(SUM(duration_seconds), 0)::BIGINT AS hours_worked_seconds
     FROM timelog WHERE ${DAYN('start_time')} BETWEEN $1 AND $2
     GROUP BY ${DAYN('start_time')}`,
    [from, to]
  );
  // Temps de connexion (présence) agrégé par jour, indépendant du chrono de tâche.
  const connectedByDayResult = await db.query(
    `SELECT ${DAY('login_at')} AS date,
            COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(logout_at, now()) - login_at))), 0)::BIGINT AS connected_seconds
     FROM user_sessions WHERE ${DAY('login_at')} BETWEEN $1 AND $2
     GROUP BY ${DAY('login_at')}`,
    [from, to]
  );

  const byDayMap = {};
  const emptyDay = (date) => ({ date, tasks_confirmed: 0, hours_worked_seconds: 0, connected_seconds: 0 });
  confirmedByDayResult.rows.forEach((row) => {
    const date = formatDbDate(row.date);
    byDayMap[date] = { ...emptyDay(date), tasks_confirmed: row.tasks_confirmed };
  });
  hoursByDayResult.rows.forEach((row) => {
    const date = formatDbDate(row.date);
    if (!byDayMap[date]) byDayMap[date] = emptyDay(date);
    byDayMap[date].hours_worked_seconds = Number(row.hours_worked_seconds);
  });
  connectedByDayResult.rows.forEach((row) => {
    const date = formatDbDate(row.date);
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
              COUNT(*) FILTER (WHERE ${sqlIsLate('t')})::INTEGER AS late
       FROM tasks t JOIN task_assignees ta ON ta.task_id = t.id
       WHERE t.deadline BETWEEN $1 AND $2
       GROUP BY ta.user_id`,
      [from, to]
    ),
    db.query(
      `SELECT employee_id, COALESCE(SUM(duration_seconds), 0)::BIGINT AS hours_worked_seconds
       FROM timelog WHERE ${DAYN('start_time')} BETWEEN $1 AND $2
       GROUP BY employee_id`,
      [from, to]
    ),
    // Présence par employé : temps de connexion, nb de sessions, jours présents, dernière connexion.
    db.query(
      `SELECT user_id,
              COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(logout_at, now()) - login_at))), 0)::BIGINT AS connected_seconds,
              COUNT(*)::INTEGER AS sessions_count,
              COUNT(DISTINCT ${DAY('login_at')})::INTEGER AS days_present,
              MAX(login_at) AS last_login
       FROM user_sessions WHERE ${DAY('login_at')} BETWEEN $1 AND $2
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
     WHERE ta.user_id = $1 AND ${DAYN('t.updated_at')} BETWEEN $2 AND $3`,
    [employeeId, from, to]
  );

  const timeResult = await db.query(
    `SELECT COALESCE(SUM(duration_seconds), 0)::BIGINT AS total_seconds,
            COUNT(DISTINCT task_id)::INTEGER AS tasks_with_time
     FROM timelog WHERE employee_id = $1 AND ${DAYN('start_time')} BETWEEN $2 AND $3`,
    [employeeId, from, to]
  );

  // Chrono de connexion (présence), indépendant du chrono de tâche ci-dessus : même
  // simplification que timeResult (filtre sur la date de début de la session).
  const connectedResult = await db.query(
    `SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(logout_at, now()) - login_at))), 0)::BIGINT AS total_seconds
     FROM user_sessions WHERE user_id = $1 AND ${DAY('login_at')} BETWEEN $2 AND $3`,
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
    `SELECT ${DAYN('t.updated_at')} AS date, COUNT(*)::INTEGER AS tasks_confirmed
     FROM tasks t JOIN task_assignees ta ON ta.task_id = t.id
     WHERE ta.user_id = $1 AND t.status = 'CONFIRMEE' AND ${DAYN('t.updated_at')} BETWEEN $2 AND $3
     GROUP BY ${DAYN('t.updated_at')}`,
    [employeeId, from, to]
  );
  const hoursByDayResult = await db.query(
    `SELECT ${DAYN('start_time')} AS date, COALESCE(SUM(duration_seconds), 0)::BIGINT AS hours_worked_seconds
     FROM timelog WHERE employee_id = $1 AND ${DAYN('start_time')} BETWEEN $2 AND $3
     GROUP BY ${DAYN('start_time')}`,
    [employeeId, from, to]
  );

  const byDayMap = {};
  confirmedByDayResult.rows.forEach((row) => {
    const date = formatDbDate(row.date);
    byDayMap[date] = { date, tasks_confirmed: row.tasks_confirmed, hours_worked_seconds: 0 };
  });
  hoursByDayResult.rows.forEach((row) => {
    const date = formatDbDate(row.date);
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

// --- Temps de connexion par employé et par jour, sur une semaine -------------------------
//
// Vue « feuille de temps » : une ligne par employé, une colonne par jour de la semaine.
// L'agrégation se fait en JS et non en SQL parce qu'une connexion doit être RÉPARTIE sur
// les journées qu'elle traverse (une session de 22 h à 3 h appartient pour partie à deux
// journées), ce qu'un simple GROUP BY sur la date de début ne saurait pas faire. Le volume
// concerné — une vingtaine de personnes sur sept jours — rend ce choix sans conséquence.
// `onlyUserId` : restreint la grille à une seule personne (espace employé). Le filtre est
// posé ICI, dans la requête, et non à l'affichage : filtrer côté navigateur enverrait quand
// même les heures de toute l'équipe dans la réponse.
async function computeWeeklyConnections(weekStartDate, { onlyUserId = null } = {}) {
  const days = planningDates.getWeekDates(weekStartDate);
  const rangeStart = businessDay.businessDayStart(days[0]);
  const rangeEnd = businessDay.businessDayStart(days[days.length - 1]).plus({ days: 1 });

  const employeesResult = await db.query(
    `SELECT u.id, u.full_name, (a.id IS NOT NULL) AS has_avatar
     FROM users u
     LEFT JOIN user_avatars a ON a.user_id = u.id
     WHERE u.status = 'ACTIF'
       AND ($1::uuid IS NULL OR u.id = $1)
       -- Sans restriction, la grille liste les employés. Restreinte à une personne, elle
       -- doit aussi fonctionner pour un admin qui consulte son propre temps.
       AND ($1::uuid IS NOT NULL OR u.role = 'EMPLOYEE')
     ORDER BY u.full_name ASC`,
    [onlyUserId]
  );
  const employees = employeesResult.rows;
  if (employees.length === 0) return { week_start_date: days[0], days, employees: [] };

  const sessions = await sessionModel.findSessionsForUsersOverlapping(
    employees.map((e) => e.id),
    rangeStart.toISO(),
    rangeEnd.toISO()
  );

  const byUser = new Map(employees.map((e) => [e.id, {}]));
  sessions.forEach((session) => {
    const buckets = businessDay.splitSecondsByBusinessDay(session.login_at, session.effective_logout_at);
    const target = byUser.get(session.user_id);
    if (!target) return;
    Object.entries(buckets).forEach(([day, seconds]) => {
      // La requête ne borne les sessions qu'aux extrémités : une connexion qui déborde de
      // la semaine apporterait sinon des journées hors de la grille affichée.
      if (!days.includes(day)) return;
      target[day] = (target[day] || 0) + seconds;
    });
  });

  return {
    week_start_date: days[0],
    days,
    employees: employees.map((e) => {
      const byDay = byUser.get(e.id) || {};
      return {
        id: e.id,
        full_name: e.full_name,
        has_avatar: e.has_avatar,
        by_day: byDay,
        total_seconds: Object.values(byDay).reduce((sum, n) => sum + n, 0),
      };
    }),
  };
}

// --- Relevé de temps d'un employé sur une semaine ----------------------------------------
//
// Toutes ses entrées de chrono, groupées par journée de travail, avec le fil d'Ariane de la
// tâche (espace › dossier › liste). Les bornes sont comparées en heure locale : start_time
// est un TIMESTAMP sans fuseau, il contient déjà l'heure telle qu'affichée.
async function computeWeeklyTimelog(userId, weekStartDate) {
  const days = planningDates.getWeekDates(weekStartDate);
  const rangeStart = businessDay.businessDayStart(days[0]);
  const rangeEnd = businessDay.businessDayStart(days[days.length - 1]).plus({ days: 1 });

  const userResult = await db.query(
    `SELECT u.id, u.full_name, (a.id IS NOT NULL) AS has_avatar
     FROM users u LEFT JOIN user_avatars a ON a.user_id = u.id
     WHERE u.id = $1`,
    [userId]
  );
  const user = userResult.rows[0] || null;
  if (!user) return null;

  const entriesResult = await db.query(
    `SELECT tle.id, tle.task_id, tle.start_time, tle.end_time, tle.duration_seconds,
            t.title AS task_title, t.status AS task_status,
            tl.name AS list_name, tf.name AS folder_name, ts.name AS space_name,
            ${DAYN('tle.start_time')} AS business_day
     FROM timelog tle
     JOIN tasks t ON t.id = tle.task_id
     LEFT JOIN task_lists tl ON tl.id = t.list_id
     LEFT JOIN task_folders tf ON tf.id = tl.folder_id
     LEFT JOIN task_spaces ts ON ts.id = tf.space_id
     WHERE tle.employee_id = $1
       AND tle.start_time >= $2 AND tle.start_time < $3
     ORDER BY tle.start_time ASC`,
    [userId, rangeStart.toFormat("yyyy-MM-dd HH:mm:ss"), rangeEnd.toFormat("yyyy-MM-dd HH:mm:ss")]
  );

  const byDay = {};
  days.forEach((day) => {
    byDay[day] = [];
  });
  entriesResult.rows.forEach((row) => {
    const day = formatDbDate(row.business_day);
    if (!byDay[day]) return; // sécurité : une entrée hors semaine ne doit pas créer de colonne
    byDay[day].push({
      id: row.id,
      task_id: row.task_id,
      task_title: row.task_title,
      task_status: row.task_status,
      path: [row.space_name, row.folder_name, row.list_name].filter(Boolean),
      start_time: row.start_time,
      end_time: row.end_time,
      // Un chrono encore actif n'a pas de durée enregistrée : on la calcule à la volée
      // plutôt que d'afficher un vide qui ferait croire à une entrée perdue.
      duration_seconds:
        row.duration_seconds != null
          ? Number(row.duration_seconds)
          : Math.max(0, Math.round((Date.now() - new Date(row.start_time).getTime()) / 1000)),
      running: row.end_time == null,
    });
  });

  const totalsByDay = {};
  days.forEach((day) => {
    totalsByDay[day] = byDay[day].reduce((sum, e) => sum + e.duration_seconds, 0);
  });

  // Temps de CONNEXION du même employé, réparti par journée de travail. Il complète le temps
  // passé sur les tâches : l'écart entre les deux est justement ce qu'on cherche à lire.
  const sessions = await sessionModel.findSessionsForUsersOverlapping(
    [userId],
    rangeStart.toISO(),
    rangeEnd.toISO()
  );
  const connectionByDay = {};
  days.forEach((day) => {
    connectionByDay[day] = 0;
  });
  sessions.forEach((session) => {
    const buckets = businessDay.splitSecondsByBusinessDay(session.login_at, session.effective_logout_at);
    Object.entries(buckets).forEach(([day, seconds]) => {
      if (connectionByDay[day] === undefined) return;
      connectionByDay[day] += seconds;
    });
  });

  return {
    week_start_date: days[0],
    days,
    user,
    entries_by_day: byDay,
    totals_by_day: totalsByDay,
    total_seconds: Object.values(totalsByDay).reduce((sum, n) => sum + n, 0),
    connection_by_day: connectionByDay,
    connection_total_seconds: Object.values(connectionByDay).reduce((sum, n) => sum + n, 0),
  };
}

module.exports = {
  computeTeamStats,
  computeEmployeeStats,
  computeWeeklyConnections,
  computeWeeklyTimelog,
};
