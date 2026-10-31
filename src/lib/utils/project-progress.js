/**
 * Calculates project progress and task stats according to the established project rule:
 * - When a project has tasks, progress is the percentage of completed tasks (status === "Done").
 * - When a project has no tasks, manualProgress fallback is preserved.
 *
 * @param {Array<{ status: string }>} tasks Array of tasks
 * @param {number} [manualProgress=0] Fallback manual progress when no tasks exist
 * @returns {{ progress: number, progressSource: 'tasks' | 'manual', taskCounts: { total: number, completed: number, inProgress: number, todo: number } }}
 */
export function calculateProjectProgress(tasks, manualProgress = 0) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    const safeManual =
      typeof manualProgress === "number" && !isNaN(manualProgress)
        ? Math.max(0, Math.min(100, Math.round(manualProgress)))
        : 0;
    return {
      progress: safeManual,
      progressSource: "manual",
      taskCounts: { total: 0, completed: 0, inProgress: 0, todo: 0 },
    };
  }

  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "Done").length;
  const inProgress = tasks.filter((t) => t.status === "In Progress").length;
  const todo = tasks.filter((t) => t.status === "Todo").length;
  const progress = Math.round((completed / total) * 100);

  return {
    progress,
    progressSource: "tasks",
    taskCounts: { total, completed, inProgress, todo },
  };
}

/**
 * Calculates milestone stats for a project.
 *
 * @param {Array<{ status: string }>} milestones Array of milestones
 * @returns {{ total: number, completed: number, inProgress: number, planned: number }}
 */
export function calculateMilestoneStats(milestones) {
  if (!Array.isArray(milestones) || milestones.length === 0) {
    return { total: 0, completed: 0, inProgress: 0, planned: 0 };
  }

  const total = milestones.length;
  const completed = milestones.filter((m) => m.status === "Completed").length;
  const inProgress = milestones.filter((m) => m.status === "In Progress").length;
  const planned = milestones.filter((m) => m.status === "Planned").length;

  return { total, completed, inProgress, planned };
}
