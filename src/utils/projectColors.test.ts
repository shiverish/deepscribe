import { describe, expect, it } from 'vitest';
import { DEFAULT_PROJECT_COLOR, INBOX_PROJECT_COLOR, PROJECT_COLOR_PALETTE, getProjectColor } from './projectColors';

describe('projectColors utility', () => {
  it('defines a palette of 10 standard colors', () => {
    expect(PROJECT_COLOR_PALETTE).toHaveLength(10);
    expect(PROJECT_COLOR_PALETTE[0].name).toBe('Amber');
    expect(PROJECT_COLOR_PALETTE[0].hex).toBe('#F59E0B');
  });

  it('returns custom color when provided', () => {
    expect(getProjectColor('#10B981')).toBe('#10B981');
    expect(getProjectColor('#8B5CF6 ')).toBe('#8B5CF6');
  });

  it('falls back to default project color when color is empty or undefined', () => {
    expect(getProjectColor(undefined)).toBe(DEFAULT_PROJECT_COLOR);
    expect(getProjectColor(null)).toBe(DEFAULT_PROJECT_COLOR);
    expect(getProjectColor('')).toBe(DEFAULT_PROJECT_COLOR);
    expect(getProjectColor('   ')).toBe(DEFAULT_PROJECT_COLOR);
  });

  it('has a distinct inbox project color', () => {
    expect(INBOX_PROJECT_COLOR).toBe('#64748B');
  });
});
