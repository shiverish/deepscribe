import type { JSONContent } from '@tiptap/react';

export interface TipTapTaskStats {
  taskCount: number;
  completedTaskCount: number;
}

/**
 * Extract task statistics from TipTap's document tree.
 *
 * Task items are schema nodes, so reading them from the document is more
 * reliable than parsing TipTap's rendered HTML and depending on DOM markup.
 */
export function extractTipTapTaskStats(document: JSONContent): TipTapTaskStats {
  const stats: TipTapTaskStats = { taskCount: 0, completedTaskCount: 0 };

  const visit = (node: JSONContent, insideTaskList: boolean) => {
    const isTaskList = node.type === 'taskList';
    const isTaskItem = insideTaskList && node.type === 'taskItem';

    if (isTaskItem) {
      stats.taskCount += 1;
      if (node.attrs?.checked === true || node.attrs?.checked === 'true') {
        stats.completedTaskCount += 1;
      }
    }

    for (const child of node.content ?? []) {
      visit(child, insideTaskList || isTaskList);
    }
  };

  visit(document, false);
  return stats;
}
