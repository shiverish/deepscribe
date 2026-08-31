import type { Block, Project, TaskAgentTarget } from '../types';
import { getBlockDependencyStatus } from './dependencyUtils';
import { hasUnseenAgentEdits } from './agentEdits';
import { getProjectColor, INBOX_PROJECT_COLOR } from './projectColors';
import { TASK_AGENT_LABELS, TASK_INBOX_PROJECT_ID } from './taskBlocks';

/** A claim this close to running out is worth pointing at. */
export const CLAIM_EXPIRING_SOON_MS = 5 * 60 * 1000;
/** In progress, but nothing heard from the agent for this long. */
export const STALE_HEARTBEAT_MS = 15 * 60 * 1000;
/** Waiting on you for this long without moving. */
export const LONG_REVIEW_MS = 3 * 24 * 60 * 60 * 1000;

export type FocusSectionId = 'working' | 'your-turn' | 'stuck' | 'ready';

/**
 * Why a row is calling for attention. The value of this screen is in what
 * stands out, so every flag has to mean something is actually off — not merely
 * that a row exists.
 */
export type FocusAlert =
  | { kind: 'claim-expired'; since: number }
  | { kind: 'claim-expiring'; within: number }
  | { kind: 'stale-heartbeat'; silentFor: number }
  | { kind: 'long-review'; waitingFor: number };

export interface FocusItem {
  blockId: string;
  title: string;
  projectId: string;
  projectName: string;
  projectColor: string;
  /** Ordering key: the longest-running or longest-waiting rows come first. */
  since: number;
  /** One line under the title saying what the row is waiting on. */
  detail?: string;
  /** Which agent holds the claim, for the section where that matters. */
  agentLabel?: string;
  alerts: FocusAlert[];
  isTask: boolean;
}

export interface FocusSection {
  id: FocusSectionId;
  title: string;
  /** Shown when the section is empty, so an empty screen still reads as good news. */
  emptyLabel: string;
  items: FocusItem[];
}

export interface FocusData {
  sections: FocusSection[];
  /** Rows carrying at least one alert, across every section. */
  alertCount: number;
  totalCount: number;
}

function projectName(projects: Project[], projectId: string): string {
  if (projectId === TASK_INBOX_PROJECT_ID) return 'Workspace Inbox';
  return projects.find(project => project.id === projectId)?.title ?? 'Unknown project';
}

function projectColor(projects: Project[], projectId: string): string {
  if (projectId === TASK_INBOX_PROJECT_ID) return INBOX_PROJECT_COLOR;
  return getProjectColor(projects.find(project => project.id === projectId)?.color);
}

function agentLabel(target: TaskAgentTarget | undefined, customName?: string): string {
  if (customName?.trim()) return customName.trim();
  if (!target) return 'Unknown agent';
  return TASK_AGENT_LABELS[target] ?? target;
}

/** Rounded to whole units — a focus screen does not need seconds. */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function describeAlert(alert: FocusAlert): string {
  switch (alert.kind) {
    case 'claim-expired':
      return `Claim expired ${formatDuration(alert.since)} ago`;
    case 'claim-expiring':
      return `Claim expires in ${formatDuration(alert.within)}`;
    case 'stale-heartbeat':
      return `No heartbeat for ${formatDuration(alert.silentFor)}`;
    case 'long-review':
      return `Waiting on you for ${formatDuration(alert.waitingFor)}`;
  }
}

function claimAlerts(block: Block, now: number): FocusAlert[] {
  const claim = block.task?.claim;
  if (!claim) return [];
  const alerts: FocusAlert[] = [];

  if (claim.expiresAt <= now) {
    alerts.push({ kind: 'claim-expired', since: now - claim.expiresAt });
  } else if (claim.expiresAt - now <= CLAIM_EXPIRING_SOON_MS) {
    alerts.push({ kind: 'claim-expiring', within: claim.expiresAt - now });
  }

  const silentFor = now - (claim.heartbeatAt ?? claim.claimedAt);
  // An expired claim already says the work stalled; repeating it as silence adds nothing.
  if (silentFor >= STALE_HEARTBEAT_MS && claim.expiresAt > now) {
    alerts.push({ kind: 'stale-heartbeat', silentFor });
  }

  return alerts;
}

/**
 * Everything the Focus view shows, grouped by whose turn it is. Purely derived
 * from the status, claim and agent-edit data that already exists; nothing here
 * needs a new field.
 */
export function buildFocusData(projects: Project[], blocks: Block[], now: number = Date.now()): FocusData {
  const active = blocks.filter(block => !block.isTrash);
  const tasks = active.filter(block => block.kind === 'task' && block.task);

  const base = (block: Block) => ({
    blockId: block.id,
    title: block.title,
    projectId: block.projectId,
    projectName: projectName(projects, block.projectId),
    projectColor: projectColor(projects, block.projectId),
    isTask: block.kind === 'task'
  });

  const working: FocusItem[] = tasks
    .filter(block => block.task?.status === 'in-progress')
    .map(block => {
      const claim = block.task?.claim;
      const since = claim?.claimedAt ?? block.updatedAt;
      return {
        ...base(block),
        since,
        agentLabel: claim
          ? agentLabel(claim.agentTarget as TaskAgentTarget, claim.customAgentName)
          : agentLabel(block.task?.agentTarget, block.task?.customAgentName),
        detail: claim
          ? `Held for ${formatDuration(now - since)}`
          : 'In progress without an active claim',
        alerts: claimAlerts(block, now)
      };
    });

  const review: FocusItem[] = tasks
    .filter(block => block.task?.status === 'review')
    .map(block => {
      const waitingFor = now - block.updatedAt;
      return {
        ...base(block),
        since: block.updatedAt,
        detail: `In review for ${formatDuration(waitingFor)}`,
        alerts: waitingFor >= LONG_REVIEW_MS ? [{ kind: 'long-review' as const, waitingFor }] : []
      };
    });

  // Unread agent edits on ordinary blocks belong here too: they are the other
  // half of "an agent did something and nobody has looked at it".
  const unreadBlocks: FocusItem[] = active
    .filter(block => block.kind !== 'task' && hasUnseenAgentEdits(block))
    .map(block => ({
      ...base(block),
      since: block.lastAgentEditAt ?? block.updatedAt,
      detail: 'Unread agent edit',
      alerts: []
    }));

  const stuck: FocusItem[] = tasks
    .filter(block => block.task?.status === 'blocked')
    .map(block => {
      const status = getBlockDependencyStatus(block, active);
      const pending = status.pendingDependencies.map((dependency: Block) => dependency.title);
      const missing = status.missingDependencyIds.length;
      const detail = pending.length > 0
        ? `Waiting on ${pending.join(', ')}`
        : missing > 0
          ? `Waiting on ${missing} dependenc${missing === 1 ? 'y' : 'ies'} that no longer exist${missing === 1 ? 's' : ''}`
          : 'Blocked without a recorded dependency';
      return { ...base(block), since: block.updatedAt, detail, alerts: [] };
    });

  const ready: FocusItem[] = tasks
    .filter(block => block.task?.status === 'ready')
    .map(block => ({
      ...base(block),
      since: block.task?.readyAt ?? block.updatedAt,
      detail: `Ready for ${agentLabel(block.task?.agentTarget, block.task?.customAgentName)}`,
      alerts: []
    }));

  // Oldest first everywhere: what has been sitting longest is what needs you.
  const byAge = (a: FocusItem, b: FocusItem) => a.since - b.since;

  const sections: FocusSection[] = [
    {
      id: 'working',
      title: 'An agent is working',
      emptyLabel: 'No agent is working on anything right now.',
      items: working.sort(byAge)
    },
    {
      id: 'your-turn',
      title: 'Your turn',
      emptyLabel: 'Nothing is waiting on you.',
      items: [...review, ...unreadBlocks].sort(byAge)
    },
    {
      id: 'stuck',
      title: 'Stuck',
      emptyLabel: 'Nothing is blocked.',
      items: stuck.sort(byAge)
    },
    {
      id: 'ready',
      title: 'Ready to pick up',
      emptyLabel: 'Nothing is queued up for an agent.',
      items: ready.sort(byAge)
    }
  ];

  const allItems = sections.flatMap(section => section.items);

  return {
    sections,
    alertCount: allItems.filter(item => item.alerts.length > 0).length,
    totalCount: allItems.length
  };
}
