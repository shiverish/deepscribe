import type { Block, TaskAgentTarget, TaskCompletionPolicy, TaskMetadata, TaskStatus } from '../types';

export const TASK_AGENT_TARGETS: TaskAgentTarget[] = ['none', 'openai', 'claude', 'gemini', 'custom', 'any'];
export const TASK_STATUSES: TaskStatus[] = ['draft', 'ready', 'claimed', 'blocked', 'review', 'done'];
export const TASK_COMPLETION_POLICIES: TaskCompletionPolicy[] = ['review-required', 'auto-complete'];

export const TASK_AGENT_LABELS: Record<TaskAgentTarget, string> = {
  none: 'Geen',
  openai: 'Codex/ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  custom: 'Anders',
  any: 'Any'
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  draft: 'Concept',
  ready: 'Klaar',
  claimed: 'Geclaimd',
  blocked: 'Geblokkeerd',
  review: 'Review',
  done: 'Afgerond'
};

export const TASK_TEMPLATE_HTML = '<h2>Doel</h2><p></p><h2>Context</h2><p></p><h2>Acceptatiecriteria</h2><ul><li><p></p></li></ul>';

export function createTaskMetadata(completionPolicy: TaskCompletionPolicy = 'review-required'): TaskMetadata {
  return { status: 'draft', agentTarget: 'none', completionPolicy };
}

export function isTaskBlock(block: Pick<Block, 'kind' | 'task'>): boolean {
  return block.kind === 'task' && Boolean(block.task);
}

export function isTaskAutoPickupEligible(block: Pick<Block, 'kind' | 'task' | 'isTrash'>): boolean {
  return !block.isTrash && block.kind === 'task' && block.task?.status === 'ready' && block.task.agentTarget !== 'none';
}

export function validateTaskMetadata(task: TaskMetadata): string[] {
  const errors: string[] = [];
  if (!TASK_STATUSES.includes(task.status)) errors.push('De taakstatus is ongeldig.');
  if (!TASK_AGENT_TARGETS.includes(task.agentTarget)) errors.push('De agentdoelgroep is ongeldig.');
  if (!TASK_COMPLETION_POLICIES.includes(task.completionPolicy)) errors.push('Het afrondingsbeleid is ongeldig.');
  if (task.agentTarget === 'custom' && !task.customAgentName?.trim()) errors.push('Vul een naam in voor de andere agent.');
  return errors;
}

function sectionText(document: Document, heading: string): { text: string; itemCount: number } {
  const headings = [...document.body.querySelectorAll('h1,h2,h3,h4,h5,h6')];
  const start = headings.find(node => node.textContent?.trim().toLocaleLowerCase('nl-NL') === heading);
  if (!start) return { text: '', itemCount: 0 };
  const text: string[] = [];
  let itemCount = 0;
  let node = start.nextElementSibling;
  while (node && !/^H[1-6]$/.test(node.tagName)) {
    const value = node.textContent?.replace(/\s+/g, ' ').trim();
    if (value) text.push(value);
    itemCount += [...node.querySelectorAll('li')].filter(item => Boolean(item.textContent?.trim())).length;
    if (node.tagName === 'LI' && value) itemCount += 1;
    node = node.nextElementSibling;
  }
  return { text: text.join(' ').trim(), itemCount };
}

export function validateTaskReady(title: string, content: string, task: TaskMetadata): string[] {
  const errors = validateTaskMetadata(task);
  if (!title.trim()) errors.push('Vul een titel in.');
  let goal: { text: string; itemCount: number };
  let context: { text: string; itemCount: number };
  let criteria: { text: string; itemCount: number };
  if (typeof DOMParser !== 'undefined') {
    const document = new DOMParser().parseFromString(content || '', 'text/html');
    goal = sectionText(document, 'doel');
    context = sectionText(document, 'context');
    criteria = sectionText(document, 'acceptatiecriteria');
  } else {
    const read = (name: string) => {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const html = content.match(new RegExp(`<h[1-6][^>]*>\\s*${escaped}\\s*</h[1-6]>([\\s\\S]*?)(?=<h[1-6][^>]*>|$)`, 'i'))?.[1] ?? '';
      return {
        text: html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim(),
        itemCount: (html.match(/<li\b/gi) ?? []).length
      };
    };
    goal = read('Doel');
    context = read('Context');
    criteria = read('Acceptatiecriteria');
  }
  if (!goal.text) errors.push('Vul Doel in.');
  if (!context.text) errors.push('Vul Context in.');
  if (!criteria.text || criteria.itemCount < 1) errors.push('Voeg minimaal één acceptatiecriterium toe.');
  return errors;
}

export function taskContentFromParts(goal: string, context: string, acceptanceCriteria: string[]): string {
  const escape = (value: string) => value
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  return `<h2>Doel</h2><p>${escape(goal.trim())}</p><h2>Context</h2><p>${escape(context.trim())}</p><h2>Acceptatiecriteria</h2><ul>${acceptanceCriteria.map(item => `<li><p>${escape(item.trim())}</p></li>`).join('')}</ul>`;
}

export function convertContentToTask(content: string): string {
  const context = content.trim() && content.trim() !== '<p></p>' ? content : '<p></p>';
  return `<h2>Doel</h2><p></p><h2>Context</h2>${context}<h2>Acceptatiecriteria</h2><ul><li><p></p></li></ul>`;
}

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return true;
  const transitions: Record<TaskStatus, TaskStatus[]> = {
    draft: ['ready', 'done'],
    ready: ['draft', 'claimed', 'blocked', 'done'],
    claimed: ['ready', 'blocked', 'review', 'done'],
    blocked: ['draft', 'ready', 'claimed'],
    review: ['draft', 'ready', 'done'],
    done: ['draft', 'ready']
  };
  return transitions[from].includes(to);
}
