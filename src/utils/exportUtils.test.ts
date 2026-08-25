import { describe, expect, it } from 'vitest';
import { exportBlockAsHtml, exportBlockAsMarkdown, exportBlockAsText, htmlToMarkdown, htmlToPlainText } from './exportUtils';
import type { Block, Project } from '../types';

const project: Project = {
  id: 'proj-1',
  title: 'My Architecture Project',
  description: 'Project description',
  color: '#3b82f6',
  order: 0,
  createdAt: 1000,
  updatedAt: 1000,
  isTrash: false,
  tags: []
};

const rootBlock: Block = {
  id: 'block-root',
  projectId: 'proj-1',
  parentId: null,
  title: 'Root Design',
  content: '<h2>Introduction</h2><p>This is the <strong>main</strong> design doc with a <a href="https://example.com">link</a>.</p><ul><li>First item</li><li>Second item</li></ul>',
  plainText: 'Introduction This is the main design doc with a link. First item Second item',
  order: 1,
  childCount: 1,
  taskCount: 0,
  completedTaskCount: 0,
  attachmentCount: 0,
  tags: ['design'],
  isTrash: false,
  createdAt: 1000,
  updatedAt: 1000
};

const childBlock: Block = {
  id: 'block-child',
  projectId: 'proj-1',
  parentId: 'block-root',
  title: 'Subsystem Specs',
  content: '<p>Details about subcomponents.</p><pre><code class="language-typescript">const ready = true;</code></pre>',
  plainText: 'Details about subcomponents. const ready = true;',
  order: 1,
  childCount: 0,
  taskCount: 0,
  completedTaskCount: 0,
  attachmentCount: 0,
  tags: [],
  isTrash: false,
  createdAt: 1100,
  updatedAt: 1100
};

describe('exportUtils', () => {
  it('converts rich HTML to clean Markdown', () => {
    const html = '<h1>Title</h1><p>Text with <strong>bold</strong>, <em>italic</em>, <code>code</code>, and <a href="https://deepscribe.app">Link</a>.</p><blockquote><p>A quote</p></blockquote><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked><span></span></label><div><p>Task done</p></div></li><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Task open</p></div></li></ul>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('# Title');
    expect(md).toContain('**bold**');
    expect(md).toContain('*italic*');
    expect(md).toContain('`code`');
    expect(md).toContain('[Link](https://deepscribe.app)');
    expect(md).toContain('> A quote');
    expect(md).toContain('- [x] Task done');
    expect(md).toContain('- [ ] Task open');
  });

  it('converts HTML to plain text', () => {
    const html = '<h1>Header</h1><p>Paragraph text.</p><ul><li>Item 1</li><li>Item 2</li></ul>';
    const text = htmlToPlainText(html);
    expect(text).toContain('Header');
    expect(text).toContain('Paragraph text.');
    expect(text).toContain('Item 1');
    expect(text).toContain('Item 2');
  });

  it('exports block hierarchy as Markdown', () => {
    const md = exportBlockAsMarkdown({
      project,
      rootBlock,
      blocks: [rootBlock, childBlock],
      includeChildren: true
    });
    expect(md).toContain('# Root Design');
    expect(md).toContain('## Subsystem Specs');
    expect(md).toContain('```typescript\nconst ready = true;\n```');
    expect(md).toContain('My Architecture Project');
  });

  it('exports block hierarchy as plain text', () => {
    const text = exportBlockAsText({
      project,
      rootBlock,
      blocks: [rootBlock, childBlock],
      includeChildren: true
    });
    expect(text).toContain('Root Design');
    expect(text).toContain('Subsystem Specs');
    expect(text).toContain('Details about subcomponents.');
  });

  it('exports block hierarchy as HTML', () => {
    const html = exportBlockAsHtml({
      project,
      rootBlock,
      blocks: [rootBlock, childBlock],
      includeChildren: true
    });
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Root Design');
    expect(html).toContain('Subsystem Specs');
  });
});
