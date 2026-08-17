import { describe, expect, it } from 'vitest';
import {
  diffLines,
  diffWords,
  diffTags,
  htmlToDiffableText,
  computeDiffSummary
} from './diffUtils';

describe('diffUtils', () => {
  it('diffLines correctly identifies additions, deletions, and unchanged lines', () => {
    const oldText = 'Regel 1\nRegel 2\nRegel 3';
    const newText = 'Regel 1\nRegel Aangepast\nRegel 3\nRegel 4';

    const diff = diffLines(oldText, newText);

    expect(diff).toEqual([
      { type: 'unchanged', line: 'Regel 1', oldLineNumber: 1, newLineNumber: 1 },
      { type: 'removed', line: 'Regel 2', oldLineNumber: 2 },
      { type: 'added', line: 'Regel Aangepast', newLineNumber: 2 },
      { type: 'unchanged', line: 'Regel 3', oldLineNumber: 3, newLineNumber: 3 },
      { type: 'added', line: 'Regel 4', newLineNumber: 4 }
    ]);
  });

  it('diffWords accurately highlights modified words', () => {
    const oldText = 'De snelle bruine vos';
    const newText = 'De trage bruine vos';

    const diff = diffWords(oldText, newText);
    expect(diff).toEqual([
      { type: 'unchanged', value: 'De ' },
      { type: 'removed', value: 'snelle' },
      { type: 'added', value: 'trage' },
      { type: 'unchanged', value: ' bruine vos' }
    ]);
  });

  it('diffTags groups added, removed, and unchanged tags', () => {
    const oldTags = ['concept', 'ui', 'deprecated'];
    const newTags = ['concept', 'ui', 'v2', 'reviewed'];

    const result = diffTags(oldTags, newTags);
    expect(result.added).toEqual(['v2', 'reviewed']);
    expect(result.removed).toEqual(['deprecated']);
    expect(result.unchanged).toEqual(['concept', 'ui']);
  });

  it('htmlToDiffableText converts TipTap HTML formatting to clean lines', () => {
    const html = '<p>Paragraaf 1</p><p>Paragraaf 2</p><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><div><p>Taak klaar</p></div></li><li data-type="taskItem" data-checked="false"><div><p>Taak open</p></div></li></ul>';
    const clean = htmlToDiffableText(html);

    expect(clean).toContain('Paragraaf 1');
    expect(clean).toContain('Paragraaf 2');
    expect(clean).toContain('- [x] Taak klaar');
    expect(clean).toContain('- [ ] Taak open');
  });

  it('computeDiffSummary produces accurate counts and human readable label', () => {
    const oldText = 'A\nB\nC';
    const newText = 'A\nB\nC\nD\nE';

    const summary = computeDiffSummary(oldText, newText);
    expect(summary.hasChanges).toBe(true);
    expect(summary.addedLines).toBe(2);
    expect(summary.removedLines).toBe(0);
    expect(summary.label).toBe('+2 regels');
  });
});
