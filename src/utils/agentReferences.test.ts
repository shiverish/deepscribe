import { describe, expect, it } from 'vitest';
import type { Block, Project } from '../types';
import { formatAgentReference } from './agentReferences';

const project: Project = {
  id: 'proj-123', title: 'Lancering', description: '', color: '#fff', order: 0, tags: [],
  isTrash: false, createdAt: 1, updatedAt: 1
};

const block: Block = {
  id: 'block-456', projectId: project.id, parentId: null, title: 'Open vragen', content: '', plainText: '',
  order: 0, childCount: 0, taskCount: 0, completedTaskCount: 0, attachmentCount: 0, tags: [],
  isTrash: false, createdAt: 1, updatedAt: 1
};

describe('agent references', () => {
  it('formats a project with the MCP parameter name', () => {
    expect(formatAgentReference(project, 'project'))
      .toBe('DeepScribe project "Lancering" (projectId: proj-123)');
  });

  it('formats a block with the MCP parameter name', () => {
    expect(formatAgentReference(block, 'block'))
      .toBe('DeepScribe block "Open vragen" (blockId: block-456)');
  });
});
