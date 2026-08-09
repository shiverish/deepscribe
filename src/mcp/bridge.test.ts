import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import type { Project } from '../types';
import { handleMcpBridgeRequest } from './bridge';

beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
});

afterAll(async () => {
  db.close();
  await db.delete();
});

describe('DeepScribe MCP project tags', () => {
  it('creates and updates normalized project tags', async () => {
    const created = await handleMcpBridgeRequest('create_project', {
      title: 'Getagd project',
      tags: [' App ', '#app', 'DESKTOP', 'ongeldige tag']
    }) as Project;
    expect(created.tags).toEqual(['app', 'desktop']);

    const updated = await handleMcpBridgeRequest('update_project', {
      projectId: created.id,
      tags: ['Concept', '#idee']
    }) as Project;
    expect(updated.tags).toEqual(['concept', 'idee']);
  });
});
