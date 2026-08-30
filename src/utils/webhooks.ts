import { db, subscribeToDatabaseMutations } from '../db/db';
import { assignmentSlug, blockCreator, creatorSlug } from './creators';
import type { Block, TaskAgentTarget, WebhookEndpoint, WebhookEventName } from '../types';

export const WEBHOOK_EVENTS: ReadonlyArray<{ id: WebhookEventName; label: string }> = [
  { id: 'task.status_changed', label: 'Task status changed' },
  { id: 'task.created', label: 'Task created' },
  { id: 'block.created', label: 'Block created' },
  { id: 'block.updated', label: 'Block updated' }
];

export interface WebhookPayload {
  event: WebhookEventName;
  timestamp: string;
  projectId: string;
  blockId: string;
  taskId: string | null;
  oldStatus: string | null;
  newStatus: string | null;
  title: string;
  /** Stable name of the creator: 'user', a provider slug, or a custom agent name. */
  createdBy: string;
  /** The axis to branch on; 'user' is also the default for rows with no recorded creator. */
  createdByType: 'user' | 'agent';
  /** Stable name of the assigned agent, or null when the block is assigned to nobody. */
  assignedTo: string | null;
  tags: string[];
  metadata: {
    source: 'deepscribe';
    kind: 'block' | 'task';
    taskNumber: number | null;
    createdBy: string;
    createdByType: 'user' | 'agent';
    /** Opaque caller identity behind createdBy, when the creator declared one. */
    createdByAgentId: string | null;
    assignedTo: string | null;
    agentTarget?: TaskAgentTarget | null;
    customAgentName?: string | null;
    claimOwner?: string | null;
  };
}

const validEvents = new Set<WebhookEventName>(WEBHOOK_EVENTS.map(event => event.id));

export function normalizeWebhookEndpoints(value: unknown): WebhookEndpoint[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') return [];
    const raw = candidate as Partial<WebhookEndpoint>;
    const authMode = raw.authMode === 'bearer' || raw.authMode === 'hmac' ? raw.authMode : 'none';
    const events = Array.isArray(raw.events)
      ? raw.events.filter((event): event is WebhookEventName => validEvents.has(event as WebhookEventName))
      : [];
    return [{
      id: typeof raw.id === 'string' && raw.id ? raw.id : `webhook-${index}`,
      name: typeof raw.name === 'string' ? raw.name : '',
      url: typeof raw.url === 'string' ? raw.url : '',
      enabled: raw.enabled !== false,
      events: [...new Set(events)],
      authMode,
      secret: typeof raw.secret === 'string' ? raw.secret : ''
    }];
  });
}

function contentFingerprint(block: Block): string {
  return JSON.stringify({
    projectId: block.projectId,
    parentId: block.parentId,
    title: block.title,
    content: block.content,
    tags: block.tags,
    dependsOn: block.dependsOn,
    isTrash: block.isTrash,
    kind: block.kind,
    creator: block.creator,
    taskAgentTarget: block.task?.agentTarget,
    taskCustomAgentName: block.task?.customAgentName,
    taskClaimOwner: block.task?.claim?.ownerId
  });
}

function payload(event: WebhookEventName, block: Block, oldStatus: string | null = null): WebhookPayload {
  const isTask = block.kind === 'task';
  const task = block.task;
  const agentTarget = isTask && task ? task.agentTarget : null;
  const customAgentName = isTask && task?.customAgentName ? task.customAgentName : null;
  const claimOwner = isTask && task?.claim?.ownerId ? task.claim.ownerId : null;

  const creator = blockCreator(block);
  const createdBy = creatorSlug(creator);
  const createdByType = creator.type;
  const createdByAgentId = creator.type === 'agent' ? creator.agentId ?? null : null;

  // Only the assignment itself names the assignee. An active claim is a lease on
  // top of that assignment, not a different assignee, so its opaque owner id
  // stays in metadata.claimOwner rather than leaking into this field.
  const assignedTo = assignmentSlug(agentTarget, customAgentName);

  return {
    event,
    timestamp: new Date().toISOString(),
    projectId: block.projectId,
    blockId: block.id,
    taskId: isTask ? block.id : null,
    oldStatus,
    newStatus: event === 'task.status_changed' ? task?.status ?? null : null,
    title: block.title,
    createdBy,
    createdByType,
    assignedTo,
    tags: [...(block.tags ?? [])],
    metadata: {
      source: 'deepscribe',
      kind: isTask ? 'task' : 'block',
      taskNumber: task?.taskNumber ?? null,
      createdBy,
      createdByType,
      createdByAgentId,
      assignedTo,
      agentTarget,
      customAgentName,
      claimOwner
    }
  };
}

export function deriveWebhookEvents(previous: Block | undefined, current: Block): WebhookPayload[] {
  if (current.isTrash) return [];
  if (!previous) return [payload(current.kind === 'task' ? 'task.created' : 'block.created', current)];

  const events: WebhookPayload[] = [];
  if (previous.task?.status !== current.task?.status && current.kind === 'task') {
    events.push(payload('task.status_changed', current, previous.task?.status ?? null));
  }
  if (contentFingerprint(previous) !== contentFingerprint(current)) {
    events.push(payload('block.updated', current));
  }
  return events;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

async function dispatch(payloadToSend: WebhookPayload): Promise<void> {
  const settings = await db.settings.get('user_settings');
  const endpoints = normalizeWebhookEndpoints(settings?.value?.webhooks)
    .filter(endpoint => endpoint.enabled && endpoint.events.includes(payloadToSend.event) && isHttpUrl(endpoint.url));
  if (endpoints.length === 0) return;

  if (window.electronAPI?.webhooks) {
    void window.electronAPI.webhooks.dispatch({ endpoints, payload: payloadToSend }).catch(error => {
      console.warn('Webhook delivery failed.', error);
    });
    return;
  }

  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (endpoint.authMode === 'bearer' && endpoint.secret) headers.Authorization = `Bearer ${endpoint.secret}`;
    void fetch(endpoint.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payloadToSend),
      signal: controller.signal
    }).catch(error => console.warn(`Webhook delivery to ${endpoint.name || endpoint.url} failed.`, error))
      .finally(() => window.clearTimeout(timeout));
  }
}

export async function startWebhookObserver(): Promise<() => void> {
  let snapshot = new Map((await db.blocks.toArray()).map(block => [block.id, block]));
  let timer: number | null = null;
  let stopped = false;
  let scanPromise = Promise.resolve();

  const scan = async () => {
    const blocks = await db.blocks.toArray();
    const next = new Map(blocks.map(block => [block.id, block]));
    for (const block of blocks) {
      for (const event of deriveWebhookEvents(snapshot.get(block.id), block)) void dispatch(event);
    }
    snapshot = next;
  };

  const unsubscribe = subscribeToDatabaseMutations(() => {
    if (stopped) return;
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      scanPromise = scanPromise.then(scan).catch(error => console.warn('Webhook event detection failed.', error));
    }, 50);
  });

  return () => {
    stopped = true;
    if (timer !== null) window.clearTimeout(timer);
    unsubscribe();
  };
}
