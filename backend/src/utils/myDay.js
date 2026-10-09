function planSelection(previous, taskIds) {
  const previousById = new Map((previous || []).map((row) => [row.task_id, row.validated_at || null]));
  const wasValidated = (previous || []).some((row) => row.validated_at);
  const rows = taskIds.map((taskId, index) => ({
    task_id: taskId,
    selected_order: index + 1,
    validated_at: previousById.get(taskId) || null,
    validate_now: wasValidated && !previousById.get(taskId),
  }));
  const added = taskIds.filter((taskId) => !previousById.has(taskId));
  return { wasValidated, rows, added };
}

module.exports = { planSelection };
