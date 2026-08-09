import { describe, expect, it } from 'vitest';

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
