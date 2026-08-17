import type { Attachment, Block, Project } from '../types';
import { sanitizeTags } from '../utils/tagUtils';

export const MAX_ARCHIVE_FILE_BYTES = 250 * 1024 * 1024;
export const MAX_PROJECT_JSON_CHARS = 25 * 1024 * 1024;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 150 * 1024 * 1024;

export type AttachmentMeta = Omit<Attachment, 'dataUrl' | 'localPath'>;

export interface ProjectArchive {
  version: string;
  project: Project;
  blocks: Block[];
  attachmentsMeta: AttachmentMeta[];
  normalizedTagBlocks: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const requiredString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Ongeldig veld: ${field}.`);
  return value;
};

const requiredNumber = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Ongeldig veld: ${field}.`);
  return value;
};

export function parseProjectArchive(raw: unknown): ProjectArchive {
  if (!isRecord(raw) || !isRecord(raw.project) || !Array.isArray(raw.blocks)) {
    throw new Error('Dit bestand bevat geen geldig DeepScribe-project.');
  }
  if (raw.blocks.length > 100_000) throw new Error('Dit archief bevat te veel blokken.');

  const sourceProject = raw.project;
  const projectCreatedAt = requiredNumber(sourceProject.createdAt, 'project.createdAt');
  const project: Project = {
    id: requiredString(sourceProject.id, 'project.id'),
    title: requiredString(sourceProject.title, 'project.title'),
    description: typeof sourceProject.description === 'string' ? sourceProject.description : '',
    color: typeof sourceProject.color === 'string' ? sourceProject.color : '#F59E0B',
    order: typeof sourceProject.order === 'number' && Number.isFinite(sourceProject.order) ? sourceProject.order : projectCreatedAt,
    tags: sanitizeTags(Array.isArray(sourceProject.tags) ? sourceProject.tags.filter((tag): tag is string => typeof tag === 'string') : []),
    icon: typeof sourceProject.icon === 'string' ? sourceProject.icon : undefined,
    isTrash: false,
    createdAt: projectCreatedAt,
    updatedAt: requiredNumber(sourceProject.updatedAt, 'project.updatedAt')
  };

  const ids = new Set<string>();
  let normalizedTagBlocks = 0;
  const blocks = raw.blocks.map((entry, index): Block => {
    if (!isRecord(entry)) throw new Error(`Blok ${index + 1} is ongeldig.`);
    const id = requiredString(entry.id, `blocks[${index}].id`);
    if (ids.has(id)) throw new Error(`Dubbel blok-id in archief: ${id}.`);
    ids.add(id);
    const parentId = entry.parentId === null ? null : requiredString(entry.parentId, `blocks[${index}].parentId`);
    const importedTags = Array.isArray(entry.tags) ? entry.tags.filter((t): t is string => typeof t === 'string') : [];
    const tags = sanitizeTags(importedTags);
    if (importedTags.length !== tags.length || importedTags.some((tag, tagIndex) => tag !== tags[tagIndex])) {
      normalizedTagBlocks += 1;
    }
    return {
      id,
      projectId: project.id,
      parentId,
      title: requiredString(entry.title, `blocks[${index}].title`),
      content: typeof entry.content === 'string' ? entry.content : '<p></p>',
      plainText: typeof entry.plainText === 'string' ? entry.plainText : '',
      order: requiredNumber(entry.order, `blocks[${index}].order`),
      childCount: Math.max(0, requiredNumber(entry.childCount, `blocks[${index}].childCount`)),
      taskCount: Math.max(0, requiredNumber(entry.taskCount, `blocks[${index}].taskCount`)),
      completedTaskCount: Math.max(0, requiredNumber(entry.completedTaskCount, `blocks[${index}].completedTaskCount`)),
      attachmentCount: Math.max(0, requiredNumber(entry.attachmentCount, `blocks[${index}].attachmentCount`)),
      isTrash: Boolean(entry.isTrash),
      trashedAt: typeof entry.trashedAt === 'number' ? entry.trashedAt : undefined,
      trashedWithProject: false,
      tags,
      lastAgentEditAt: typeof entry.lastAgentEditAt === 'number' && Number.isFinite(entry.lastAgentEditAt) ? entry.lastAgentEditAt : undefined,
      lastSeenAgentEditAt: typeof entry.lastSeenAgentEditAt === 'number' && Number.isFinite(entry.lastSeenAgentEditAt) ? entry.lastSeenAgentEditAt : undefined,
      createdAt: requiredNumber(entry.createdAt, `blocks[${index}].createdAt`),
      updatedAt: requiredNumber(entry.updatedAt, `blocks[${index}].updatedAt`)
    };
  });

  const byId = new Map(blocks.map(block => [block.id, block]));
  for (const block of blocks) {
    if (block.parentId && !byId.has(block.parentId)) throw new Error(`Bovenliggend blok ontbreekt voor “${block.title}”.`);
    const visited = new Set<string>([block.id]);
    let current = block;
    while (current.parentId) {
      if (visited.has(current.parentId)) throw new Error('Het archief bevat een circulaire boomstructuur.');
      visited.add(current.parentId);
      current = byId.get(current.parentId)!;
    }
  }

  const rawMeta = Array.isArray(raw.attachmentsMeta) ? raw.attachmentsMeta : [];
  const attachmentsMeta = rawMeta.map((entry, index): AttachmentMeta => {
    if (!isRecord(entry)) throw new Error(`Bijlage ${index + 1} is ongeldig.`);
    const blockId = requiredString(entry.blockId, `attachmentsMeta[${index}].blockId`);
    if (!ids.has(blockId)) throw new Error('Een bijlage verwijst naar een onbekend blok.');
    return {
      id: requiredString(entry.id, `attachmentsMeta[${index}].id`),
      blockId,
      fileName: requiredString(entry.fileName, `attachmentsMeta[${index}].fileName`),
      fileType: typeof entry.fileType === 'string' ? entry.fileType : 'application/octet-stream',
      fileSize: Math.max(0, requiredNumber(entry.fileSize, `attachmentsMeta[${index}].fileSize`)),
      createdAt: requiredNumber(entry.createdAt, `attachmentsMeta[${index}].createdAt`)
    };
  });

  return { version: typeof raw.version === 'string' ? raw.version : '1.0', project, blocks, attachmentsMeta, normalizedTagBlocks };
}
