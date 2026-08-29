import { beforeEach, describe, expect, it } from 'vitest';
import { chunksForBlock, invalidateChunks, rankChunksLocally } from './ranking.mjs';
import type { Block } from '../../src/types';

function block(overrides: Partial<Block> = {}): Block {
  const content = overrides.content ?? '<p>Leeg</p>';
  return {
    id: 'block-1', projectId: 'project-1', parentId: null, title: 'Blok', plainText: '',
    order: 0, childCount: 0, taskCount: 0, completedTaskCount: 0, attachmentCount: 0,
    tags: [], isTrash: false, createdAt: 1, updatedAt: 1, ...overrides, content
  };
}

/** A block long enough that whole-block scoring drowns a single passage. */
function longBlockWithBuriedTerm(term: string): Block {
  const filler = Array.from({ length: 40 }, (_, index) => `<p>${'ruis '.repeat(60)}regel ${index}.</p>`).join('');
  return block({
    id: 'block-long',
    title: 'Manuscript',
    content: `${filler}<h2>Uitvoering</h2><p>De ${term} bepaalt hier de uitkomst.</p>${filler}`
  });
}

beforeEach(() => invalidateChunks());

describe('chunk-aware ranking', () => {
  it('surfaces a term buried in the middle of a very long block', () => {
    const target = longBlockWithBuriedTerm('kalibratiewaarde');
    const hits = rankChunksLocally([target, block({ id: 'other', title: 'Iets anders' })], 'kalibratiewaarde');

    expect(hits).toHaveLength(1);
    expect(hits[0].block.id).toBe('block-long');
    expect(hits[0].matchReasons).toContain('body');
  });

  it('returns a snippet around the passage, not the top of the block', () => {
    const hits = rankChunksLocally([longBlockWithBuriedTerm('kalibratiewaarde')], 'kalibratiewaarde');
    expect(hits[0].snippet).toContain('kalibratiewaarde');
    expect(hits[0].snippet.length).toBeLessThan(400);
  });

  it('reports the heading the passage sits under', () => {
    const hits = rankChunksLocally([longBlockWithBuriedTerm('kalibratiewaarde')], 'kalibratiewaarde');
    expect(hits[0].heading).toBe('Uitvoering');
    expect(hits[0].chunkIndex).toBeGreaterThanOrEqual(0);
  });

  it('explains which signals matched', () => {
    const hits = rankChunksLocally([
      block({ id: 'a', title: 'Energy systeem', tags: ['energy'], content: '<p>De recharge rate loopt op.</p>' })
    ], 'energy recharge');

    expect(hits[0].matchReasons).toEqual(expect.arrayContaining(['title', 'tag', 'body']));
  });

  it('ranks a chunk carrying several query terms above one carrying a single term', () => {
    const together = block({ id: 'together', title: 'A', content: '<p>De lease en het claimtoken horen bij elkaar.</p>' });
    // Filler long enough to push the two terms into separate chunks.
    const filler = `<p>${'vulling '.repeat(150).trim()}.</p>`;
    const apart = block({ id: 'apart', title: 'B', content: `<p>Alleen de lease.</p>${filler}<p>Alleen het claimtoken.</p>` });

    const hits = rankChunksLocally([apart, together], 'lease claimtoken');
    expect(hits[0].block.id).toBe('together');
  });

  it('finds nothing for an empty query', () => {
    expect(rankChunksLocally([block()], '   ')).toEqual([]);
  });

  it('matches a task by its human id', () => {
    const task = block({
      id: 'task-1', title: 'Taak', kind: 'task',
      task: { status: 'ready', agentTarget: 'any', position: 0, taskNumber: 215 }
    });
    const hits = rankChunksLocally([task], '#TSK-215');
    expect(hits[0].block.id).toBe('task-1');
    expect(hits[0].matchReasons).toContain('task-number');
  });
});

describe('the chunk index', () => {
  it('rebuilds when the block changes and not before', () => {
    const first = block({ id: 'block-x', content: '<p>Oorspronkelijke tekst.</p>', updatedAt: 10 });
    expect(chunksForBlock(first)[0].text).toContain('Oorspronkelijke');

    // Same updatedAt: the cached split is reused even though content differs.
    const unchanged = { ...first, content: '<p>Genegeerd.</p>' };
    expect(chunksForBlock(unchanged)[0].text).toContain('Oorspronkelijke');

    const edited = { ...first, content: '<p>Nieuwe tekst.</p>', updatedAt: 11 };
    expect(chunksForBlock(edited)[0].text).toContain('Nieuwe tekst');
  });

  it('serves the new content in search results right after an edit', () => {
    const original = block({ id: 'block-y', content: '<p>Zoekterm alpha.</p>', updatedAt: 1 });
    expect(rankChunksLocally([original], 'alpha')).toHaveLength(1);

    const edited = { ...original, content: '<p>Zoekterm beta.</p>', updatedAt: 2 };
    expect(rankChunksLocally([edited], 'alpha')).toHaveLength(0);
    expect(rankChunksLocally([edited], 'beta')).toHaveLength(1);
  });

  it('drops a single block on request and leaves the rest indexed', () => {
    const kept = block({ id: 'keep', content: '<p>Bewaarde inhoud.</p>' });
    const dropped = block({ id: 'drop', content: '<p>Verwijderde inhoud.</p>' });
    rankChunksLocally([kept, dropped], 'inhoud');

    invalidateChunks('drop');
    expect(chunksForBlock(kept)[0].text).toContain('Bewaarde');
    expect(rankChunksLocally([kept], 'bewaarde')).toHaveLength(1);
  });
});
