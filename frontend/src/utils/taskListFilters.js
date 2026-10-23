import { displayStatusOf } from './taskStatus.js';
import { matchesTerms } from './textSearch.js';
import { matchesPeriod, toYMD } from './deadlineRange.js';

export function deadlineYMD(raw) {
  if (!raw) return null;
  const value = String(raw);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : toYMD(date);
}

export function matchesDeadlineFilter(deadline, filter, today = new Date()) {
  const ymd = deadlineYMD(deadline);
  if (filter === 'past') return Boolean(ymd) && ymd < toYMD(today);
  return matchesPeriod(ymd, filter === 'today' ? 'day' : filter, today);
}

export function assigneesOf(task) {
  if (Array.isArray(task.assignees) && task.assignees.length > 0) return task.assignees;
  return task.assigned_to ? [{ id: task.assigned_to, full_name: task.assigned_to_name || '' }] : [];
}

export function assigneeOptions(tasks) {
  const byId = new Map();
  for (const task of tasks) {
    for (const person of assigneesOf(task)) {
      if (person.id && !byId.has(person.id)) byId.set(person.id, person.full_name || '');
    }
  }
  return [...byId.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
}

function plainText(html) {
  return String(html || '').replace(/<[^>]*>/g, ' ');
}

export function filterTaskList(tasks, filters, today = new Date()) {
  const { search = '', statuses = [], priorities = [], assignees = [], deadlines = [] } = filters;
  return tasks
    .filter((task) => {
      const people = assigneesOf(task);
      return (
        matchesTerms(
          [task.title, ...people.map((p) => p.full_name), task.space_name, task.folder_name, task.list_name, plainText(task.description)],
          search
        ) &&
        (statuses.length === 0 || statuses.includes(displayStatusOf(task))) &&
        (priorities.length === 0 || priorities.includes(task.priority)) &&
        (assignees.length === 0 || people.some((p) => assignees.includes(p.id))) &&
        (deadlines.length === 0 || deadlines.some((d) => matchesDeadlineFilter(task.deadline, d, today)))
      );
    })
    .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));
}
