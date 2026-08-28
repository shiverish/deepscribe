import { describe, it, expect } from 'vitest';
import {
  CHANGELOG_ENTRIES,
  CURRENT_APP_VERSION,
  parseSemver,
  compareSemver,
  shouldAutoOpenWhatsNew
} from './changelog';

describe('Changelog dataset and version utilities', () => {
  it('has a valid current app version matching the latest changelog entry', () => {
    expect(CHANGELOG_ENTRIES.length).toBeGreaterThan(0);
    expect(CHANGELOG_ENTRIES[0].version).toBe(CURRENT_APP_VERSION);
    expect(CHANGELOG_ENTRIES[0].items.length).toBeGreaterThan(0);
  });

  it('correctly parses semantic version strings', () => {
    expect(parseSemver('0.2.20')).toEqual([0, 2, 20]);
    expect(parseSemver('v1.5.12')).toEqual([1, 5, 12]);
    expect(parseSemver('1.0')).toEqual([1, 0, 0]);
    expect(parseSemver('invalid')).toEqual([0, 0, 0]);
  });

  it('correctly compares semantic versions', () => {
    expect(compareSemver('0.2.20', '0.2.19')).toBe(1);
    expect(compareSemver('0.2.19', '0.2.20')).toBe(-1);
    expect(compareSemver('0.2.20', '0.2.20')).toBe(0);
    expect(compareSemver('1.0.0', '0.9.9')).toBe(1);
    expect(compareSemver('0.3.0', '0.2.99')).toBe(1);
  });

  it('evaluates automatic popup trigger according to design rules', () => {
    // Fresh install / first run (undefined lastSeenVersion) -> false
    expect(shouldAutoOpenWhatsNew('0.2.20', undefined)).toBe(false);
    expect(shouldAutoOpenWhatsNew('0.2.20', '')).toBe(false);

    // Newer version than last seen -> true
    expect(shouldAutoOpenWhatsNew('0.2.20', '0.2.19')).toBe(true);
    expect(shouldAutoOpenWhatsNew('0.2.20', '0.1.0')).toBe(true);

    // Same or older version than last seen -> false
    expect(shouldAutoOpenWhatsNew('0.2.20', '0.2.20')).toBe(false);
    expect(shouldAutoOpenWhatsNew('0.2.19', '0.2.20')).toBe(false);
  });

  it('contains valid categories in all changelog entries', () => {
    const validCategories = new Set(['feature', 'improvement', 'fix']);
    for (const release of CHANGELOG_ENTRIES) {
      expect(release.version).toBeTruthy();
      expect(release.title).toBeTruthy();
      expect(release.date).toBeTruthy();
      for (const item of release.items) {
        expect(validCategories.has(item.type)).toBe(true);
        expect(item.text).toBeTruthy();
      }
    }
  });
});
