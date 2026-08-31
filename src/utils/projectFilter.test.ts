import { describe, it, expect } from 'vitest';
import {
  TASK_FILTER_NONE,
  isAllProjectsSelected,
  isNoProjectsSelected,
  getEffectiveSelectedProjectIds,
  toggleProjectSelection,
  getSelectAllActionState,
  toggleSelectAll
} from './projectFilter';

describe('projectFilter logic', () => {
  const allProjects = ['inbox', 'proj-1', 'proj-2', 'proj-3'];

  describe('isAllProjectsSelected', () => {
    it('returns true for default empty array', () => {
      expect(isAllProjectsSelected([], allProjects)).toBe(true);
    });

    it('returns true when all IDs are explicitly present', () => {
      expect(isAllProjectsSelected(['inbox', 'proj-1', 'proj-2', 'proj-3'], allProjects)).toBe(true);
    });

    it('returns false when some IDs are missing', () => {
      expect(isAllProjectsSelected(['proj-1', 'proj-2'], allProjects)).toBe(false);
    });

    it('returns false when TASK_FILTER_NONE is present', () => {
      expect(isAllProjectsSelected([TASK_FILTER_NONE], allProjects)).toBe(false);
    });
  });

  describe('isNoProjectsSelected', () => {
    it('returns true when TASK_FILTER_NONE is present', () => {
      expect(isNoProjectsSelected([TASK_FILTER_NONE])).toBe(true);
    });

    it('returns false for default empty array', () => {
      expect(isNoProjectsSelected([])).toBe(false);
    });

    it('returns false for actual project IDs', () => {
      expect(isNoProjectsSelected(['proj-1'])).toBe(false);
    });
  });

  describe('getEffectiveSelectedProjectIds', () => {
    it('returns all project IDs when selectedProjectIds is empty (default all)', () => {
      expect(getEffectiveSelectedProjectIds([], allProjects)).toEqual(allProjects);
    });

    it('returns empty array when TASK_FILTER_NONE is set', () => {
      expect(getEffectiveSelectedProjectIds([TASK_FILTER_NONE], allProjects)).toEqual([]);
    });

    it('returns only valid matching selected IDs', () => {
      expect(getEffectiveSelectedProjectIds(['proj-1', 'proj-2'], allProjects)).toEqual(['proj-1', 'proj-2']);
    });
  });

  describe('toggleProjectSelection', () => {
    it('unchecks only the clicked project when all projects are selected (default state)', () => {
      const result = toggleProjectSelection('proj-1', [], allProjects);
      expect(result).toEqual(['inbox', 'proj-2', 'proj-3']);
      expect(result).not.toContain('proj-1');
    });

    it('unchecks only the clicked project when all projects are explicitly selected', () => {
      const result = toggleProjectSelection('proj-2', allProjects, allProjects);
      expect(result).toEqual(['inbox', 'proj-1', 'proj-3']);
    });

    it('checks only the clicked project when no projects are selected', () => {
      const result = toggleProjectSelection('proj-1', [TASK_FILTER_NONE], allProjects);
      expect(result).toEqual(['proj-1']);
    });

    it('removes a project when already selected in a subset', () => {
      const result = toggleProjectSelection('proj-1', ['proj-1', 'proj-2'], allProjects);
      expect(result).toEqual(['proj-2']);
    });

    it('transitions to TASK_FILTER_NONE when unchecking the last remaining project', () => {
      const result = toggleProjectSelection('proj-1', ['proj-1'], allProjects);
      expect(result).toEqual([TASK_FILTER_NONE]);
    });

    it('adds a project when not currently selected in a subset', () => {
      const result = toggleProjectSelection('proj-3', ['proj-1'], allProjects);
      expect(result).toEqual(['proj-1', 'proj-3']);
    });

    it('normalizes to empty array [] when adding the last unselected project (making all selected)', () => {
      const result = toggleProjectSelection('proj-3', ['inbox', 'proj-1', 'proj-2'], allProjects);
      expect(result).toEqual([]);
    });
  });

  describe('getSelectAllActionState and toggleSelectAll', () => {
    it('returns deselect when all projects are selected', () => {
      const action = getSelectAllActionState(allProjects, [], allProjects);
      expect(action).toBe('deselect');
    });

    it('returns select when no projects are selected', () => {
      const action = getSelectAllActionState(allProjects, [TASK_FILTER_NONE], allProjects);
      expect(action).toBe('select');
    });

    it('deselects all projects when starting from all selected', () => {
      const { nextSelectedIds, nextAction } = toggleSelectAll(allProjects, [], allProjects);
      expect(nextSelectedIds).toEqual([TASK_FILTER_NONE]);
      expect(nextAction).toBe('select');
    });

    it('selects all projects when starting from none selected', () => {
      const { nextSelectedIds, nextAction } = toggleSelectAll(allProjects, [TASK_FILTER_NONE], allProjects);
      expect(nextSelectedIds).toEqual([]);
      expect(nextAction).toBe('deselect');
    });

    it('handles search subsets: deselects only the target matching projects', () => {
      const targetSubset = ['proj-1', 'proj-2'];
      const { nextSelectedIds } = toggleSelectAll(targetSubset, [], allProjects);
      // 'inbox' and 'proj-3' remain selected
      expect(nextSelectedIds).toEqual(['inbox', 'proj-3']);
    });

    it('handles search subsets: selects target matching projects into current selection', () => {
      const targetSubset = ['proj-1', 'proj-2'];
      const { nextSelectedIds } = toggleSelectAll(targetSubset, ['proj-3'], allProjects);
      expect(nextSelectedIds).toEqual(['proj-1', 'proj-2', 'proj-3']);
    });

    it('respects preferredMode when target items are partially selected', () => {
      const targetSubset = ['proj-1', 'proj-2'];
      // proj-1 is selected, proj-2 is not
      const current = ['proj-1'];
      
      const deselectResult = toggleSelectAll(targetSubset, current, allProjects, 'deselect');
      expect(deselectResult.nextSelectedIds).toEqual([TASK_FILTER_NONE]);

      const selectResult = toggleSelectAll(targetSubset, current, allProjects, 'select');
      expect(selectResult.nextSelectedIds).toEqual(['proj-1', 'proj-2']);
    });
  });
});
