import type { Block, ClaimantAgentTarget, Project, TaskAgentTarget, TaskClaim, TaskCreator, TaskMetadata, TaskStatus } from '../types';

export const TASK_AGENT_TARGETS: TaskAgentTarget[] = ['none', 'openai', 'claude', 'gemini', 'custom', 'any'];
export const TASK_STATUSES: TaskStatus[] = ['inbox', 'ready', 'in-progress', 'blocked', 'review', 'done'];
export const TASK_INBOX_PROJECT_ID = 'proj-system-task-inbox';

export const TASK_AGENT_LABELS: Record<TaskAgentTarget, string> = {
  none: 'None',
  openai: 'Codex/ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  custom: 'Other',
  any: 'Any'
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  inbox: 'Inbox',
  ready: 'Ready',
  'in-progress': 'In progress',
  blocked: 'Blocked',
  review: 'Review',
  done: 'Done'
};

export function createTaskMetadata(position = Date.now(), creator: TaskCreator = { type: 'user' }): TaskMetadata {
  return { status: 'inbox', agentTarget: 'any', position, creator };
}

export function normalizeTaskCreator(value: unknown): TaskCreator | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  if (raw.type === 'user') return { type: 'user' };
  if (raw.type !== 'agent' || typeof raw.agentId !== 'string' || !raw.agentId.trim() || typeof raw.requestId !== 'string' || !raw.requestId.trim()) return undefined;
  const agentTarget = raw.agentTarget as ClaimantAgentTarget;
  if (!['openai', 'claude', 'gemini', 'custom'].includes(agentTarget)) return undefined;
  const customAgentName = typeof raw.customAgentName === 'string' ? raw.customAgentName.trim() : '';
  if (agentTarget === 'custom' && !customAgentName) return undefined;
  return {
    type: 'agent',
    agentTarget,
    agentId: raw.agentId.trim(),
    requestId: raw.requestId.trim(),
    ...(agentTarget === 'custom' ? { customAgentName } : {})
  };
}

export function taskCreatorLabel(task: Pick<TaskMetadata, 'creator'> | undefined): string | null {
  const creator = task?.creator;
  if (!creator || creator.type !== 'agent') return null;
  return creator.agentTarget === 'custom' ? creator.customAgentName ?? TASK_AGENT_LABELS.custom : TASK_AGENT_LABELS[creator.agentTarget];
}

export function createTaskInboxProject(now = Date.now()): Project {
  return {
    id: TASK_INBOX_PROJECT_ID,
    title: 'Workspace Inbox',
    description: 'Internal workspace container for unassigned tasks.',
    color: '#A78BFA',
    order: Number.MAX_SAFE_INTEGER,
    tags: [],
    isTrash: false,
    systemKind: 'task-inbox',
    createdAt: now,
    updatedAt: now
  };
}

export function isTaskInboxProject(project: Pick<Project, 'id' | 'systemKind'>): boolean {
  return project.id === TASK_INBOX_PROJECT_ID || project.systemKind === 'task-inbox';
}

export function normalizeTaskMetadata(value: unknown, fallbackPosition = Date.now()): TaskMetadata {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const legacyStatus = typeof raw.status === 'string' ? raw.status : 'draft';
  const status: TaskStatus = legacyStatus === 'draft' ? 'inbox'
    : legacyStatus === 'claimed' ? 'in-progress'
      : TASK_STATUSES.includes(legacyStatus as TaskStatus) ? legacyStatus as TaskStatus : 'inbox';
  const rawTarget = typeof raw.agentTarget === 'string' ? raw.agentTarget : 'none';
  const agentTarget = TASK_AGENT_TARGETS.includes(rawTarget as TaskAgentTarget) ? rawTarget as TaskAgentTarget : 'none';
  const position = typeof raw.position === 'number' && Number.isFinite(raw.position) ? raw.position : fallbackPosition;
  const creator = normalizeTaskCreator(raw.creator);
  return {
    status,
    agentTarget,
    position,
    ...(creator ? { creator } : {}),
    ...(agentTarget === 'custom' && typeof raw.customAgentName === 'string' && raw.customAgentName.trim() ? { customAgentName: raw.customAgentName.trim() } : {}),
    ...(typeof raw.readyAt === 'number' && Number.isFinite(raw.readyAt) ? { readyAt: raw.readyAt } : {}),
    ...(typeof raw.claimAttempt === 'number' && Number.isFinite(raw.claimAttempt) ? { claimAttempt: Math.max(0, Math.floor(raw.claimAttempt)) } : {}),
    ...(raw.claim && typeof raw.claim === 'object' ? { claim: raw.claim as TaskClaim } : {})
  };
}

export function isTaskBlock(block: Pick<Block, 'kind' | 'task'>): boolean {
  return block.kind === 'task' && Boolean(block.task);
}

export function isTaskAutoPickupEligible(block: Pick<Block, 'kind' | 'task' | 'isTrash'>): boolean {
  return !block.isTrash && block.kind === 'task' && block.task?.status === 'ready' && block.task.agentTarget !== 'none';
}

export const DEFAULT_TASK_LEASE_SECONDS = 15 * 60;
export const MIN_TASK_LEASE_SECONDS = 60;
export const MAX_TASK_LEASE_SECONDS = 60 * 60;

export function normalizeLeaseSeconds(value: unknown): number {
  if (value === undefined) return DEFAULT_TASK_LEASE_SECONDS;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < MIN_TASK_LEASE_SECONDS || value > MAX_TASK_LEASE_SECONDS) {
    throw new Error('leaseSeconds must be between 60 and 3600 seconds.');
  }
  return value;
}

export function taskTargetMatches(
  task: TaskMetadata,
  agentTarget: ClaimantAgentTarget,
  customAgentName?: string
): boolean {
  if (task.agentTarget === 'none') return false;
  if (task.agentTarget === 'any') return true;
  if (task.agentTarget !== agentTarget) return false;
  if (task.agentTarget !== 'custom') return true;
  return task.customAgentName?.trim().toLocaleLowerCase() === customAgentName?.trim().toLocaleLowerCase();
}

export function isTaskClaimCandidate(
  block: Block,
  allBlocks: Block[],
  agentTarget: ClaimantAgentTarget,
  customAgentName: string | undefined,
  now: number
): boolean {
  if (block.isTrash || block.kind !== 'task' || !block.task || !taskTargetMatches(block.task, agentTarget, customAgentName)) return false;
  const available = block.task.status === 'ready' || (block.task.status === 'in-progress' && Boolean(block.task.claim && block.task.claim.expiresAt <= now));
  if (!available) return false;
  const byId = new Map(allBlocks.map(candidate => [candidate.id, candidate]));
  return (block.dependsOn ?? []).every(id => {
    const dependency = byId.get(id);
    if (!dependency || dependency.isTrash) return false;
    return dependency.kind === 'task' ? dependency.task?.status === 'done' : dependency.taskCount > 0 && dependency.completedTaskCount >= dependency.taskCount;
  });
}

export function createTaskClaim(input: {
  ownerId: string;
  agentTarget: ClaimantAgentTarget;
  customAgentName?: string;
  requestId: string;
  token: string;
  now: number;
  leaseSeconds: number;
  attempt: number;
}): TaskClaim {
  return {
    ownerId: input.ownerId,
    agentTarget: input.agentTarget,
    ...(input.agentTarget === 'custom' ? { customAgentName: input.customAgentName?.trim() } : {}),
    token: input.token,
    requestId: input.requestId,
    claimedAt: input.now,
    heartbeatAt: input.now,
    expiresAt: input.now + input.leaseSeconds * 1000,
    attempt: input.attempt
  };
}

export function redactTaskClaim<T extends Block>(block: T): T {
  if (!block.task?.claim) return block;
  return { ...block, task: { ...block.task, claim: { ...block.task.claim, token: '[redacted]' } } };
}

export function taskWithoutActiveClaim(task: TaskMetadata, fallbackStatus: TaskStatus = 'ready', now = Date.now()): TaskMetadata {
  if (!task.claim && task.status !== 'in-progress') return { ...task };
  return {
    ...task,
    status: fallbackStatus,
    claim: undefined,
    ...(fallbackStatus === 'ready' ? { readyAt: task.readyAt ?? now } : {})
  };
}

export function validateTaskMetadata(task: TaskMetadata): string[] {
  const errors: string[] = [];
  if (!TASK_STATUSES.includes(task.status)) errors.push('The task status is invalid.');
  if (!TASK_AGENT_TARGETS.includes(task.agentTarget)) errors.push('The agent target is invalid.');
  if (!Number.isFinite(task.position)) errors.push('The task position is invalid.');
  if (task.agentTarget === 'custom' && !task.customAgentName?.trim()) errors.push('Enter a name for the other agent.');
  return errors;
}

export function validateTaskReady(title: string, _content: string, task: TaskMetadata): string[] {
  const errors = validateTaskMetadata(task);
  if (!title.trim()) errors.push('Enter a title.');
  return errors;
}

export function taskContentFromParts(goal: string, context: string, acceptanceCriteria: string[]): string {
  const escape = (value: string) => value
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  return `<h2>Goal</h2><p>${escape(goal.trim())}</p><h2>Context</h2><p>${escape(context.trim())}</p><h2>Acceptance Criteria</h2><ul>${acceptanceCriteria.map(item => `<li><p>${escape(item.trim())}</p></li>`).join('')}</ul>`;
}

export function convertContentToTask(content: string): string {
  return content.trim() ? content : '<p></p>';
}

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return true;
  const transitions: Record<TaskStatus, TaskStatus[]> = {
    inbox: ['ready', 'in-progress', 'blocked', 'review', 'done'],
    ready: ['inbox', 'in-progress', 'blocked', 'review', 'done'],
    'in-progress': ['inbox', 'ready', 'blocked', 'review', 'done'],
    blocked: ['inbox', 'ready', 'in-progress', 'review', 'done'],
    review: ['inbox', 'ready', 'in-progress', 'blocked', 'done'],
    done: ['inbox', 'ready', 'in-progress', 'blocked', 'review']
  };
  return transitions[from].includes(to);
}
