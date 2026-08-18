import { describe, expect, it } from 'vitest';
import type { Block, Project } from '../types';
import { buildBlockPrintDocument } from './printDocument';

const now = 1_700_000_000_000;
const project: Project = {
  id: 'project-1', title: 'Project <Alpha>', description: '', color: '#000', order: 0,
  tags: [], isTrash: false, createdAt: now, updatedAt: now
};

const block = ({ id, title, ...overrides }: Partial<Block> & Pick<Block, 'id' | 'title'>): Block => ({
  id,
  projectId: 'project-1',
  parentId: null,
  title,
  content: `<p>${title}</p>`,
  plainText: title,
  order: 0,
  childCount: 0,
  taskCount: 0,
  completedTaskCount: 0,
  attachmentCount: 0,
  isTrash: false,
  tags: [],
  createdAt: now,
  updatedAt: now,
  ...overrides
});

describe('buildBlockPrintDocument', () => {
  it('prints only a selected leaf', () => {
    const leaf = block({ id: 'leaf', title: 'Los blok' });
    const result = buildBlockPrintDocument({ project, rootBlockId: leaf.id, blocks: [leaf] });

    expect(result.blockIds).toEqual(['leaf']);
    expect(result.html).toContain('<h1>Los blok</h1>');
  });

  it('prints a parent subtree depth-first with ordered siblings', () => {
    const root = block({ id: 'root', title: 'Root', childCount: 2 });
    const later = block({ id: 'later', title: 'Later', parentId: 'root', order: 2 });
    const first = block({ id: 'first', title: 'Eerst', parentId: 'root', order: 1, childCount: 1 });
    const grandchild = block({ id: 'grandchild', title: 'Kleinkind', parentId: 'first' });

    const result = buildBlockPrintDocument({
      project,
      rootBlockId: root.id,
      blocks: [later, grandchild, root, first]
    });

    expect(result.blockIds).toEqual(['root', 'first', 'grandchild', 'later']);
    expect(result.html.match(/class="print-block"/g)).toHaveLength(4);
    expect(result.html).toContain('.print-block:not(:first-child) { break-before: page; page-break-before: always; }');
  });

  it('excludes trashed descendants and blocks from other projects', () => {
    const root = block({ id: 'root', title: 'Root', childCount: 2 });
    const trashed = block({ id: 'trash', title: 'Prullenbak', parentId: 'root', isTrash: true });
    const foreign = block({ id: 'foreign', title: 'Ander project', projectId: 'project-2', parentId: 'root' });

    const result = buildBlockPrintDocument({ project, rootBlockId: root.id, blocks: [root, trashed, foreign] });

    expect(result.blockIds).toEqual(['root']);
    expect(result.html).not.toContain('Prullenbak');
    expect(result.html).not.toContain('Ander project');
  });

  it('uses the active draft in the title, content and descendant path', () => {
    const root = block({ id: 'root', title: 'Oude titel', childCount: 1 });
    const child = block({ id: 'child', title: 'Kind', parentId: 'root' });

    const result = buildBlockPrintDocument({
      project,
      rootBlockId: root.id,
      blocks: [root, child],
      draft: { title: 'Nieuwe <titel>', content: '<p>Actueel concept</p>' }
    });

    expect(result.blockIds).toEqual(['root', 'child']);
    expect(result.html).toContain('<h1>Nieuwe &lt;titel&gt;</h1>');
    expect(result.html).toContain('<p>Actueel concept</p>');
    expect(result.html).not.toContain('<h1>Oude titel</h1>');
    expect(result.html).toContain('Nieuwe &lt;titel&gt;<span class="path-separator"');
  });

  it('escapes metadata and locks the document to inline styles and data images', () => {
    const leaf = block({ id: 'leaf', title: '<script>alert(1)</script>', content: '<p>Inhoud</p>' });
    const result = buildBlockPrintDocument({ project, rootBlockId: leaf.id, blocks: [leaf] });

    expect(result.html).toContain('Project &lt;Alpha&gt;');
    expect(result.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(result.html).toContain("default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:");
    expect(result.html).toContain('@page { size: A4 portrait;');
  });

  it('rejects a missing or unavailable root block', () => {
    expect(() => buildBlockPrintDocument({ project, rootBlockId: 'missing', blocks: [] }))
      .toThrow('Het te printen blok is niet beschikbaar.');
  });
});
