// « Ma journée » : ce que devient la sélection To Do quand l'employé la modifie.
//
// Une fois la journée validée, l'employé peut encore ajouter ou retirer des tâches, sans
// passer par une demande à l'admin. La journée doit alors RESTER validée : une tâche déjà
// présente garde son heure de validation, une tâche ajoutée est validée à l'instant — et
// rejoint le Daily, comme les tâches validées le matin.

// previous : lignes actuelles [{ task_id, validated_at }] ; taskIds : nouvelle liste ordonnée.
function planSelection(previous, taskIds) {
  const previousById = new Map((previous || []).map((row) => [row.task_id, row.validated_at || null]));
  const wasValidated = (previous || []).some((row) => row.validated_at);
  const rows = taskIds.map((taskId, index) => ({
    task_id: taskId,
    selected_order: index + 1,
    // Heure de validation d'origine conservée : c'est elle que l'admin lit (« envoyé à 8 h 12 »).
    validated_at: previousById.get(taskId) || null,
    validate_now: wasValidated && !previousById.get(taskId),
  }));
  const added = taskIds.filter((taskId) => !previousById.has(taskId));
  return { wasValidated, rows, added };
}

module.exports = { planSelection };
