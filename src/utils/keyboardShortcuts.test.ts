import { describe, expect, it } from 'vitest';
import { getKeyboardShortcutGroups, KEYBOARD_SHORTCUT_GROUPS } from './keyboardShortcuts';

describe('KEYBOARD_SHORTCUT_GROUPS', () => {
  it('organizes the visible bindings into focused groups', () => {
    expect(KEYBOARD_SHORTCUT_GROUPS.map(group => group.id)).toEqual([
      'navigation',
      'editing',
      'search-and-views',
      'desktop'
    ]);
  });

  it('keeps settings and every view-switch binding in the single shortcut registry', () => {
    const shortcuts = KEYBOARD_SHORTCUT_GROUPS.flatMap(group => group.shortcuts);

    expect(shortcuts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'open-settings', key: 'Ctrl + ,' }),
      expect.objectContaining({ id: 'switch-columns', key: 'Ctrl + 1' }),
      expect.objectContaining({ id: 'switch-focus', key: 'Ctrl + 4' })
    ]));
  });

  it('shows the configured global window toggle binding instead of a hard-coded default', () => {
    const shortcuts = getKeyboardShortcutGroups('Ctrl + Alt + Space').flatMap(group => group.shortcuts);

    expect(shortcuts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'toggle-window', key: 'Ctrl + Alt + Space' })
    ]));
  });
});
