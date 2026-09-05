import { describe, expect, it } from 'vitest';
import { parseProjectArchive } from './archive';

const validArchive = () => ({
  version: '1.0',
  project: { id: 'project-1', title: 'Boek', description: '', color: '#fff', createdAt: 1, updatedAt: 2 },
  blocks: [{
    id: 'root', projectId: 'project-1', parentId: null, title: 'Hoofdstuk', content: '<p>Tekst</p>', plainText: 'Tekst',
    order: 0, childCount: 1, taskCount: 0, completedTaskCount: 0, attachmentCount: 0, isTrash: false, createdAt: 1, updatedAt: 2
  }, {
    id: 'child', projectId: 'project-1', parentId: 'root', title: 'Scène', content: '<p></p>', plainText: '',
    order: 0, childCount: 0, taskCount: 0, completedTaskCount: 0, attachmentCount: 0, isTrash: false, createdAt: 1, updatedAt: 2
  }],
  attachmentsMeta: []
});

describe('archive validation', () => {
  it('normalizes a valid project and ignores archived project trash state', () => {
    const source = validArchive();
    Object.assign(source.project, { isTrash: true, trashedAt: 123 });
    const archive = parseProjectArchive(source);
    expect(archive.project.isTrash).toBe(false);
    expect(archive.blocks).toHaveLength(2);
  });

  it('rejects missing parents', () => {
    const source = validArchive();
    source.blocks[1].parentId = 'missing';
    expect(() => parseProjectArchive(source)).toThrow(/Parent block is missing/);
  });

  it('rejects cycles', () => {
    const source = validArchive();
    source.blocks[0].parentId = 'child';
    expect(() => parseProjectArchive(source)).toThrow(/circular tree structure/);
  });

  it('normalizes, deduplicates and rejects invalid imported tags', () => {
    const source = validArchive();
    Object.assign(source.project, { tags: [' App ', '#app', 'twee woorden', 'DESKTOP'] });
    Object.assign(source.blocks[0], { tags: [' Idee ', '#idee', 'twee woorden', 'CAFÉ'] });
    expect(parseProjectArchive(source).project.tags).toEqual(['app', 'desktop']);
    expect(parseProjectArchive(source).blocks[0].tags).toEqual(['idee', 'café']);
  });

  it('preserves typed task metadata and revision metadata', () => {
    const source = validArchive();
    Object.assign(source.blocks[1], {
      kind: 'task',
      task: { status: 'ready', agentTarget: 'openai', completionPolicy: 'review-required', creator: { type: 'agent', agentTarget: 'openai', agentId: 'codex-1', requestId: 'create-1' } }
    });
    Object.assign(source, {
      revisions: [{
        id: 'revision-1', blockId: 'child', projectId: 'project-1', title: 'Scène', content: '<p>Oud</p>',
        plainText: 'Oud', tags: [], kind: 'task',
        task: { status: 'draft', agentTarget: 'none', completionPolicy: 'auto-complete', creator: { type: 'agent', agentTarget: 'custom', agentId: 'local-1', requestId: 'create-2', customAgentName: 'Local Agent' } },
        source: 'user', createdAt: 3
      }]
    });

    const archive = parseProjectArchive(source);
    expect(archive.blocks[1].task).toMatchObject({ status: 'ready', agentTarget: 'openai', creator: { type: 'agent', agentTarget: 'openai', agentId: 'codex-1', requestId: 'create-1' } });
    expect(archive.revisions?.[0].task).toMatchObject({ status: 'inbox', agentTarget: 'none', creator: { type: 'agent', agentTarget: 'custom', customAgentName: 'Local Agent' } });
  });

  it('keeps legacy blocks untyped and rejects invalid task metadata', () => {
    const legacy = parseProjectArchive(validArchive());
    expect(legacy.blocks.every(block => block.kind === undefined && block.task === undefined)).toBe(true);

    const source = validArchive();
    Object.assign(source.blocks[1], { kind: 'task', task: { status: 'ready', agentTarget: 'custom', completionPolicy: 'review-required' } });
    expect(() => parseProjectArchive(source)).toThrow(/customAgentName/);
  });

  it('never restores a live claim from an imported archive', () => {
    const source = validArchive();
    Object.assign(source.blocks[1], {
      kind: 'task',
      task: {
        status: 'claimed', agentTarget: 'openai', completionPolicy: 'review-required', readyAt: 10, claimAttempt: 2,
        claim: { ownerId: 'agent', token: 'secret', expiresAt: 999999 }
      }
    });
    const imported = parseProjectArchive(source).blocks[1].task;
    expect(imported).toMatchObject({ status: 'ready', readyAt: 10, claimAttempt: 2 });
    expect(imported?.claim).toBeUndefined();
  });
});

it('preserves capture questions and results while removing imported leases and replay IDs', () => {
  const archive = validArchive();
  Object.assign(archive.blocks[0], {
    tags: ['capture', 'capture-unprocessed'],
    capture: { status: 'processing', requestId: 'old-save', claim: { token: 'secret', ownerId: 'agent', expiresAt: 999999 }, claimRequests: [{ agentId: 'agent', requestId: 'old' }], receipts: [{ requestId: 'old' }], questions: [{ question: 'Where?', askedAt: 1, answer: 'Here', answeredAt: 2 }], results: [{ blockId: 'child', title: 'Result', action: 'existing' }] }
  });
  const metadata = parseProjectArchive(archive).blocks[0].capture;
  expect(metadata?.status).toBe('pending');
  expect(metadata?.claim).toBeUndefined(); expect(metadata?.requestId).toBeUndefined(); expect(metadata?.receipts).toBeUndefined(); expect(metadata?.claimRequests).toBeUndefined();
  expect(metadata?.questions?.[0].answer).toBe('Here'); expect(metadata?.results?.[0].blockId).toBe('child');
});
