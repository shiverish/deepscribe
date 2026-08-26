import type { Block, Project } from '../types';
import { formatTaskHumanId } from './taskBlocks';

export type ReferenceableItemType = 'project' | 'block';

export function formatAgentReference(
  item: Block | Project,
  type: ReferenceableItemType
): string {
  if (type === 'block' && (item as Block).kind === 'task') {
    const taskBlock = item as Block;
    const humanId = formatTaskHumanId(taskBlock.task?.taskNumber);
    if (humanId) {
      return humanId;
    }
    return `DeepScribe task (blockId: ${taskBlock.id})`;
  }

  const title = item.title.trim() || (type === 'project' ? 'Untitled project' : 'Untitled block');
  const label = type === 'project' ? 'project' : 'block';
  const idLabel = type === 'project' ? 'projectId' : 'blockId';
  return `DeepScribe ${label} "${title}" (${idLabel}: ${item.id})`;
}

export async function copyAgentReference(
  item: Block | Project,
  type: ReferenceableItemType
): Promise<void> {
  await navigator.clipboard.writeText(formatAgentReference(item, type));
}
