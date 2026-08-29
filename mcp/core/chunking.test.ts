import { describe, expect, it } from 'vitest';
import { buildSnippet, chunkBlockContent } from './chunking.mjs';

describe('block chunking', () => {
  it('keeps each chunk under the heading it belongs to', () => {
    const chunks = chunkBlockContent(
      '<h2>Doel</h2><p>Het doel van dit blok.</p><h2>Context</h2><p>De context van dit blok.</p>'
    );
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({ index: 0, heading: 'Doel' });
    expect(chunks[0].text).toContain('Het doel');
    expect(chunks[1]).toMatchObject({ index: 1, heading: 'Context' });
    expect(chunks[1].text).toContain('De context');
    expect(chunks[1].text).not.toContain('Het doel');
  });

  it('packs short paragraphs together instead of making a chunk per line', () => {
    const html = Array.from({ length: 6 }, (_, index) => `<p>Korte alinea ${index}.</p>`).join('');
    const chunks = chunkBlockContent(html);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain('Korte alinea 0');
    expect(chunks[0].text).toContain('Korte alinea 5');
  });

  it('splits a long block into several chunks that stay within the maximum', () => {
    const paragraph = `<p>${'woord '.repeat(400).trim()}.</p>`;
    const chunks = chunkBlockContent(paragraph);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.text.length).toBeLessThanOrEqual(1400);
    expect(chunks.map(chunk => chunk.index)).toEqual(chunks.map((_, index) => index));
  });

  it('overlaps consecutive chunks so a phrase across a seam still matches', () => {
    const html = Array.from({ length: 12 }, (_, index) => `<p>${'vulling '.repeat(20)}marker${index}.</p>`).join('');
    const chunks = chunkBlockContent(html);
    expect(chunks.length).toBeGreaterThan(1);
    const tailOfFirst = chunks[0].text.slice(-60);
    const headOfSecond = chunks[1].text.slice(0, 120);
    expect(headOfSecond).toContain(tailOfFirst.split(' ').at(-1) ?? '');
  });

  it('reads list items and table rows as text', () => {
    const chunks = chunkBlockContent('<ul><li><p>Eerste punt</p></li><li><p>Tweede punt</p></li></ul>');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain('Eerste punt');
    expect(chunks[0].text).toContain('Tweede punt');
  });

  it('returns nothing for content without text', () => {
    expect(chunkBlockContent('')).toEqual([]);
    expect(chunkBlockContent('<p></p>')).toEqual([]);
  });
});

describe('snippets', () => {
  it('returns short text unchanged', () => {
    expect(buildSnippet('Een korte zin.', ['korte'])).toBe('Een korte zin.');
  });

  it('centres the excerpt on the first matching term', () => {
    const text = `${'begin '.repeat(60)}naaldindehooiberg ${'einde '.repeat(60)}`;
    const snippet = buildSnippet(text, ['naaldindehooiberg']);
    expect(snippet).toContain('naaldindehooiberg');
    expect(snippet.length).toBeLessThan(300);
    expect(snippet.startsWith('…')).toBe(true);
  });

  it('falls back to the opening when no term is present', () => {
    const snippet = buildSnippet('a'.repeat(500), ['ontbreekt']);
    expect(snippet.startsWith('aaa')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
  });
});
