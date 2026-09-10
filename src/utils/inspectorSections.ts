export type InspectorSectionId = 'projectColor' | 'capture' | 'task' | 'tags' | 'attachments' | 'dependencies' | 'references' | 'scratchpad';

export type InspectorSectionState = Record<InspectorSectionId, boolean>;

export interface InspectorSectionContext {
  isProject: boolean;
  isCapture: boolean;
  isTask: boolean;
  isBlocked: boolean;
  hasClaim: boolean;
  hasTaskErrors: boolean;
  attachmentCount: number;
  dependencyCount: number;
  referenceCount: number;
  hasScratchpad: boolean;
}

/** Default state is deliberately ephemeral: opening a new item starts fresh. */
export function getDefaultInspectorSections(context: InspectorSectionContext): InspectorSectionState {
  return {
    projectColor: false,
    capture: context.isCapture,
    task: context.isTask && (context.isBlocked || context.hasClaim || context.hasTaskErrors),
    tags: false,
    attachments: context.attachmentCount > 0,
    dependencies: context.dependencyCount > 0 || context.isBlocked,
    references: context.referenceCount > 0,
    scratchpad: context.isProject && context.hasScratchpad
  };
}

export function toggleInspectorSection(state: InspectorSectionState, section: InspectorSectionId): InspectorSectionState {
  return { ...state, [section]: !state[section] };
}
