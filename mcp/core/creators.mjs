/**
 * Block provenance: who created a block, and how that is reported outward.
 *
 * Shared domain core: imported by the renderer/bridge path and by the
 * standalone Node MCP server, so it must stay free of DOM and Node APIs.
 *
 * @module
 */

import { CLAIMANT_AGENT_TARGETS, TASK_AGENT_LABELS } from './tasks.mjs';

/**
 * @typedef {import('../../src/types').Block} Block
 * @typedef {import('../../src/types').BlockCreator} BlockCreator
 * @typedef {import('../../src/types').ClaimantAgentTarget} ClaimantAgentTarget
 */

/** A block with no recorded creator predates the field; treat it as the user's. */
/** @type {BlockCreator} */
export const DEFAULT_BLOCK_CREATOR = { type: 'user' };

/**
 * Build an agent creator from whatever identity the caller declared. Identity
 * is optional on purpose: an MCP caller that omits it is still an agent.
 *
 * @param {{ agentId?: unknown, agentTarget?: unknown, customAgentName?: unknown }} [identity]
 * @returns {BlockCreator}
 */
export function agentBlockCreator(identity = {}) {
  const agentId = typeof identity.agentId === 'string' ? identity.agentId.trim() : '';
  const rawTarget = identity.agentTarget;
  const agentTarget = CLAIMANT_AGENT_TARGETS.includes(/** @type {ClaimantAgentTarget} */ (rawTarget))
    ? /** @type {ClaimantAgentTarget} */ (rawTarget)
    : undefined;
  const customAgentName = typeof identity.customAgentName === 'string' ? identity.customAgentName.trim() : '';
  return {
    type: 'agent',
    ...(agentTarget ? { agentTarget } : {}),
    ...(agentId ? { agentId } : {}),
    ...(agentTarget === 'custom' && customAgentName ? { customAgentName } : {})
  };
}

/**
 * @param {unknown} value
 * @returns {BlockCreator | undefined}
 */
export function normalizeBlockCreator(value) {
  if (!value || typeof value !== 'object') return undefined;
  const raw = /** @type {Record<string, unknown>} */ (value);
  if (raw.type === 'user') return { type: 'user' };
  if (raw.type !== 'agent') return undefined;
  return agentBlockCreator(raw);
}

/**
 * The creator of a block. `Block.creator` is canonical; a task row written
 * before that field existed falls back to its task metadata, and anything
 * older than both is attributed to the user.
 *
 * @param {Pick<Block, 'creator' | 'task'> | undefined} block
 * @returns {BlockCreator}
 */
export function blockCreator(block) {
  return normalizeBlockCreator(block?.creator)
    ?? normalizeBlockCreator(block?.task?.creator)
    ?? DEFAULT_BLOCK_CREATOR;
}

/**
 * Stable outward name for a creator, for webhook payloads and other consumers.
 * Deliberately not a UI label: these values must survive a relabel in the app.
 * A custom agent reports its own name, every other agent its provider slug.
 *
 * @param {BlockCreator} creator
 * @returns {string}
 */
export function creatorSlug(creator) {
  if (creator.type !== 'agent') return 'user';
  if (creator.agentTarget === 'custom') return creator.customAgentName || 'custom';
  return creator.agentTarget || 'agent';
}

/**
 * Stable outward name for a task assignment. 'any' is a real assignment (the
 * agent pool); 'none' is the absence of one and reports as null.
 *
 * @param {string | null | undefined} agentTarget
 * @param {string | null | undefined} [customAgentName]
 * @returns {string | null}
 */
export function assignmentSlug(agentTarget, customAgentName) {
  if (!agentTarget || agentTarget === 'none') return null;
  if (agentTarget === 'custom') {
    const name = typeof customAgentName === 'string' ? customAgentName.trim() : '';
    return name || 'custom';
  }
  return agentTarget;
}

/**
 * Display label for a creator. Returns null for the user so the UI can hide
 * the "Created by" chip rather than stating the default.
 *
 * @param {BlockCreator} creator
 * @returns {string | null}
 */
export function creatorLabel(creator) {
  if (creator.type !== 'agent') return null;
  if (creator.agentTarget === 'custom') return creator.customAgentName || TASK_AGENT_LABELS.custom;
  if (creator.agentTarget) return TASK_AGENT_LABELS[creator.agentTarget];
  return 'Agent';
}

/**
 * @param {Pick<Block, 'creator' | 'task'> | undefined} block
 * @returns {string | null}
 */
export function blockCreatorLabel(block) {
  return creatorLabel(blockCreator(block));
}
