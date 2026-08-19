import { describe, expect, it } from 'vitest';
import { extractHashtags, getTagColor, mergeTags, normalizeTag, parseTag, sanitizeTags } from './tagUtils';

describe('tagUtils', () => {
  it('normalizes tags correctly', () => {
    expect(normalizeTag('#Idee')).toBe('idee');
    expect(normalizeTag('  ###Cyberpunk  ')).toBe('cyberpunk');
    expect(normalizeTag('')).toBe('');
    expect(normalizeTag('  #Cafe\u0301 ')).toBe('café');
    expect(parseTag('two words').error).toMatch(/only letters/);
    expect(parseTag('a'.repeat(49)).error).toMatch(/48/);
  });

  it('generates consistent colors for the same tag', () => {
    const color1 = getTagColor('concept');
    const color2 = getTagColor('#Concept');
    expect(color1).toEqual(color2);
    expect(color1.bg).toContain('hsl');
    expect(color1.text).toContain('hsl');
  });

  it('extracts hashtags from text and HTML', () => {
    const html = '<h1>Titel</h1><p>Dit is een #idee en een #test_tag voor ons #project-1!</p>';
    const tags = extractHashtags(html);
    expect(tags).toEqual(['idee', 'test_tag', 'project-1']);
  });

  it('avoids common false positives and supports Unicode hashtags', () => {
    const text = 'C#code https://site.test/#sectie kleur #fff issue #123, wel #ideeën en (#東京-1).';
    expect(extractHashtags(text)).toEqual(['ideeën', '東京-1']);
  });

  it('merges and deduplicates tag arrays', () => {
    const existing = ['idee', 'concept'];
    const additions = ['#Concept', 'nieuw', '#Idee'];
    expect(mergeTags(existing, additions)).toEqual(['idee', 'concept', 'nieuw']);
  });

  it('sanitizes imported lists consistently', () => {
    expect(sanitizeTags([' Idee ', '#idee', 'twee woorden', 'CAFÉ', 'Cafe\u0301'])).toEqual(['idee', 'café']);
  });
});
