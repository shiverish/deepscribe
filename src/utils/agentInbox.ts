import type { Block } from '../types';
import { sanitizeTags } from './tagUtils';

export const AGENT_STATUSES = ['agent-ready', 'agent-claimed', 'agent-blocked', 'agent-review', 'agent-done'] as const;
export type AgentStatus = typeof AGENT_STATUSES[number];

export const AGENT_STATUS_LABELS: Record<AgentStatus, string> = {
  'agent-ready': 'Ready for agent',
  'agent-claimed': 'Claimed',
  'agent-blocked': 'Blocked',
  'agent-review': 'Review required',
  'agent-done': 'Done'
};

export function getAgentStatus(block: Block): AgentStatus | null {
  if (block.kind === 'task' && block.task) {
    if (block.task.status === 'draft') return null;
    if (block.task.status === 'ready') return block.task.agentTarget === 'none' ? null : 'agent-ready';
    return `agent-${block.task.status}` as AgentStatus;
  }
  return AGENT_STATUSES.find(status => block.tags.includes(status)) ?? null;
}

export function tagsWithAgentStatus(tags: string[], status: AgentStatus | null): string[] {
  const withoutStatuses = tags.filter(tag => !AGENT_STATUSES.includes(tag as AgentStatus));
  return sanitizeTags(status ? [...withoutStatuses, status] : withoutStatuses);
}
