import type { Block, Project } from '../types';

export type ReferenceableItemType = 'project' | 'block';

export function formatAgentReference(
  item: Block | Project,
  type: ReferenceableItemType
): string {
  const label = type === 'project' ? 'project' : 'block';
  const idLabel = type === 'project' ? 'projectId' : 'blockId';
  const title = item.title.trim() || (type === 'project' ? 'Naamloos project' : 'Naamloos blok');

  return `DeepScribe ${label} "${title}" (${idLabel}: ${item.id})`;
}

export async function copyAgentReference(
  item: Block | Project,
  type: ReferenceableItemType
): Promise<void> {
  await navigator.clipboard.writeText(formatAgentReference(item, type));
}
