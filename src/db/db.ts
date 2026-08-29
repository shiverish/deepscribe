import Dexie, { type Table } from 'dexie';
import type { Project, Block, Attachment, ActivityEntry, BlockTemplate, BlockRevision, BlockLink } from '../types';
import { sanitizeTags } from '../utils/tagUtils';
import { createTaskInboxProject, normalizeTaskMetadata, TASK_INBOX_PROJECT_ID } from '../utils/taskBlocks';
import { linkKey, syncWikiLinksForBlock } from '../../mcp/core/links.mjs';

const LEGACY_AGENT_STATUSES = ['agent-ready', 'agent-claimed', 'agent-blocked', 'agent-review', 'agent-done'] as const;

function legacyTaskStatus(tags: string[]) {
  if (tags.includes('agent-ready')) return 'ready' as const;
  if (tags.includes('agent-claimed')) return 'in-progress' as const;
  if (tags.includes('agent-blocked')) return 'blocked' as const;
  if (tags.includes('agent-review')) return 'review' as const;
  if (tags.includes('agent-done')) return 'done' as const;
  return 'inbox' as const;
}

function isLegacyStructuredWorkItem(block: Block): boolean {
  if (!block.tags?.includes('todo')) return false;
  const headings = [...(block.content || '').matchAll(/<h[1-6][^>]*>\s*([^<]+?)\s*<\/h[1-6]>/gi)]
    .map(match => match[1].trim().toLocaleLowerCase('en-US'));
  return (headings.includes('goal') || headings.includes('doel'))
    && headings.includes('context')
    && (headings.includes('acceptance criteria') || headings.includes('acceptatiecriteria'));
}

export class DeepScribeDatabase extends Dexie {
  projects!: Table<Project, string>;
  blocks!: Table<Block, string>;
  attachments!: Table<Attachment, string>;
  settings!: Table<{ key: string; value: any }, string>;
  activities!: Table<ActivityEntry, string>;
  templates!: Table<BlockTemplate, string>;
  revisions!: Table<BlockRevision, string>;
  links!: Table<BlockLink, string>;

  constructor() {
    super('DeepScribeDB');
    this.version(1).stores({
      projects: 'id, title, createdAt, updatedAt',
      blocks: 'id, projectId, parentId, order, isTrash, plainText, updatedAt',
      attachments: 'id, blockId, fileName, createdAt'
    });
    this.version(2).stores({
      projects: 'id, title, isTrash, createdAt, updatedAt',
      blocks: 'id, projectId, parentId, order, isTrash, plainText, updatedAt',
      attachments: 'id, blockId, fileName, createdAt'
    }).upgrade(transaction => transaction.table<Project>('projects').toCollection().modify(project => {
      project.isTrash = project.isTrash ?? false;
    }));
    this.version(3).stores({
      projects: 'id, title, isTrash, createdAt, updatedAt',
      blocks: 'id, projectId, parentId, order, isTrash, *tags, plainText, updatedAt',
      attachments: 'id, blockId, fileName, createdAt'
    }).upgrade(transaction => transaction.table<Block>('blocks').toCollection().modify(block => {
      block.tags = block.tags ?? [];
    }));
    this.version(4).stores({
      projects: 'id, title, isTrash, createdAt, updatedAt',
      blocks: 'id, projectId, parentId, order, isTrash, *tags, plainText, updatedAt',
      attachments: 'id, blockId, fileName, createdAt'
    }).upgrade(transaction => transaction.table<Block>('blocks').toCollection().modify(block => {
      block.tags = sanitizeTags(block.tags);
    }));
    this.version(5).stores({
      projects: 'id, title, isTrash, createdAt, updatedAt',
      blocks: 'id, projectId, parentId, order, isTrash, *tags, plainText, updatedAt',
      attachments: 'id, blockId, fileName, createdAt',
      settings: 'key'
    });
    this.version(6).stores({
      projects: 'id, title, isTrash, createdAt, updatedAt',
      blocks: 'id, projectId, parentId, order, isTrash, *tags, plainText, updatedAt',
      attachments: 'id, blockId, fileName, createdAt',
      settings: 'key'
    }).upgrade(transaction => transaction.table<Project>('projects').toCollection().modify(project => {
      project.order = project.order ?? project.createdAt;
    }));
    this.version(7).stores({
      projects: 'id, title, isTrash, *tags, createdAt, updatedAt',
      blocks: 'id, projectId, parentId, order, isTrash, *tags, plainText, updatedAt',
      attachments: 'id, blockId, fileName, createdAt',
      settings: 'key'
    }).upgrade(transaction => transaction.table<Project>('projects').toCollection().modify(project => {
      project.tags = sanitizeTags(project.tags);
    }));
    this.version(8).stores({
      projects: 'id, title, isTrash, *tags, createdAt, updatedAt',
      blocks: 'id, projectId, parentId, order, isTrash, *tags, plainText, updatedAt',
      attachments: 'id, blockId, fileName, createdAt',
      settings: 'key',
      activities: 'id, projectId, blockId, source, action, createdAt',
      templates: 'id, name, createdAt'
    });
    this.version(9).stores({
      projects: 'id, title, isTrash, *tags, createdAt, updatedAt',
      blocks: 'id, projectId, parentId, order, isTrash, *tags, plainText, updatedAt',
      attachments: 'id, blockId, fileName, createdAt',
      settings: 'key',
      activities: 'id, projectId, blockId, source, action, createdAt',
      templates: 'id, name, createdAt',
      revisions: 'id, blockId, projectId, source, createdAt'
    });
    this.version(10).stores({
      projects: 'id, title, isTrash, *tags, createdAt, updatedAt',
      blocks: 'id, projectId, parentId, order, isTrash, *tags, *dependsOn, plainText, updatedAt',
      attachments: 'id, blockId, fileName, createdAt',
      settings: 'key',
      activities: 'id, projectId, blockId, source, action, createdAt',
      templates: 'id, name, createdAt',
      revisions: 'id, blockId, projectId, source, createdAt'
    });
    this.version(11).stores({
      projects: 'id, title, isTrash, *tags, createdAt, updatedAt',
      blocks: 'id, projectId, parentId, order, isTrash, *tags, *dependsOn, plainText, updatedAt',
      attachments: 'id, blockId, fileName, createdAt',
      settings: 'key',
      activities: 'id, projectId, blockId, source, action, createdAt',
      templates: 'id, name, createdAt',
      revisions: 'id, blockId, projectId, source, createdAt'
    });
    this.version(12).stores({
      projects: 'id, title, isTrash, *tags, createdAt, updatedAt',
      blocks: 'id, projectId, parentId, order, isTrash, kind, task.status, task.position, *tags, *dependsOn, plainText, updatedAt',
      attachments: 'id, blockId, fileName, createdAt',
      settings: 'key',
      activities: 'id, projectId, blockId, source, action, createdAt',
      templates: 'id, name, createdAt',
      revisions: 'id, blockId, projectId, source, createdAt'
    }).upgrade(async transaction => {
      const projects = transaction.table<Project>('projects');
      if (!await projects.get(TASK_INBOX_PROJECT_ID)) await projects.add(createTaskInboxProject());
      await transaction.table<Block>('blocks').toCollection().modify(block => {
        const tags = sanitizeTags(block.tags ?? []);
        const legacyStatus = LEGACY_AGENT_STATUSES.some(status => tags.includes(status));
        if (block.kind === 'task' || legacyStatus || isLegacyStructuredWorkItem({ ...block, tags })) {
          const normalized = normalizeTaskMetadata(block.task, block.order ?? block.createdAt);
          normalized.status = block.kind === 'task' ? normalized.status : legacyTaskStatus(tags);
          if (!block.task && tags.includes('agent-ready')) normalized.agentTarget = 'any';
          block.kind = 'task';
          block.task = normalized;
          block.tags = tags.filter(tag => !LEGACY_AGENT_STATUSES.includes(tag as typeof LEGACY_AGENT_STATUSES[number]));
        } else {
          block.tags = tags;
        }
      });
    });

    // Knowledge graph edges. Relations point at block ids so a rename cannot
    // break them, and they are free to cross project boundaries.
    this.version(13).stores({
      projects: 'id, title, isTrash, *tags, createdAt, updatedAt',
      blocks: 'id, projectId, parentId, order, isTrash, kind, task.status, task.position, *tags, *dependsOn, plainText, updatedAt',
      attachments: 'id, blockId, fileName, createdAt',
      settings: 'key',
      activities: 'id, projectId, blockId, source, action, createdAt',
      templates: 'id, name, createdAt',
      revisions: 'id, blockId, projectId, source, createdAt',
      links: 'id, sourceBlockId, targetBlockId, type, createdAt'
    }).upgrade(async transaction => {
      // Resolve the `[[Title]]` references that were until now only matched at
      // render time. Resolution is by title across the whole workspace; a title
      // carried by more than one block stays unresolved rather than guessed at,
      // so it shows up as an unresolved reference instead of a wrong link.
      const blocks = await transaction.table<Block>('blocks').toArray();
      const links = transaction.table<BlockLink>('links');
      /** @see syncWikiLinksForBlock — the same rule that keeps them in step later. */
      const created: BlockLink[] = [];
      const seen = new Set<string>();
      for (const block of blocks) {
        if (block.isTrash) continue;
        for (const link of syncWikiLinksForBlock(block, blocks, created).added) {
          const key = linkKey(link.sourceBlockId, link.targetBlockId, link.type);
          if (seen.has(key)) continue;
          seen.add(key);
          created.push(link);
        }
      }
      if (created.length > 0) await links.bulkAdd(created);
    });
  }
}

export const db = new DeepScribeDatabase();

const mutationListeners = new Set<() => void>();

db.use({
  stack: 'dbcore',
  name: 'deepscribe-workspace-sync',
  create(downlevelDatabase) {
    return {
      ...downlevelDatabase,
      table(tableName) {
        const downlevelTable = downlevelDatabase.table(tableName);
        return {
          ...downlevelTable,
          mutate(request) {
            return downlevelTable.mutate(request).then(result => {
              mutationListeners.forEach(listener => listener());
              return result;
            });
          }
        };
      }
    };
  }
});

export function subscribeToDatabaseMutations(listener: () => void): () => void {
  mutationListeners.add(listener);
  return () => mutationListeners.delete(listener);
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function ensureTaskNumbersAssigned(): Promise<void> {
  const allBlocks = await db.blocks.toArray();
  const unassignedTasks = allBlocks.filter(block => block.kind === 'task' && block.task && typeof block.task.taskNumber !== 'number');
  if (unassignedTasks.length === 0) return;

  let maxNumber = 0;
  for (const block of allBlocks) {
    if (block.kind === 'task' && typeof block.task?.taskNumber === 'number' && block.task.taskNumber > maxNumber) {
      maxNumber = block.task.taskNumber;
    }
  }

  unassignedTasks.sort((a, b) => a.createdAt - b.createdAt);

  await db.transaction('rw', db.blocks, async () => {
    for (const taskBlock of unassignedTasks) {
      maxNumber += 1;
      await db.blocks.update(taskBlock.id, {
        task: {
          ...taskBlock.task!,
          taskNumber: maxNumber
        }
      });
    }
  });
}

export async function seedDemoDataIfEmpty() {
  await ensureTaskNumbersAssigned();
  const projectCount = await db.projects.count();
  if (projectCount > 0) {
    if (!await db.projects.get(TASK_INBOX_PROJECT_ID)) await db.projects.add(createTaskInboxProject());
    return;
  }

  const now = Date.now();
  const demoProjectId = 'proj-demo-1';
  const demoProject2Id = 'proj-demo-2';

  await db.projects.add(createTaskInboxProject(now));

  await db.projects.add({
    id: demoProjectId,
    title: '📘 Sci-Fi Roman: De Cybernetic Horizon',
    description: 'Een meeslepende cyberpunk roman over kunstmatige intelligentie en menselijk bewustzijn.',
    color: '#00F0FF',
    order: 0,
    tags: [],
    icon: 'book',
    isTrash: false,
    createdAt: now - 86400000 * 5,
    updatedAt: now,
  });

  await db.projects.add({
    id: demoProject2Id,
    title: '🧠 Kennisbank & Onderzoek',
    description: 'Persoonlijk archief met notities, bibliografie en ideeën.',
    color: '#FF007F',
    order: 1,
    tags: [],
    icon: 'brain',
    isTrash: false,
    createdAt: now - 86400000 * 3,
    updatedAt: now,
  });

  const rootBlocks: Block[] = [
    {
      id: 'block-ch1',
      projectId: demoProjectId,
      parentId: null,
      title: 'Hoofdstuk 1: De Eerste Vonk',
      content: '<h1>Hoofdstuk 1: De Eerste Vonk</h1><p>Het neonlicht van Neo-Rotterdam weerkaatste op het natte asfalt van de West-Kruiskade. Nova stelde haar neuro-implantaten scherp.</p><blockquote><p>"In een stad van nullen en enen is herinnering de enige valuta die er echt toe doet."</p></blockquote><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked="checked"><span></span></label><div><p>Introduceer hoofdpersoon Nova</p></div></li><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Beschrijf het neon-landschap van het ondergrondse netwerk</p></div></li></ul>',
      plainText: 'Hoofdstuk 1: De Eerste Vonk Het neonlicht van Neo-Rotterdam weerkaatste op het natte asfalt van de West-Kruiskade. Nova stelde haar neuro-implantaten scherp.',
      order: 0,
      childCount: 3,
      taskCount: 2,
      completedTaskCount: 1,
      attachmentCount: 0,
      tags: ['hoofdstuk1', 'concept'],
      isTrash: false,
      createdAt: now - 86400000 * 4,
      updatedAt: now - 3600000 * 2,
    },
    {
      id: 'block-char',
      projectId: demoProjectId,
      parentId: null,
      title: 'Personages & Facties',
      content: '<h2>Personages &amp; Netwerken</h2><p>Overzicht van alle sleutelfiguren in het verhaal en hun motieven.</p>',
      plainText: 'Personages & Netwerken Overzicht van alle sleutelfiguren in het verhaal en hun motieven.',
      order: 1,
      childCount: 2,
      taskCount: 0,
      completedTaskCount: 0,
      attachmentCount: 0,
      tags: ['personages', 'cyberpunk'],
      isTrash: false,
      createdAt: now - 86400000 * 4,
      updatedAt: now - 3600000 * 5,
    },
    {
      id: 'block-world',
      projectId: demoProjectId,
      parentId: null,
      title: 'Worldbuilding & Technologie',
      content: '<h2>Technologische kaders</h2><p>Specificaties van neuro-links, kwantumsystemen en de fysieke infrastructuur.</p>',
      plainText: 'Technologische kaders Specificaties van neuro-links, kwantumsystemen en de fysieke infrastructuur.',
      order: 2,
      childCount: 1,
      taskCount: 0,
      completedTaskCount: 0,
      attachmentCount: 0,
      tags: [],
      isTrash: false,
      createdAt: now - 86400000 * 3,
      updatedAt: now - 86400000,
    }
  ];

  await db.blocks.bulkAdd(rootBlocks);

  const ch1SubBlocks: Block[] = [
    {
      id: 'block-scene-1-1',
      projectId: demoProjectId,
      parentId: 'block-ch1',
      title: 'Scène 1.1: Het Steegje',
      content: '<h3>Scène 1.1: Het Steegje</h3><p>Nova ontmoet de informant Kael in de schaduw van de zwevende monorail. De regen smaakt naar metaal.</p>',
      plainText: 'Scène 1.1: Het Steegje Nova ontmoet de informant Kael in de schaduw van de zwevende monorail. De regen smaakt naar metaal.',
      order: 0,
      childCount: 0,
      taskCount: 0,
      completedTaskCount: 0,
      attachmentCount: 0,
      tags: [],
      isTrash: false,
      createdAt: now - 86400000 * 3,
      updatedAt: now - 3600000 * 3,
    },
    {
      id: 'block-scene-1-2',
      projectId: demoProjectId,
      parentId: 'block-ch1',
      title: 'Scène 1.2: De Hack',
      content: '<h3>Scène 1.2: De Hack</h3><p>Met een trillende hand plugt ze de glasvezelkabel in de aansluiting achter haar oor. De data-stroom overspoelt haar zintuigen.</p>',
      plainText: 'Scène 1.2: De Hack Met een trillende hand plugt ze de glasvezelkabel in de aansluiting achter haar oor.',
      order: 1,
      childCount: 2,
      taskCount: 1,
      completedTaskCount: 0,
      attachmentCount: 0,
      tags: [],
      isTrash: false,
      createdAt: now - 86400000 * 2,
      updatedAt: now - 3600000,
    },
    {
      id: 'block-scene-1-3',
      projectId: demoProjectId,
      parentId: 'block-ch1',
      title: 'Scène 1.3: De Vlucht',
      content: '<h3>Scène 1.3: De Vlucht</h3><p>Sirenes huilen in de verte. De Security Drones zwermen uit over het dak.</p>',
      plainText: 'Scène 1.3: De Vlucht Sirenes huilen in de verte. De Security Drones zwermen uit over het dak.',
      order: 2,
      childCount: 0,
      taskCount: 0,
      completedTaskCount: 0,
      attachmentCount: 0,
      tags: [],
      isTrash: false,
      createdAt: now - 86400000,
      updatedAt: now - 1800000,
    }
  ];

  const scene12SubBlocks: Block[] = [
    {
      id: 'block-detail-hacker',
      projectId: demoProjectId,
      parentId: 'block-scene-1-2',
      title: 'Code Snippet: Neuro-Decryptie Protocol',
      content: '<pre><code>function decryptNeuroBuffer(buffer: ArrayBuffer, key: string): Uint8Array {\n  const view = new DataView(buffer);\n  console.log("Decrypting pulse stream...");\n  return new Uint8Array(buffer);\n}</code></pre>',
      plainText: 'Code Snippet: Neuro-Decryptie Protocol function decryptNeuroBuffer',
      order: 0,
      childCount: 0,
      taskCount: 0,
      completedTaskCount: 0,
      attachmentCount: 0,
      tags: [],
      isTrash: false,
      createdAt: now - 3600000 * 2,
      updatedAt: now - 1800000,
    },
    {
      id: 'block-detail-firewall',
      projectId: demoProjectId,
      parentId: 'block-scene-1-2',
      title: 'Aanvalstactiek vs Aegis Corp Firewall',
      content: '<p>Analyse van de kwantum-omleidingen en decoys die Nova gebruikt.</p>',
      plainText: 'Aanvalstactiek vs Aegis Corp Firewall Analyse van de kwantum-omleidingen',
      order: 1,
      childCount: 0,
      taskCount: 0,
      completedTaskCount: 0,
      attachmentCount: 0,
      tags: [],
      isTrash: false,
      createdAt: now - 3600000,
      updatedAt: now - 900000,
    }
  ];

  const charSubBlocks: Block[] = [
    {
      id: 'block-nova',
      projectId: demoProjectId,
      parentId: 'block-char',
      title: 'Nova (Hoofdpersoon)',
      content: '<h3>Nova (24 jaar)</h3><p>Freelance data-smuggler met een illegale militaire kwantum-chip geïmplanteerd in haar temporale kwab.</p>',
      plainText: 'Nova (24 jaar) Freelance data-smuggler met een illegale militaire kwantum-chip',
      order: 0,
      childCount: 0,
      taskCount: 0,
      completedTaskCount: 0,
      attachmentCount: 0,
      tags: [],
      isTrash: false,
      createdAt: now - 86400000 * 3,
      updatedAt: now - 86400000,
    },
    {
      id: 'block-kael',
      projectId: demoProjectId,
      parentId: 'block-char',
      title: 'Kael (Informant)',
      content: '<h3>Kael (38 jaar)</h3><p>Voormalig engineer bij Aegis Corp, nu schaduwmakelaar in het ondergrondse data-netwerk.</p>',
      plainText: 'Kael (38 jaar) Voormalig engineer bij Aegis Corp',
      order: 1,
      childCount: 0,
      taskCount: 0,
      completedTaskCount: 0,
      attachmentCount: 0,
      tags: [],
      isTrash: false,
      createdAt: now - 86400000 * 2,
      updatedAt: now - 86400000,
    }
  ];

  await db.blocks.bulkAdd([...ch1SubBlocks, ...scene12SubBlocks, ...charSubBlocks]);

  await db.blocks.add({
    id: 'block-research-ai',
    projectId: demoProject2Id,
    parentId: null,
    title: 'AI Architecturen & Neural Nets',
    content: '<h1>AI Architecturen &amp; Neural Nets</h1><p>Documentatie van nieuwste generatie LLM en multi-agent netwerken.</p>',
    plainText: 'AI Architecturen & Neural Nets Documentatie van nieuwste generatie LLM',
    order: 0,
    childCount: 0,
    taskCount: 0,
    completedTaskCount: 0,
    attachmentCount: 0,
    tags: [],
    isTrash: false,
    createdAt: now - 86400000 * 2,
    updatedAt: now - 86400000,
  });
}
