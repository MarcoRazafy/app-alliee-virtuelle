import { matchesTerms } from './textSearch.js';

export { normalize } from './textSearch.js';

export function filterProjects(projects, query) {
  return (projects || []).filter((project) => matchesTerms(project?.path, query));
}
