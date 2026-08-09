import { describe, expect, it } from 'vitest';
import { parseSearchQuery } from './searchUtils';

describe('parseSearchQuery', () => {
  it('separates free text from exact tag filters', () => {
    expect(parseSearchQuery('hoofdstuk #Concept #idee')).toEqual({
      text: 'hoofdstuk',
      tags: ['concept', 'idee']
    });
  });

  it('deduplicates tags and keeps invalid tag tokens as text', () => {
    expect(parseSearchQuery('#idee #Idee #fout! woorden')).toEqual({
      text: '#fout! woorden',
      tags: ['idee']
    });
  });
});
