import { describe, expect, it } from 'vitest';
import { getDefaultInspectorSections, toggleInspectorSection } from './inspectorSections';

describe('inspector section state', () => {
  it('opens task details for work requiring attention while leaving quiet metadata collapsed', () => {
    const sections = getDefaultInspectorSections({
      isProject: false,
      isCapture: false,
      isTask: true,
      isBlocked: true,
      hasClaim: false,
      hasTaskErrors: false,
      attachmentCount: 0,
      dependencyCount: 0,
      referenceCount: 0,
      hasScratchpad: false
    });

    expect(sections.task).toBe(true);
    expect(sections.attachments).toBe(false);
    expect(sections.references).toBe(false);
  });

  it('opens sections that contain existing context instead of hiding useful information', () => {
    const sections = getDefaultInspectorSections({
      isProject: true,
      isCapture: false,
      isTask: false,
      isBlocked: false,
      hasClaim: false,
      hasTaskErrors: false,
      attachmentCount: 2,
      dependencyCount: 1,
      referenceCount: 3,
      hasScratchpad: true
    });

    expect(sections.attachments).toBe(true);
    expect(sections.dependencies).toBe(true);
    expect(sections.references).toBe(true);
    expect(sections.scratchpad).toBe(true);
  });

  it('toggles only the requested section', () => {
    const initial = getDefaultInspectorSections({
      isProject: false,
      isCapture: false,
      isTask: false,
      isBlocked: false,
      hasClaim: false,
      hasTaskErrors: false,
      attachmentCount: 0,
      dependencyCount: 0,
      referenceCount: 0,
      hasScratchpad: false
    });

    expect(toggleInspectorSection(initial, 'tags')).toEqual({ ...initial, tags: !initial.tags });
  });
});
