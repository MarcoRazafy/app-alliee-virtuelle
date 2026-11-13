import { matchesTerms } from './textSearch.js';

export { normalize } from './textSearch.js';

export function flattenLists(tree) {
  const out = [];
  (tree || []).forEach((space) => {
    (space.folders || []).forEach((folder) => {
      (folder.lists || []).forEach((list) => {
        out.push({ id: list.id, path: `${space.name} › ${folder.name} › ${list.name}` });
      });
    });
  });
  return out;
}

export function filterProjects(projects, query) {
  return (projects || []).filter((project) => matchesTerms(project?.path, query));
}
