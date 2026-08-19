import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { WorkspaceStore } = require('./workspace.cjs') as {
  WorkspaceStore: new (paths: { userDataPath: string; documentsPath: string }) => {
    status(): { path: string; encrypted: boolean; counts: { projects: number; blocks: number } };
    saveSnapshot(snapshot: Record<string, unknown[]>): void;
    loadSnapshot(): { projects: Array<{ id: string }>; blocks: Array<{ id: string }> };
    move(destination: string): { path: string; previousPath: string };
    close(): void;
  };
};

const roots: string[] = [];

function temporaryRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deepscribe-workspace-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('plaintext workspace store', () => {
  it('persists a relational snapshot in SQLite', () => {
    const root = temporaryRoot();
    const store = new WorkspaceStore({ userDataPath: path.join(root, 'user'), documentsPath: path.join(root, 'docs') });
    store.saveSnapshot({
      projects: [{ id: 'project', title: 'Project' }],
      blocks: [{ id: 'block', projectId: 'project', parentId: null, title: 'Blok' }],
      attachments: [], settings: [], activities: [], templates: []
    });
    expect(store.status().encrypted).toBe(false);
    expect(store.status().counts).toMatchObject({ projects: 1, blocks: 1 });
    expect(store.loadSnapshot().blocks[0].id).toBe('block');
    store.close();
  });

  it('copies and verifies a workspace before switching locations', () => {
    const root = temporaryRoot();
    const store = new WorkspaceStore({ userDataPath: path.join(root, 'user'), documentsPath: path.join(root, 'docs') });
    store.status();
    const original = store.status().path;
    const moved = store.move(path.join(root, 'destination'));
    expect(moved.previousPath).toBe(original);
    expect(fs.existsSync(path.join(moved.path, 'workspace.sqlite'))).toBe(true);
    expect(fs.existsSync(path.join(original, 'workspace.sqlite'))).toBe(true);
    store.close();
  });

  it('rejects a destination inside the active workspace', () => {
    const root = temporaryRoot();
    const store = new WorkspaceStore({ userDataPath: path.join(root, 'user'), documentsPath: path.join(root, 'docs') });
    const current = store.status().path;
    expect(() => store.move(path.join(current, 'nested'))).toThrow(/cannot be placed inside/);
    store.close();
  });
});
