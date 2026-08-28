import { describe, expect, it } from 'vitest';
import { parseSearchQuery, rankTopTags } from './searchUtils';

describe('parseSearchQuery', () => {
  it('separates free text from exact tag filters', () => {
    expect(parseSearchQuery('hoofdstuk #Concept #idee')).toEqual({
      text: 'hoofdstuk',
      tags: ['concept', 'idee'],
      taskNumbers: []
    });
  });

  it('deduplicates tags and keeps invalid tag tokens as text', () => {
    expect(parseSearchQuery('#idee #Idee #fout! woorden')).toEqual({
      text: '#fout! woorden',
      tags: ['idee'],
      taskNumbers: []
    });
  });

  it('recognizes task IDs such as #187, TSK-187, #TSK-187 and bare numbers', () => {
    expect(parseSearchQuery('TSK-187')).toEqual({
      text: 'tsk-187',
      tags: [],
      taskNumbers: [187]
    });
    expect(parseSearchQuery('#187')).toEqual({
      text: '#187',
      tags: [],
      taskNumbers: [187]
    });
    expect(parseSearchQuery('#TSK-187')).toEqual({
      text: '#tsk-187',
      tags: [],
      taskNumbers: [187]
    });
    expect(parseSearchQuery('187')).toEqual({
      text: '187',
      tags: [],
      taskNumbers: [187]
    });
  });

  it('handles mixed task ID, tag, and free text queries', () => {
    expect(parseSearchQuery('#concept #187 TSK-42 fix login bug')).toEqual({
      text: '#187 tsk-42 fix login bug',
      tags: ['concept'],
      taskNumbers: [187, 42]
    });
  });
});

describe('rankTopTags', () => {
  it('sorts tags by count descending then alphabetically and limits to specified count', () => {
    const sample: { tag: string; count: number }[] = [
      { tag: 'zebra', count: 5 },
      { tag: 'apple', count: 5 },
      { tag: 'banana', count: 10 },
      { tag: 'orange', count: 2 },
      { tag: 'grape', count: 8 }
    ];

    expect(rankTopTags(sample, [], 3)).toEqual(['banana', 'grape', 'apple']);
  });

  it('includes active tags that are outside the top limit', () => {
    const sample: { tag: string; count: number }[] = [
      { tag: 'tag1', count: 10 },
      { tag: 'tag2', count: 9 },
      { tag: 'tag3', count: 8 },
      { tag: 'tag4', count: 7 },
      { tag: 'rareTag', count: 1 }
    ];

    expect(rankTopTags(sample, ['rareTag'], 2)).toEqual(['tag1', 'tag2', 'rareTag']);
  });
});
