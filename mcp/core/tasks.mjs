/**
 * Task blocks: identity, metadata, claim leases and status transitions.
 *
 * Shared domain core: imported by the renderer/bridge path
 * (`src/utils/taskBlocks.ts`) and by the standalone Node MCP server
 * (`mcp/direct-store.mjs`), so it must stay free of DOM and Node APIs.
 *
 * @module
 */

import { sanitizeDependsOn } from './dependencies.mjs';

/**
 * @typedef {import('../../src/types').Block} Block
 * @typedef {import('../../src/types').ClaimantAgentTarget} ClaimantAgentTarget
 * @typedef {import('../../src/types').Project} Project
 * @typedef {import('../../src/types').TaskAgentTarget} TaskAgentTarget
 * @typedef {import('../../src/types').TaskClaim} TaskClaim
 * @typedef {import('../../src/types').TaskCreator} TaskCreator
 * @typedef {import('../../src/types').TaskMetadata} TaskMetadata
 * @typedef {import('../../src/types').TaskStatus} TaskStatus
 */

/** @type {TaskAgentTarget[]} */
export const TASK_AGENT_TARGETS = ['none', 'openai', 'claude', 'gemini', 'custom', 'any'];

/** @type {TaskStatus[]} */
export const TASK_STATUSES = ['inbox', 'ready', 'in-progress', 'blocked', 'review', 'done'];

/** @type {ClaimantAgentTarget[]} */
export const CLAIMANT_AGENT_TARGETS = ['openai', 'claude', 'gemini', 'custom'];

export const TASK_INBOX_PROJECT_ID = 'proj-system-task-inbox';

/** @type {Record<TaskAgentTarget, string>} */
export const TASK_AGENT_LABELS = {
  none: 'None',
  openai: 'Codex/ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  custom: 'Other',
  any: 'Any'
};

/** @type {Record<TaskStatus, string>} */
export const TASK_STATUS_LABELS = {
  inbox: 'Inbox',
  ready: 'Ready',
  'in-progress': 'In progress',
  blocked: 'Blocked',
  review: 'Review',
  done: 'Done'
};

export const DEFAULT_TASK_LEASE_SECONDS = 15 * 60;
export const MIN_TASK_LEASE_SECONDS = 60;
export const MAX_TASK_LEASE_SECONDS = 60 * 60;

/**
 * @param {number} [taskNumber]
 * @returns {string | null}
 */
export function formatTaskHumanId(taskNumber) {
  if (typeof taskNumber !== 'number' || !Number.isInteger(taskNumber) || taskNumber <= 0) return null;
  return `#TSK-${taskNumber}`;
}

/**
 * @param {string} input
 * @returns {number | null}
 */
export function parseTaskHumanId(input) {
  const match = String(input ?? '').trim().match(/^(?:#?TSK-|#)(\d+)$/i);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  return Number.isFinite(num) && num > 0 ? num : null;
}

/**
 * @param {number | string} taskIdentifier
 * @returns {string}
 */
export function formatTaskDeepLink(taskIdentifier) {
  if (typeof taskIdentifier === 'number') return `deepscribe://task/TSK-${taskIdentifier}`;
  const clean = taskIdentifier.trim();
  const parsedNum = parseTaskHumanId(clean);
  return parsedNum !== null ? `deepscribe://task/TSK-${parsedNum}` : `deepscribe://task/${clean}`;
}

/**
 * @param {Array<{ kind?: string; task?: { taskNumber?: number } }>} allBlocks
 * @returns {number}
 */
export function getNextTaskNumber(allBlocks) {
  let highest = 0;
  for (const block of allBlocks) {
    if (block.kind === 'task' && typeof block.task?.taskNumber === 'number' && block.task.taskNumber > highest) {
      highest = block.task.taskNumber;
    }
  }
  return highest + 1;
}

/**
 * @param {number} [position]
 * @param {TaskCreator} [creator]
 * @param {number} [taskNumber]
 * @param {TaskAgentTarget} [agentTarget]
 * @param {string} [customAgentName]
 * @returns {TaskMetadata}
 */
export function createTaskMetadata(position = Date.now(), creator = { type: 'user' }, taskNumber, agentTarget = 'any', customAgentName) {
  return {
    status: 'inbox',
    agentTarget,
    position,
    ...(typeof taskNumber === 'number' && Number.isInteger(taskNumber) && taskNumber > 0 ? { taskNumber } : {}),
    ...(agentTarget === 'custom' && customAgentName?.trim() ? { customAgentName: customAgentName.trim() } : {}),
    creator
  };
}

/**
 * @param {unknown} value
 * @returns {TaskCreator | undefined}
 */
export function normalizeTaskCreator(value) {
  if (!value || typeof value !== 'object') return undefined;
  const raw = /** @type {Record<string, unknown>} */ (value);
  if (raw.type === 'user') return { type: 'user' };
  const agentId = typeof raw.agentId === 'string' ? raw.agentId.trim() : '';
  const requestId = typeof raw.requestId === 'string' ? raw.requestId.trim() : '';
  const agentTarget = /** @type {ClaimantAgentTarget} */ (raw.agentTarget);
  const customAgentName = typeof raw.customAgentName === 'string' ? raw.customAgentName.trim() : '';
  if (raw.type !== 'agent' || !agentId || !requestId || !CLAIMANT_AGENT_TARGETS.includes(agentTarget)) return undefined;
  if (agentTarget === 'custom' && !customAgentName) return undefined;
  return {
    type: 'agent',
    agentTarget,
    agentId,
    requestId,
    ...(agentTarget === 'custom' ? { customAgentName } : {})
  };
}

/**
 * @param {Pick<TaskMetadata, 'creator'> | undefined} task
 * @returns {string | null}
 */
export function taskCreatorLabel(task) {
  const creator = task?.creator;
  if (!creator || creator.type !== 'agent') return null;
  return creator.agentTarget === 'custom'
    ? creator.customAgentName ?? TASK_AGENT_LABELS.custom
    : TASK_AGENT_LABELS[creator.agentTarget];
}

/**
 * @param {number} [now]
 * @returns {Project}
 */
export function createTaskInboxProject(now = Date.now()) {
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

/**
 * @param {Pick<Project, 'id' | 'systemKind'>} project
 * @returns {boolean}
 */
export function isTaskInboxProject(project) {
  return project.id === TASK_INBOX_PROJECT_ID || project.systemKind === 'task-inbox';
}

/**
 * Reads stored task metadata, migrating the legacy `draft`/`claimed` statuses.
 * @param {unknown} value
 * @param {number} [fallbackPosition]
 * @returns {TaskMetadata}
 */
export function normalizeTaskMetadata(value, fallbackPosition = Date.now()) {
  const raw = value && typeof value === 'object' ? /** @type {Record<string, unknown>} */ (value) : {};
  const legacyStatus = typeof raw.status === 'string' ? raw.status : 'draft';
  /** @type {TaskStatus} */
  const status = legacyStatus === 'draft' ? 'inbox'
    : legacyStatus === 'claimed' ? 'in-progress'
      : TASK_STATUSES.includes(/** @type {TaskStatus} */ (legacyStatus)) ? /** @type {TaskStatus} */ (legacyStatus) : 'inbox';
  const rawTarget = typeof raw.agentTarget === 'string' ? raw.agentTarget : 'none';
  const agentTarget = TASK_AGENT_TARGETS.includes(/** @type {TaskAgentTarget} */ (rawTarget)) ? /** @type {TaskAgentTarget} */ (rawTarget) : 'none';
  const position = typeof raw.position === 'number' && Number.isFinite(raw.position) ? raw.position : fallbackPosition;
  const taskNumber = typeof raw.taskNumber === 'number' && Number.isInteger(raw.taskNumber) && raw.taskNumber > 0 ? raw.taskNumber : undefined;
  const creator = normalizeTaskCreator(raw.creator);
  return {
    status,
    agentTarget,
    position,
    ...(taskNumber ? { taskNumber } : {}),
    ...(creator ? { creator } : {}),
    ...(agentTarget === 'custom' && typeof raw.customAgentName === 'string' && raw.customAgentName.trim() ? { customAgentName: raw.customAgentName.trim() } : {}),
    ...(typeof raw.readyAt === 'number' && Number.isFinite(raw.readyAt) ? { readyAt: raw.readyAt } : {}),
    ...(typeof raw.claimAttempt === 'number' && Number.isFinite(raw.claimAttempt) ? { claimAttempt: Math.max(0, Math.floor(raw.claimAttempt)) } : {}),
    ...(raw.claim && typeof raw.claim === 'object' ? { claim: /** @type {TaskClaim} */ (raw.claim) } : {})
  };
}

/**
 * @param {Pick<Block, 'kind' | 'task'>} block
 * @returns {boolean}
 */
export function isTaskBlock(block) {
  return block.kind === 'task' && Boolean(block.task);
}

/**
 * @param {Pick<Block, 'kind' | 'task' | 'isTrash'>} block
 * @returns {boolean}
 */
export function isTaskAutoPickupEligible(block) {
  return !block.isTrash && block.kind === 'task' && block.task?.status === 'ready' && block.task.agentTarget !== 'none';
}

/**
 * Validates a requested lease length. The MCP schemas already constrain this
 * range, so an out-of-range value means a caller bypassed the tool contract.
 * @param {unknown} value
 * @returns {number}
 */
export function normalizeLeaseSeconds(value) {
  if (value === undefined) return DEFAULT_TASK_LEASE_SECONDS;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < MIN_TASK_LEASE_SECONDS || value > MAX_TASK_LEASE_SECONDS) {
    throw new Error('leaseSeconds must be between 60 and 3600 seconds.');
  }
  return value;
}

/**
 * A task assigned to `none` is never agent work, whichever path asks.
 * @param {TaskMetadata} task
 * @param {ClaimantAgentTarget} agentTarget
 * @param {string} [customAgentName]
 * @returns {boolean}
 */
export function taskTargetMatches(task, agentTarget, customAgentName) {
  if (task.agentTarget === 'none') return false;
  if (task.agentTarget === 'any') return true;
  if (task.agentTarget !== agentTarget) return false;
  if (task.agentTarget !== 'custom') return true;
  return task.customAgentName?.trim().toLocaleLowerCase() === customAgentName?.trim().toLocaleLowerCase();
}

/**
 * Decides whether a task may be handed to an agent right now: it must be ready
 * (or hold an expired lease), match the claimant, and every dependency it names
 * must still exist and be finished.
 * @param {Block} block
 * @param {Block[]} allBlocks
 * @param {ClaimantAgentTarget} agentTarget
 * @param {string | undefined} customAgentName
 * @param {number} now
 * @returns {boolean}
 */
export function isTaskClaimCandidate(block, allBlocks, agentTarget, customAgentName, now) {
  if (block.isTrash || block.kind !== 'task' || !block.task) return false;
  if (!taskTargetMatches(block.task, agentTarget, customAgentName)) return false;
  const available = block.task.status === 'ready'
    || (block.task.status === 'in-progress' && Boolean(block.task.claim && block.task.claim.expiresAt <= now));
  if (!available) return false;

  const byId = new Map(allBlocks.map(candidate => [candidate.id, candidate]));
  return (block.dependsOn ?? []).every(id => {
    const dependency = byId.get(id);
    if (!dependency || dependency.isTrash) return false;
    return dependency.kind === 'task'
      ? dependency.task?.status === 'done'
      : dependency.taskCount > 0 && dependency.completedTaskCount >= dependency.taskCount;
  });
}

/**
 * @param {{ ownerId: string; agentTarget: ClaimantAgentTarget; customAgentName?: string; requestId: string; token: string; now: number; leaseSeconds: number; attempt: number }} input
 * @returns {TaskClaim}
 */
export function createTaskClaim(input) {
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

/**
 * Strips the claim token so general reads never leak it.
 * @template {Block} T
 * @param {T} block
 * @returns {T}
 */
export function redactTaskClaim(block) {
  if (!block?.task?.claim) return block;
  return { ...block, task: { ...block.task, claim: { ...block.task.claim, token: '[redacted]' } } };
}

/**
 * @param {TaskMetadata} task
 * @param {TaskStatus} [fallbackStatus]
 * @param {number} [now]
 * @returns {TaskMetadata}
 */
export function taskWithoutActiveClaim(task, fallbackStatus = 'ready', now = Date.now()) {
  if (!task.claim && task.status !== 'in-progress') return { ...task };
  return {
    ...task,
    status: fallbackStatus,
    claim: undefined,
    ...(fallbackStatus === 'ready' ? { readyAt: task.readyAt ?? now } : {})
  };
}

/**
 * @param {TaskMetadata} task
 * @returns {string[]}
 */
export function validateTaskMetadata(task) {
  /** @type {string[]} */
  const errors = [];
  if (!TASK_STATUSES.includes(task.status)) errors.push('The task status is invalid.');
  if (!TASK_AGENT_TARGETS.includes(task.agentTarget)) errors.push('The agent target is invalid.');
  if (!Number.isFinite(task.position)) errors.push('The task position is invalid.');
  if (task.agentTarget === 'custom' && !task.customAgentName?.trim()) errors.push('Enter a name for the other agent.');
  return errors;
}

/**
 * @param {string} title
 * @param {string} _content
 * @param {TaskMetadata} task
 * @returns {string[]}
 */
export function validateTaskReady(title, _content, task) {
  const errors = validateTaskMetadata(task);
  if (!String(title ?? '').trim()) errors.push('Enter a title.');
  return errors;
}

/**
 * Refuses a content write while another agent holds a live lease on the task.
 *
 * The lease is what makes concurrent pickup safe, so a second agent must not be
 * able to overwrite work in flight. The holder itself writes with its own token.
 * @param {Block} block
 * @param {{ agentId?: unknown; claimToken?: unknown }} claimant
 * @param {number} [now]
 * @returns {string | null} A refusal message, or null when the write may proceed.
 */
export function taskClaimWriteRefusal(block, claimant, now = Date.now()) {
  if (block.kind !== 'task' || !block.task) return null;
  const claim = block.task.claim;
  if (!claim || claim.expiresAt <= now) return null;

  const agentId = typeof claimant?.agentId === 'string' ? claimant.agentId.trim() : '';
  const claimToken = typeof claimant?.claimToken === 'string' ? claimant.claimToken : '';
  if (agentId && claimToken && agentId === claim.ownerId && claimToken === claim.token) return null;

  return 'This task is claimed by another agent. Pass the agentId and claimToken of your own claim to write to it.';
}

/**
 * Refuses a write that would change a part of the task the user owns.
 *
 * Content and tags are open to agents; identity, ordering, assignment, status
 * and dependencies are not. Dependencies are protected because they decide what
 * an agent may claim next, so an agent must never be able to unblock itself.
 * @param {Block} block
 * @param {Record<string, unknown>} requested
 * @returns {string | null} A refusal message, or null when the write may proceed.
 */
export function taskProtectedFieldRefusal(block, requested) {
  if (block.kind !== 'task' || !block.task) return null;

  const title = typeof requested.title === 'string' ? requested.title.trim() : '';
  if (title && title !== block.title) {
    return 'Agents cannot rename a task. Only the user can change a task title.';
  }

  if (Array.isArray(requested.dependsOn)) {
    const next = sanitizeDependsOn(requested.dependsOn);
    const current = sanitizeDependsOn(block.dependsOn);
    if (next.length !== current.length || next.some((id, index) => id !== current[index])) {
      return 'Agents cannot change task dependencies. Only the user can change what a task depends on.';
    }
  }

  for (const field of ['task', 'status', 'agentTarget', 'customAgentName', 'position', 'order']) {
    if (requested[field] !== undefined) {
      return 'Agents cannot change task status, assignment or position. Use update_task_status, or the claim and transition tools.';
    }
  }

  return null;
}

/**
 * @param {TaskStatus} from
 * @param {TaskStatus} to
 * @returns {boolean}
 */
export function canTransitionTask(from, to) {
  if (from === to) return true;
  /** @type {Record<TaskStatus, TaskStatus[]>} */
  const transitions = {
    inbox: ['ready', 'in-progress', 'blocked', 'review', 'done'],
    ready: ['inbox', 'in-progress', 'blocked', 'review', 'done'],
    'in-progress': ['inbox', 'ready', 'blocked', 'review', 'done'],
    blocked: ['inbox', 'ready', 'in-progress', 'review', 'done'],
    review: ['inbox', 'ready', 'in-progress', 'blocked', 'done'],
    done: ['inbox', 'ready', 'in-progress', 'blocked', 'review']
  };
  return Boolean(transitions[from]?.includes(to));
}
