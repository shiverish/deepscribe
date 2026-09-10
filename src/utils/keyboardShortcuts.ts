import { VIEW_DEFINITIONS } from './views';

export type KeyboardShortcutScope = 'app' | 'desktop';

export interface KeyboardShortcut {
  id: string;
  key: string;
  description: string;
  scope?: KeyboardShortcutScope;
}

export interface KeyboardShortcutGroup {
  id: 'navigation' | 'editing' | 'search-and-views' | 'desktop';
  label: string;
  description: string;
  shortcuts: KeyboardShortcut[];
}

export const DEFAULT_GLOBAL_TOGGLE_SHORTCUT = 'Ctrl + Alt + D';

/**
 * Returns the overview groups with the user's current configurable window
 * binding substituted into the desktop-wide section.
 */
export function getKeyboardShortcutGroups(globalToggleShortcut = DEFAULT_GLOBAL_TOGGLE_SHORTCUT): KeyboardShortcutGroup[] {
  const toggleShortcut = globalToggleShortcut.trim() || DEFAULT_GLOBAL_TOGGLE_SHORTCUT;

  return KEYBOARD_SHORTCUT_GROUPS.map(group => group.id === 'desktop'
    ? {
        ...group,
        shortcuts: group.shortcuts.map(shortcut => shortcut.id === 'toggle-window'
          ? { ...shortcut, key: toggleShortcut }
          : shortcut)
      }
    : group);
}

/**
 * One registry for the shortcut overview. Keep this aligned with the actual
 * handlers in useKeyboardShortcuts and the Electron-wide bindings.
 */
export const KEYBOARD_SHORTCUT_GROUPS: KeyboardShortcutGroup[] = [
  {
    id: 'navigation',
    label: 'Navigation',
    description: 'Move through cards and columns without leaving the keyboard.',
    shortcuts: [
      { id: 'navigate-vertical', key: '↑ / ↓', description: 'Navigate vertically through cards in the active column' },
      { id: 'open-child-level', key: '→', description: 'Open the next level / child blocks' },
      { id: 'back-parent-column', key: '←', description: 'Navigate back to the parent column' }
    ]
  },
  {
    id: 'editing',
    label: 'Edit & organize',
    description: 'Create, edit, duplicate and remove blocks.',
    shortcuts: [
      { id: 'edit-title', key: 'Enter', description: 'Edit title (press Enter again to move to text content)' },
      { id: 'stop-editing', key: 'Escape', description: 'Stop editing and return to card navigation' },
      { id: 'add-child-block', key: 'Shift + →', description: 'Add a new child block to the selected block' },
      { id: 'add-block', key: 'Shift + ↓ / Shift + N', description: 'Add a new text block at the active level' },
      { id: 'duplicate-block', key: 'Ctrl + D', description: 'Duplicate selected block and descendant branch' },
      { id: 'trash-block', key: 'Delete / Backspace', description: 'Move the selected block to trash' },
      { id: 'toggle-writing-panel', key: 'Ctrl + Shift + E', description: 'Expand or collapse the fixed writing panel' }
    ]
  },
  {
    id: 'search-and-views',
    label: 'Search & views',
    description: 'Find information, change perspective and open settings.',
    shortcuts: [
      { id: 'find-in-document', key: 'Ctrl + F', description: 'Find text in current document' },
      { id: 'global-search', key: 'Ctrl + Shift + F / Ctrl + K', description: 'Open global search (title, content, and tags)' },
      ...VIEW_DEFINITIONS.map((view, index) => ({
        id: `switch-${view.id}`,
        key: `Ctrl + ${index + 1}`,
        description: `Switch to ${view.title}`
      })),
      { id: 'open-settings', key: 'Ctrl + ,', description: 'Open Settings' },
      { id: 'open-shortcuts', key: 'Shift + ?', description: 'Open this keyboard shortcut overview' }
    ]
  },
  {
    id: 'desktop',
    label: 'Desktop-wide',
    description: 'Available even when DeepScribe is not the active window.',
    shortcuts: [
      { id: 'toggle-window', key: 'Ctrl + Alt + D', description: 'Show, focus or minimize DeepScribe', scope: 'desktop' },
      { id: 'annotate-screen', key: 'Ctrl + Alt + S', description: 'Annotate screen and create a task or block', scope: 'desktop' },
      { id: 'quick-capture', key: 'Ctrl + Alt + C', description: 'Quick Capture: send a note to the Workspace Inbox', scope: 'desktop' }
    ]
  }
];
