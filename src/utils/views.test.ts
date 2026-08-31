import { describe, expect, it } from 'vitest';
import { DEFAULT_STARTUP_VIEW, VIEW_DEFINITIONS, isActiveView, resolveStartupView } from './views';

describe('view definitions', () => {
  it('has no duplicate view ids', () => {
    const ids = VIEW_DEFINITIONS.map(view => view.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('recognises the views the switcher offers, and nothing else', () => {
    for (const view of VIEW_DEFINITIONS) {
      expect(isActiveView(view.id)).toBe(true);
    }
    expect(isActiveView('graph')).toBe(false);
    expect(isActiveView(undefined)).toBe(false);
  });
});

describe('resolveStartupView', () => {
  it('opens the chosen view when the mode is fixed', () => {
    expect(resolveStartupView({
      startupViewMode: 'fixed',
      startupView: 'stats',
      lastActiveView: 'tasks'
    })).toBe('stats');
  });

  it('opens the last used view when the mode asks for it', () => {
    expect(resolveStartupView({
      startupViewMode: 'last-used',
      startupView: 'stats',
      lastActiveView: 'tasks'
    })).toBe('tasks');
  });

  // The graph view was removed in 0.2.33, so a stored view can name a view that
  // no longer exists.
  it('falls back to the default when the stored view is gone', () => {
    expect(resolveStartupView({
      startupViewMode: 'fixed',
      startupView: 'graph' as never,
      lastActiveView: 'tasks'
    })).toBe(DEFAULT_STARTUP_VIEW);

    expect(resolveStartupView({
      startupViewMode: 'last-used',
      startupView: 'stats',
      lastActiveView: 'graph' as never
    })).toBe(DEFAULT_STARTUP_VIEW);
  });
});
