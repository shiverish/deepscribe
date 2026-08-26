import type { Block, Project } from '../types';
import { formatTaskDeepLink, formatTaskHumanId } from './taskBlocks';

export type ReferenceableItemType = 'project' | 'block';

export function formatAgentReference(
  item: Block | Project,
  type: ReferenceableItemType
): string {
  const title = item.title.trim() || (type === 'project' ? 'Untitled project' : 'Untitled block');
  
  if (type === 'block' && (item as Block).kind === 'task') {
    const taskBlock = item as Block;
    const humanId = formatTaskHumanId(taskBlock.task?.taskNumber);
    const deepLink = formatTaskDeepLink(taskBlock.task?.taskNumber ?? taskBlock.id);
    if (humanId) {
      return `${humanId}: "${title}" (${deepLink})`;
    }
    return `DeepScribe task "${title}" (blockId: ${taskBlock.id}, ${deepLink})`;
  }

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
