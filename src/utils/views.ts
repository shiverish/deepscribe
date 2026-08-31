import type { ActiveView, UserSettings } from '../types';

export interface ViewDefinition {
  id: ActiveView;
  /** Label on the switcher button. */
  label: string;
  /** Full name, used where there is room for it — tooltips, the settings list. */
  title: string;
  shortcut: string;
}

/**
 * The views the switcher offers, in the order they appear in it. Everything
 * that has to enumerate the views reads this list, so adding a view is one
 * entry here rather than a hunt through the switcher, the shortcuts and the
 * settings.
 */
export const VIEW_DEFINITIONS: ViewDefinition[] = [
  { id: 'columns', label: 'Columns', title: 'Columns View', shortcut: 'Ctrl+1' },
  { id: 'tasks', label: 'Tasks', title: 'Tasks View', shortcut: 'Ctrl+2' },
  { id: 'stats', label: 'Stats', title: 'Statistics View', shortcut: 'Ctrl+3' },
  { id: 'focus', label: 'Focus', title: 'Focus View', shortcut: 'Ctrl+4' }
];

/** Where the app lands when nothing else decides for it. */
export const DEFAULT_STARTUP_VIEW: ActiveView = 'columns';

export function isActiveView(value: unknown): value is ActiveView {
  return VIEW_DEFINITIONS.some(view => view.id === value);
}

/**
 * The view to open on startup. A stored view that no longer exists falls back
 * to the default — the graph view was removed in 0.2.33, so a setting can
 * outlive the view it names.
 */
export function resolveStartupView(
  settings: Pick<UserSettings, 'startupViewMode' | 'startupView' | 'lastActiveView'>
): ActiveView {
  const stored = settings.startupViewMode === 'last-used' ? settings.lastActiveView : settings.startupView;
  return isActiveView(stored) ? stored : DEFAULT_STARTUP_VIEW;
}
