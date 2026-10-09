const PRIORITY_RANK = { URGENT: 0, HAUTE: 1, NORMALE: 2, FAIBLE: 3 };

export function priorityRank(priority) {
  const rank = PRIORITY_RANK[priority];
  return rank === undefined ? 99 : rank;
}

export function projectPath(task) {
  const parts = [task?.space_name, task?.folder_name, task?.list_name].filter(Boolean);
  return parts.length > 0 ? parts.join(' › ') : 'Sans projet';
}

export function groupByProject(tasks) {
  const map = new Map();
  for (const task of tasks || []) {
    const project = projectPath(task);
    if (!map.has(project)) map.set(project, []);
    map.get(project).push(task);
  }

  return [...map.entries()]
    .map(([project, list]) => ({
      project,
      tasks: [...list].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority)),
    }))
    .sort((a, b) => {
      const topA = priorityRank(a.tasks[0]?.priority);
      const topB = priorityRank(b.tasks[0]?.priority);
      if (topA !== topB) return topA - topB;
      return a.project.localeCompare(b.project, 'fr');
    });
}
