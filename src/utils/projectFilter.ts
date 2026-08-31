/**
 * Special sentinel value indicating that 0 projects are explicitly selected
 * (distinguishing it from an empty array `[]` which represents the default "All projects").
 */
export const TASK_FILTER_NONE = '__ds_none__';

/**
 * Checks whether all projects are currently selected (or no project filter is applied).
 */
export function isAllProjectsSelected(selectedProjectIds: string[], allProjectIds: string[]): boolean {
  if (selectedProjectIds.includes(TASK_FILTER_NONE)) {
    return false;
  }
  if (selectedProjectIds.length === 0) {
    return true;
  }
  if (allProjectIds.length > 0 && allProjectIds.every(id => selectedProjectIds.includes(id))) {
    return true;
  }
  return false;
}

/**
 * Checks whether 0 projects are selected (all deselected).
 */
export function isNoProjectsSelected(selectedProjectIds: string[]): boolean {
  return selectedProjectIds.includes(TASK_FILTER_NONE);
}

/**
 * Returns the effective list of project IDs that should be included in queries/views.
 * Returns empty array if all are deselected (`TASK_FILTER_NONE`).
 * Returns all project IDs if all are selected (`[]`).
 */
export function getEffectiveSelectedProjectIds(selectedProjectIds: string[], allProjectIds: string[]): string[] {
  if (selectedProjectIds.includes(TASK_FILTER_NONE)) {
    return [];
  }
  if (selectedProjectIds.length === 0) {
    return allProjectIds;
  }
  return allProjectIds.filter(id => selectedProjectIds.includes(id));
}

/**
 * Toggles an individual project's selection state.
 * - When all projects are selected, clicking one project unchecks only that project.
 * - When 0 projects are selected, clicking one project checks only that project.
 * - When the last checked project is unchecked, transitions to `[TASK_FILTER_NONE]`.
 * - When all projects become checked, normalizes to `[]` (all projects).
 */
export function toggleProjectSelection(
  projectId: string,
  currentSelectedIds: string[],
  allProjectIds: string[]
): string[] {
  if (isAllProjectsSelected(currentSelectedIds, allProjectIds)) {
    return allProjectIds.filter(id => id !== projectId);
  }

  if (isNoProjectsSelected(currentSelectedIds)) {
    return [projectId];
  }

  const effective = getEffectiveSelectedProjectIds(currentSelectedIds, allProjectIds);
  if (effective.includes(projectId)) {
    const next = effective.filter(id => id !== projectId);
    if (next.length === 0) {
      return [TASK_FILTER_NONE];
    }
    return next;
  }

  const next = [...effective, projectId];
  if (allProjectIds.length > 0 && allProjectIds.every(id => next.includes(id))) {
    return [];
  }
  return next;
}

/**
 * Determines the label and action for the dynamic Select/Deselect all button.
 */
export function getSelectAllActionState(
  targetIds: string[],
  currentSelectedIds: string[],
  allProjectIds: string[],
  preferredMode: 'select' | 'deselect' = 'deselect'
): 'select' | 'deselect' {
  if (targetIds.length === 0) {
    return preferredMode;
  }

  const effective = getEffectiveSelectedProjectIds(currentSelectedIds, allProjectIds);
  const selectedCount = targetIds.filter(id => effective.includes(id)).length;

  if (selectedCount === targetIds.length) {
    return 'deselect';
  }
  if (selectedCount === 0) {
    return 'select';
  }
  return preferredMode;
}

/**
 * Executes a Select all or Deselect all operation over the specified target project IDs.
 */
export function toggleSelectAll(
  targetIds: string[],
  currentSelectedIds: string[],
  allProjectIds: string[],
  preferredMode: 'select' | 'deselect' = 'deselect'
): { nextSelectedIds: string[]; nextAction: 'select' | 'deselect' } {
  if (targetIds.length === 0) {
    return { nextSelectedIds: currentSelectedIds, nextAction: preferredMode };
  }

  const action = getSelectAllActionState(targetIds, currentSelectedIds, allProjectIds, preferredMode);
  const effective = getEffectiveSelectedProjectIds(currentSelectedIds, allProjectIds);
  const targetSet = new Set(targetIds);

  if (action === 'deselect') {
    const next = effective.filter(id => !targetSet.has(id));
    const nextSelectedIds = next.length === 0 ? [TASK_FILTER_NONE] : next;
    return { nextSelectedIds, nextAction: 'select' };
  } else {
    const unionSet = new Set([...effective, ...targetIds]);
    const next = allProjectIds.filter(id => unionSet.has(id));
    const isAll = allProjectIds.length > 0 && allProjectIds.every(id => unionSet.has(id));
    const nextSelectedIds = isAll ? [] : next;
    return { nextSelectedIds, nextAction: 'deselect' };
  }
}
