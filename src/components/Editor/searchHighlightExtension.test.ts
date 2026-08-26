import { describe, expect, it } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { findMatchesInDoc } from './searchHighlightExtension';

const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'text*' },
    text: { inline: true }
  }
});

describe('searchHighlightExtension findMatchesInDoc', () => {
  it('returns empty array when search term is empty', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('Hello World')])
    ]);
    expect(findMatchesInDoc(doc, '', false)).toEqual([]);
  });

  it('finds multiple matches case-insensitively', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('Hello world, hello universe!')])
    ]);
    const matches = findMatchesInDoc(doc, 'hello', false);
    expect(matches.length).toBe(2);
    expect(matches[0]).toEqual({ from: 1, to: 6 });
    expect(matches[1]).toEqual({ from: 14, to: 19 });
  });

  it('respects case-sensitivity when enabled', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('Apple apple APPLE')])
    ]);
    const matchesCaseInsensitive = findMatchesInDoc(doc, 'apple', false);
    expect(matchesCaseInsensitive.length).toBe(3);

    const matchesCaseSensitive = findMatchesInDoc(doc, 'apple', true);
    expect(matchesCaseSensitive.length).toBe(1);
    expect(matchesCaseSensitive[0]).toEqual({ from: 7, to: 12 });
  });

  it('finds matches across multiple paragraphs', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('First match here.')]),
      schema.node('paragraph', null, [schema.text('Second match here.')])
    ]);
    const matches = findMatchesInDoc(doc, 'match', false);
    expect(matches.length).toBe(2);
  });
});
