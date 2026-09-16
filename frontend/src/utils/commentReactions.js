// Réactions sur les commentaires de tâche : le « nike » ✔️ (vu, c'est noté).
//
// Le serveur reste la source de vérité : ces fonctions ne servent qu'à afficher l'état et à
// l'anticiper au clic, pour que la coche réponde tout de suite au lieu d'attendre le réseau.

// Doit correspondre exactement à la liste du serveur (taskController, COMMENT_REACTIONS).
export const NIKE = '✔️';

export function findReaction(reactions, emoji) {
  return (reactions || []).find((r) => r.emoji === emoji) || null;
}

// « Vous », « Vous et Sophie Martin », « Sophie Martin et 2 autres ».
// Le lecteur passe toujours en tête : c'est l'information qu'il cherche d'abord.
export function reactorsLabel(users, meId) {
  const list = users || [];
  if (list.length === 0) return '';
  const mine = list.filter((u) => u.id === meId);
  const others = list.filter((u) => u.id !== meId);
  const names = [...mine.map(() => 'Vous'), ...others.map((u) => u.name)];

  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} et ${names[1]}`;
  return `${names[0]} et ${names.length - 1} autres`;
}

// Liste complète, pour l'infobulle : le libellé court ne nomme que la première personne.
export function reactorsTitle(users, meId) {
  const list = users || [];
  if (list.length === 0) return '';
  const mine = list.filter((u) => u.id === meId).map(() => 'Vous');
  const others = list.filter((u) => u.id !== meId).map((u) => u.name);
  return `Vu par : ${[...mine, ...others].join(', ')}`;
}

// État attendu après un clic, calculé sans attendre le serveur. Rend un NOUVEAU tableau :
// l'ancien sert à revenir en arrière si la requête échoue.
export function toggleReactionLocally(reactions, emoji, me) {
  const list = reactions || [];
  const current = findReaction(list, emoji);

  if (current?.mine) {
    const users = (current.users || []).filter((u) => u.id !== me.id);
    if (users.length === 0) return list.filter((r) => r.emoji !== emoji);
    return list.map((r) => (r.emoji === emoji ? { ...r, count: users.length, mine: false, users } : r));
  }

  const users = [...(current?.users || []), { id: me.id, name: me.name }];
  if (!current) return [...list, { emoji, count: 1, mine: true, users }];
  return list.map((r) => (r.emoji === emoji ? { ...r, count: users.length, mine: true, users } : r));
}
