import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DirectWorkspaceStore } from './direct-store.mjs';
import { handleMcpBridgeRequest } from '../src/mcp/bridge';
import { db } from '../src/db/db';
import { createCaptureBlock } from '../src/utils/quickCapture';
import { createTaskInboxProject } from '../src/utils/taskBlocks';
import type { Block } from '../src/types';

beforeEach(async () => { await db.open(); });

afterEach(async () => { db.close(); await db.delete(); });
for (const mode of ['bridge', 'direct'] as const) describe(`capture transactions through ${mode}`, () => {
  it('claims once, atomically completes, replays without duplicates and protects the source', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deepscribe-capture-test-'));
    const store = new DirectWorkspaceStore({ workspacePath: root });
    try {
      const call = mode === 'direct' ? (method: string, params: object) => store.handleRequest(method, params) : handleMcpBridgeRequest;
      const project = await call('create_project', { title: 'Capture test' }) as { id: string };
      const inbox = createTaskInboxProject();
      const capture: Block = { id: 'capture-test', projectId: inbox.id, parentId: null, title: 'My capture', content: '<p>Keep this exact source.</p>', plainText: 'Keep this exact source.', tags: ['capture', 'capture-unprocessed'], order: 0, childCount: 0, taskCount: 0, completedTaskCount: 0, attachmentCount: 0, isTrash: false, createdAt: 1, updatedAt: 1 };
      if (mode === 'direct') { store.saveProject(inbox); store.saveBlock(capture); }
      else { await db.projects.put(inbox); await db.blocks.put(capture); }
      const claims = await Promise.all([call('claim_next_capture', { agentId: 'a', requestId: 'a-claim' }), call('claim_next_capture', { agentId: 'b', requestId: 'b-claim' })]) as any[];
      expect(claims.filter(c => c.capture)).toHaveLength(1);
      const winner = claims.findIndex(c => c.capture); const agentId = winner === 0 ? 'a' : 'b'; const claim = claims[winner];
      const base = { captureId: capture.id, agentId, claimToken: claim.claimToken, requestId: 'finish', outcome: 'processed', summary: 'Knowledge and task prepared' };
      await expect(call('complete_capture', { ...base, operations: [{ type: 'knowledge', projectId: project.id, title: 'Valid', content: 'Content' }, { type: 'append', blockId: 'missing', expectedUpdatedAt: 0, content: 'Invalid' }] })).rejects.toThrow();
      const unchanged = await call('list_blocks', { projectId: project.id, recursive: true }) as any[]; expect(unchanged).toHaveLength(0);
      const request = { ...base, operations: [{ type: 'knowledge', projectId: project.id, title: 'Knowledge', content: 'Saved idea' }, { type: 'task', projectId: project.id, title: 'Follow-up', goal: 'Investigate', context: 'The idea', acceptanceCriteria: ['Findings recorded'] }] };
      const completed = await call('complete_capture', request) as any;
      expect(completed.capture.status).toBe('proposal'); expect(completed.content).toBe(capture.content);
      expect(await call('complete_capture', request)).toEqual(completed);
      expect(await call('list_blocks', { projectId: project.id, recursive: true })).toHaveLength(0);
      const applied = await call('apply_capture_proposal', { captureId: capture.id }) as any;
      expect(applied.capture.status).toBe('processed');
      expect(await call('list_blocks', { projectId: project.id, recursive: true })).toHaveLength(2);
      await expect(call('complete_capture', { ...request, summary: 'Different' })).rejects.toThrow('different content');
      await expect(call('append_to_block', { blockId: capture.id, text: 'Overwrite source' })).rejects.toThrow('preserved');
      const read = await call('get_capture', { captureId: capture.id }) as any;
      expect(read.capture.receipts).toBeUndefined();
    } finally { store.close(); fs.rmSync(root, { recursive: true, force: true }); }
  });
});

it('persists a capture request once across reloads and rejects different text with that ID', async () => {
  await db.projects.put(createTaskInboxProject());
  const payload = { text: 'Keep this thought', requestId: 'capture-save-retry' };
  const first = await createCaptureBlock(payload);
  db.close(); await db.open();
  const second = await createCaptureBlock(payload);
  expect(second?.id).toBe(first?.id); expect(await db.blocks.count()).toBe(1);
  await expect(createCaptureBlock({ ...payload, text: 'Different thought' })).rejects.toThrow('different content');
});
