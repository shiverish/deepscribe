import { describe, expect, it } from 'vitest';
import { extractTipTapTaskStats } from './tipTapTaskExtraction';

describe('extractTipTapTaskStats', () => {
  it('extracts open and completed taskItem nodes from a taskList', () => {
    const stats = extractTipTapTaskStats({
      type: 'doc',
      content: [{
        type: 'taskList',
        content: [
          { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph' }] },
          { type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph' }] }
        ]
      }]
    });

    expect(stats).toEqual({ taskCount: 2, completedTaskCount: 1 });
  });

  it('includes taskItem nodes from nested taskList nodes', () => {
    const stats = extractTipTapTaskStats({
      type: 'doc',
      content: [{
        type: 'taskList',
        content: [{
          type: 'taskItem',
          attrs: { checked: true },
          content: [
            { type: 'paragraph' },
            {
              type: 'taskList',
              content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph' }] }]
            }
          ]
        }]
      }]
    });

    expect(stats).toEqual({ taskCount: 2, completedTaskCount: 1 });
  });

  it('does not treat unrelated or malformed nodes as TipTap tasks', () => {
    const stats = extractTipTapTaskStats({
      type: 'doc',
      content: [
        { type: 'bulletList', content: [{ type: 'listItem', attrs: { checked: true } }] },
        { type: 'taskItem', attrs: { checked: true } }
      ]
    });

    expect(stats).toEqual({ taskCount: 0, completedTaskCount: 0 });
  });
});
