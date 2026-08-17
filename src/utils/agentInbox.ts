import type { Block } from '../types';
import { sanitizeTags } from './tagUtils';

export const AGENT_STATUSES = ['agent-ready', 'agent-claimed', 'agent-blocked', 'agent-review', 'agent-done'] as const;
export type AgentStatus = typeof AGENT_STATUSES[number];

export const AGENT_STATUS_LABELS: Record<AgentStatus, string> = {
  'agent-ready': 'Klaar voor agent',
  'agent-claimed': 'Geclaimd',
  'agent-blocked': 'Geblokkeerd',
  'agent-review': 'Review nodig',
  'agent-done': 'Afgerond'
};

export function getAgentStatus(block: Block): AgentStatus | null {
  return AGENT_STATUSES.find(status => block.tags.includes(status)) ?? null;
}

export function tagsWithAgentStatus(tags: string[], status: AgentStatus | null): string[] {
  const withoutStatuses = tags.filter(tag => !AGENT_STATUSES.includes(tag as AgentStatus));
  return sanitizeTags(status ? [...withoutStatuses, status] : withoutStatuses);
}
