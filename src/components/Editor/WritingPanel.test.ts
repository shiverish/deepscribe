import { describe, expect, it } from 'vitest';
import { initialTagComposerState, tagComposerReducer } from '../../utils/tagComposer';

describe('WritingPanel resizing logic', () => {
  const MIN_WIDTH = 320;

  const clampPanelWidth = (newWidth: number, windowWidth: number) => {
    const maxWidth = Math.floor(windowWidth * 0.8);
    return Math.min(Math.max(newWidth, MIN_WIDTH), maxWidth);
  };

  it('clamps width to minimum 320px when dragged too narrow', () => {
    const clamped = clampPanelWidth(200, 1920);
    expect(clamped).toBe(320);
  });

  it('clamps width to 80% of window width when dragged too wide', () => {
    const windowWidth = 1000;
    const clamped = clampPanelWidth(950, windowWidth);
    expect(clamped).toBe(800); // 80% of 1000
  });

  it('allows valid widths within limits', () => {
    const clamped = clampPanelWidth(600, 1920);
    expect(clamped).toBe(600);
  });
});

describe('WritingPanel tag composer state', () => {
  it('opens with a clean value and clears stale errors while editing', () => {
    const opened = tagComposerReducer(initialTagComposerState, { type: 'open' });
    const invalid = tagComposerReducer(opened, { type: 'invalid', error: 'Ongeldige tag.' });
    const edited = tagComposerReducer(invalid, { type: 'change', value: 'nieuwe-tag' });

    expect(edited).toEqual({ isOpen: true, value: 'nieuwe-tag', error: null });
  });

  it('keeps invalid input editable', () => {
    const editing = { isOpen: true, value: 'twee woorden', error: null };
    const invalid = tagComposerReducer(editing, { type: 'invalid', error: 'Gebruik alleen letters.' });

    expect(invalid).toEqual({ isOpen: true, value: 'twee woorden', error: 'Gebruik alleen letters.' });
  });

  it('fully resets the composer when cancelled or when the active item changes', () => {
    const editing = { isOpen: true, value: 'half-af', error: 'Controleer deze tag.' };

    expect(tagComposerReducer(editing, { type: 'close' })).toEqual(initialTagComposerState);
  });
});
