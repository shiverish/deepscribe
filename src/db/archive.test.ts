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
    expect(() => parseProjectArchive(source)).toThrow(/Bovenliggend blok ontbreekt/);
  });

  it('rejects cycles', () => {
    const source = validArchive();
    source.blocks[0].parentId = 'child';
    expect(() => parseProjectArchive(source)).toThrow(/circulaire boomstructuur/);
  });
});
