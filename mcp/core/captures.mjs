/** Shared capture protocol. Pure preparation: adapters commit all returned rows atomically. */
import { contentToHtml } from './html.mjs';
import { containsMarkdownTask, contentStatsFromHtml } from './markdown.mjs';
import { createTaskMetadata, getNextTaskNumber, TASK_INBOX_PROJECT_ID } from './tasks.mjs';
import { sanitizeTags } from './tags.mjs';

export const CAPTURE_PROCESSOR_KEY = 'capture_processor';
export const CAPTURE_METHODS = [
  'list_captures',
  'get_capture',
  'claim_next_capture',
  'renew_capture_claim',
  'propose_capture',
  'apply_capture_proposal',
  'complete_capture'
];

/** @param {any} block */
export function captureMetadata(block) {
  if (!block || block.kind === 'task' || !block.tags?.includes('capture')) return undefined;
  const rawStatus = block.capture?.status ?? (block.tags.includes('capture-processed') ? 'processed' : 'pending');
  return {
    ...block.capture,
    status: rawStatus,
    questions: block.capture?.questions ?? [],
    results: block.capture?.results ?? [],
    proposals: block.capture?.proposals ?? (block.capture?.activeProposal ? [block.capture.activeProposal] : [])
  };
}

/** @param {any} block @param {number} [now] */
export function captureStatus(block, now = Date.now()) {
  const meta = captureMetadata(block);
  if (!meta) return undefined;
  if (meta.status === 'processing' && (!meta.claim || meta.claim.expiresAt <= now)) {
    return 'pending';
  }
  return meta.status;
}

/** @param {any} block */
export function publicCapture(block) {
  const copy = structuredClone(block);
  copy.capture = structuredClone(captureMetadata(block));
  if (copy.capture?.claim) delete copy.capture.claim.token;
  if (copy.capture) {
    delete copy.capture.receipts;
    delete copy.capture.claimRequests;
    delete copy.capture.requestId;
  }
  return copy;
}

/** @param {any} value @param {string} name */
function required(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required.`);
  return value.trim();
}

/** @param {any} block @param {any} params @param {number} now */
function owned(block, params, now) {
  const claim = captureMetadata(block)?.claim;
  if (!claim || claim.ownerId !== params.agentId || claim.token !== params.claimToken || claim.expiresAt <= now) {
    throw new Error('A current capture claim owned by this agent is required.');
  }
  if (claim.sourceUpdatedAt !== undefined && claim.sourceUpdatedAt !== block.updatedAt) {
    throw new Error('Capture changed during processing. Reclaim and read the updated source.');
  }
  return claim;
}

/** Protect sources against older clients which still use generic block writes.
 * @param {any} block @returns {string | null} */
export function captureWriteRefusal(block) {
  return captureMetadata(block) ? 'Capture sources are preserved. Use the capture tools to process this entry.' : null;
}

/** @param {any} block @param {string} answer @param {number} [now] */
export function answerCapture(block, answer, now = Date.now()) {
  const meta = captureMetadata(block);
  if (meta?.status !== 'needs-input') throw new Error('This capture is not waiting for an answer.');
  const questions = structuredClone(meta.questions ?? []);
  const question = questions.at(-1);
  if (!question || question.answer) throw new Error('No unanswered question was found.');
  question.answer = required(answer, 'Answer');
  question.answeredAt = now;
  return {
    ...block,
    updatedAt: Math.max(now, block.updatedAt + 1),
    capture: {
      ...meta,
      status: 'pending',
      claim: undefined,
      error: undefined,
      questions
    }
  };
}

/** @param {any} block @param {number} [now] */
export function keepCaptureAsLooseNote(block, now = Date.now()) {
  const meta = captureMetadata(block);
  const updatedMeta = {
    ...meta,
    claim: undefined,
    status: 'kept',
    processedAt: now
  };
  return {
    ...block,
    updatedAt: Math.max(now, block.updatedAt + 1),
    capture: updatedMeta,
    tags: [...block.tags.filter((/** @type {string} */ t) => t !== 'capture-unprocessed' && t !== 'capture-processed'), 'capture-processed']
  };
}

/** @param {any} block @param {number} [now] */
export function dismissCapture(block, now = Date.now()) {
  const meta = captureMetadata(block);
  const updatedMeta = {
    ...meta,
    claim: undefined,
    status: 'dismissed',
    processedAt: now
  };
  return {
    ...block,
    updatedAt: Math.max(now, block.updatedAt + 1),
    capture: updatedMeta,
    tags: [...block.tags.filter((/** @type {string} */ t) => t !== 'capture-unprocessed' && t !== 'capture-processed'), 'capture-processed']
  };
}

/** @param {any} block @param {any} editedProposal @param {number} [now] @param {() => string} [uuid] */
export function editCaptureProposal(block, editedProposal, now = Date.now(), uuid = () => crypto.randomUUID()) {
  const meta = captureMetadata(block);
  const current = meta.activeProposal;
  if (!current) throw new Error('No active proposal found to edit.');
  const version = (meta.proposals?.length ?? 0) + 1;
  const newProposal = {
    ...current,
    ...editedProposal,
    id: `prop-${uuid()}`,
    version,
    updatedAt: now,
    conflict: false,
    conflictReason: undefined
  };
  const proposals = [...(meta.proposals ?? []), newProposal];
  const updatedMeta = {
    ...meta,
    activeProposal: newProposal,
    proposals,
    summary: newProposal.summary
  };
  return {
    ...block,
    updatedAt: Math.max(now, block.updatedAt + 1),
    capture: updatedMeta
  };
}

/** @param {any} metadata */
export function importCaptureMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || !['pending', 'processing', 'needs-input', 'proposal', 'processed', 'kept', 'dismissed'].includes(metadata.status)) {
    throw new Error('Invalid capture metadata.');
  }
  const copy = structuredClone(metadata);
  delete copy.claim;
  delete copy.receipts;
  delete copy.claimRequests;
  delete copy.requestId;
  if (copy.status === 'processing') copy.status = 'pending';
  copy.questions = (Array.isArray(copy.questions) ? copy.questions : [])
    .filter((/** @type {any} */ q) => typeof q?.question === 'string')
    .map((/** @type {any} */ q) => ({ question: q.question, askedAt: Number(q.askedAt) || 0, ...(typeof q.answer === 'string' ? { answer: q.answer, answeredAt: Number(q.answeredAt) || 0 } : {}) }));
  copy.results = (Array.isArray(copy.results) ? copy.results : [])
    .filter((/** @type {any} */ r) => typeof r?.blockId === 'string' && typeof r?.title === 'string');
  return copy;
}

/** @param {string} method @param {any} params
 * @param {{blocks: any[], projects: any[], links: any[], processor?: any}} state
 * @param {number} [now] @param {() => string} [uuid] */
export function prepareCaptureOperation(method, params, state, now = Date.now(), uuid = () => crypto.randomUUID()) {
  const blocks = structuredClone(state.blocks);
  const changed = new Map();
  /** @type {any[]} */
  const links = [];
  /** @type {any[]} */
  const revisions = [];
  /** @type {any[]} */
  const activities = [];
  /** @type {any} */
  let processor;
  /** @type {any} */
  let result;
  const activeProjects = new Set(state.projects.filter(p => !p.isTrash).map(p => p.id));
  const captures = blocks.filter(b => !b.isTrash && activeProjects.has(b.projectId) && captureMetadata(b));
  const put = (/** @type {any} */ b) => {
    changed.set(b.id, b);
    const i = blocks.findIndex(row => row.id === b.id);
    if (i < 0) blocks.push(b); else blocks[i] = b;
  };
  const finish = () => ({ blocks: [...changed.values()], links, revisions, activities, processor, result });

  if (method === 'list_captures') {
    const validStatuses = ['pending', 'processing', 'needs-input', 'proposal', 'processed', 'kept', 'dismissed'];
    if (params.status && !validStatuses.includes(params.status)) throw new Error('Invalid capture status.');
    result = {
      captures: captures
        .filter(b => !params.status || captureStatus(b, now) === params.status)
        .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
        .slice(0, Math.max(1, Math.min(100, Number(params.limit) || 50)))
        .map(publicCapture),
      lastCheckedAt: state.processor?.lastCheckedAt ?? null
    };
    return finish();
  }

  if (method === 'claim_next_capture') {
    const agentId = required(params.agentId, 'agentId');
    const requestId = required(params.requestId, 'requestId');
    processor = {
      key: CAPTURE_PROCESSOR_KEY,
      value: {
        lastCheckedAt: now,
        agentId,
        ...(params.agentTarget ? { agentTarget: params.agentTarget } : {}),
        ...(params.customAgentName ? { customAgentName: params.customAgentName } : {})
      }
    };
    const replay = captures.find(b => b.capture?.claim?.ownerId === agentId && b.capture.claim.requestId === requestId);
    if (replay) {
      if (replay.capture.claim.expiresAt <= now) throw new Error('This claim request expired. Use a new requestId.');
      result = { capture: publicCapture(replay), claimToken: replay.capture.claim.token };
      return finish();
    }
    if (captures.some(b => b.capture?.claimRequests?.some((/** @type {any} */ r) => r.agentId === agentId && r.requestId === requestId))) {
      throw new Error('This claim request was already completed or superseded. Use a new requestId.');
    }
    const block = captures.filter(b => captureStatus(b, now) === 'pending').sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))[0];
    if (!block) {
      result = { capture: null };
      return finish();
    }
    const claim = {
      ownerId: agentId,
      agentTarget: params.agentTarget,
      customAgentName: params.customAgentName,
      requestId,
      token: uuid(),
      claimedAt: now,
      sourceUpdatedAt: block.updatedAt,
      expiresAt: now + 900_000
    };
    const updated = {
      ...block,
      capture: {
        ...captureMetadata(block),
        status: 'processing',
        claim,
        claimRequests: [...(captureMetadata(block).claimRequests ?? []), { agentId, requestId }],
        error: undefined
      }
    };
    put(updated);
    result = { capture: publicCapture(updated), claimToken: claim.token };
    return finish();
  }

  const block = captures.find(b => b.id === required(params.captureId, 'captureId'));
  if (!block) throw new Error('Capture not found.');

  if (method === 'get_capture') {
    result = publicCapture(block);
    return finish();
  }

  if (method === 'renew_capture_claim') {
    const claim = owned(block, params, now);
    const updated = { ...block, capture: { ...captureMetadata(block), claim: { ...claim, expiresAt: now + 900_000 } } };
    put(updated);
    result = { capture: publicCapture(updated), expiresAt: updated.capture.claim.expiresAt };
    return finish();
  }

  // Backward compatibility: route complete_capture to propose_capture so no unauthorized writes happen
  if (method === 'complete_capture') {
    const mappedOutcome = params.outcome === 'processed' ? 'proposal' : params.outcome;
    return prepareCaptureOperation('propose_capture', { ...params, outcome: mappedOutcome }, state, now, uuid);
  }

  if (method === 'propose_capture') {
    const requestId = required(params.requestId, 'requestId');
    const agentId = required(params.agentId, 'agentId');
    const meta = captureMetadata(block);
    const fingerprint = JSON.stringify({
      outcome: params.outcome,
      summary: params.summary,
      rationale: params.rationale,
      question: params.question,
      error: params.error,
      operations: params.operations ?? []
    });
    const receipt = (meta.receipts ?? []).find((/** @type {any} */ r) => r.requestId === requestId && r.agentId === agentId);
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) throw new Error('requestId was already used with different content.');
      result = receipt.result;
      return finish();
    }
    owned(block, params, now);
    const ops = params.operations ?? [];
    if (!Array.isArray(ops) || ops.length > 20) throw new Error('Provide at most 20 operations.');
    const outcome = params.outcome ?? 'proposal';
    if (!['proposal', 'needs-input', 'error'].includes(outcome)) throw new Error('Invalid capture outcome.');
    if (outcome !== 'proposal' && ops.length) throw new Error('Questions and errors cannot propose content operations.');

    let diffPreview;
    if (outcome === 'proposal') {
      if (!ops.length) throw new Error('A proposal must include at least one operation.');
      for (const op of ops) {
        if (op.type === 'append' || op.type === 'existing') {
          const target = blocks.find(b => b.id === op.blockId && !b.isTrash && activeProjects.has(b.projectId));
          if (!target || target.id === block.id || captureMetadata(target)) throw new Error('Result destination not found or is a capture source.');
          if (op.type === 'append') {
            if (target.kind === 'task') throw new Error('Capture processing cannot edit existing tasks. Reference the task instead.');
            const text = required(op.content, 'content');
            if (containsMarkdownTask(text)) throw new Error('Use a new task operation for follow-up work.');
            if (!diffPreview) {
              diffPreview = {
                targetBlockTitle: target.title,
                targetBlockId: target.id,
                originalContent: target.plainText || target.content,
                appendedContent: text
              };
            }
          }
        } else if (op.type === 'knowledge' || op.type === 'task') {
          const projectId = op.projectId || (op.type === 'task' ? TASK_INBOX_PROJECT_ID : '');
          if (!activeProjects.has(projectId) || (op.type === 'knowledge' && projectId === TASK_INBOX_PROJECT_ID)) {
            throw new Error('Choose an existing project for this result.');
          }
          if (op.parentId) {
            const parent = blocks.find(b => b.id === op.parentId && b.projectId === projectId && !b.isTrash && b.kind !== 'task' && !captureMetadata(b));
            if (!parent) throw new Error('Invalid destination parent.');
          }
          if (op.type === 'task') {
            required(op.goal, 'goal');
            required(op.context, 'context');
            if (!Array.isArray(op.acceptanceCriteria) || !op.acceptanceCriteria.length) throw new Error('Task acceptance criteria are required.');
          }
          required(op.content || (op.type === 'task' ? 'task' : ''), 'content');
        } else {
          throw new Error('Invalid capture operation type.');
        }
      }
    }

    const summary = required(params.summary, 'summary');
    let activeProposal;
    const proposals = [...(meta.proposals ?? [])];
    if (outcome === 'proposal') {
      const version = proposals.length + 1;
      activeProposal = {
        id: `prop-${uuid()}`,
        version,
        agentId,
        agentTarget: params.agentTarget,
        customAgentName: params.customAgentName || agentId,
        summary,
        rationale: params.rationale || params.explanation || undefined,
        operations: ops,
        diffPreview,
        conflict: false,
        createdAt: now
      };
      proposals.push(activeProposal);
    }

    const updatedMeta = {
      ...meta,
      claim: undefined,
      status: outcome === 'error' ? 'pending' : outcome,
      summary,
      error: outcome === 'error' ? required(params.error, 'error') : undefined,
      activeProposal: activeProposal ?? meta.activeProposal,
      proposals,
      questions: [...(meta.questions ?? [])]
    };
    if (outcome === 'needs-input') {
      updatedMeta.questions.push({ question: required(params.question, 'question'), askedAt: now });
    }
    const updated = {
      ...block,
      capture: updatedMeta,
      tags: [...block.tags.filter((/** @type {string} */ t) => t !== 'capture-unprocessed' && t !== 'capture-processed'), 'capture-unprocessed']
    };
    result = publicCapture(updated);
    updatedMeta.receipts = [...(meta.receipts ?? []), { agentId, requestId, fingerprint, result }];
    put(updated);
    return finish();
  }

  if (method === 'apply_capture_proposal') {
    const meta = captureMetadata(block);
    const proposal = params.proposal ?? meta.activeProposal;
    if (!proposal) throw new Error('No active proposal found for this capture.');
    const ops = params.operations ?? proposal.operations ?? [];
    if (!Array.isArray(ops) || !ops.length) throw new Error('A proposal must have at least one operation.');

    // Concurrency / conflict check
    for (const op of ops) {
      if (op.type === 'append' || op.type === 'existing') {
        const target = blocks.find(b => b.id === op.blockId && !b.isTrash && activeProjects.has(b.projectId));
        if (!target) throw new Error('Result destination no longer exists.');
        if (op.expectedUpdatedAt !== undefined && target.updatedAt !== op.expectedUpdatedAt) {
          const updatedProposal = {
            ...proposal,
            conflict: true,
            conflictReason: `Destination “${target.title}” was modified since this proposal was prepared.`
          };
          const updatedMeta = {
            ...meta,
            activeProposal: updatedProposal
          };
          const conflictedBlock = { ...block, capture: updatedMeta };
          put(conflictedBlock);
          result = { conflict: true, error: updatedProposal.conflictReason, capture: publicCapture(conflictedBlock) };
          return finish();
        }
      }
    }

    // Atomically execute operations
    const results = [];
    const touched = new Set();
    const revision = (/** @type {any} */ b) => revisions.push({
      id: `rev-${uuid()}`,
      blockId: b.id,
      projectId: b.projectId,
      title: b.title,
      content: b.content,
      plainText: b.plainText,
      tags: b.tags,
      kind: b.kind,
      task: b.task,
      source: 'agent',
      summary: `Capture proposal approved: ${proposal.summary}`,
      createdAt: now
    });

    for (const op of ops) {
      /** @type {any} */
      let target;
      if (op.type === 'append' || op.type === 'existing') {
        target = blocks.find(b => b.id === op.blockId && !b.isTrash && activeProjects.has(b.projectId));
        if (!target || target.id === block.id || captureMetadata(target)) throw new Error('Result destination not found or is a capture source.');
        if (touched.has(target.id)) throw new Error('Use a single operation per destination.');
        touched.add(target.id);
        if (op.type === 'append') {
          if (target.kind === 'task') throw new Error('Capture processing cannot edit existing tasks.');
          const text = required(op.content, 'content');
          revision(target);
          const content = target.content + contentToHtml(text);
          target = {
            ...target,
            ...contentStatsFromHtml(content),
            updatedAt: Math.max(now, target.updatedAt + 1),
            lastAgentEditAt: now
          };
          put(target);
          revision(target);
        }
      } else if (op.type === 'knowledge' || op.type === 'task') {
        const projectId = op.projectId || (op.type === 'task' ? TASK_INBOX_PROJECT_ID : '');
        if (!activeProjects.has(projectId) || (op.type === 'knowledge' && projectId === TASK_INBOX_PROJECT_ID)) {
          throw new Error('Choose an existing project for this result.');
        }
        const parent = op.parentId ? blocks.find(b => b.id === op.parentId && b.projectId === projectId && !b.isTrash && b.kind !== 'task' && !captureMetadata(b)) : null;
        if (op.parentId && !parent) throw new Error('Invalid destination parent.');
        let text = op.content;
        if (op.type === 'task') {
          const goal = required(op.goal, 'goal');
          const context = required(op.context, 'context');
          if (!Array.isArray(op.acceptanceCriteria) || !op.acceptanceCriteria.length) throw new Error('Task acceptance criteria are required.');
          text = `## Goal\n\n${goal}\n\n## Context\n\n${context}\n\n## Acceptance Criteria\n\n${op.acceptanceCriteria.map((/** @type {string} */ c) => `- ${required(c, 'criterion')}`).join('\n')}`;
        }
        text = required(text, 'content');
        const content = contentToHtml(text);
        target = {
          id: `block-${uuid()}`,
          projectId,
          parentId: parent?.id ?? null,
          title: required(op.title, 'title'),
          ...contentStatsFromHtml(content),
          tags: sanitizeTags(op.tags ?? []).filter(t => !t.startsWith('capture') && !t.startsWith('agent-') && t !== 'todo'),
          order: Math.max(-1, ...blocks.filter(b => b.projectId === projectId && b.parentId === (parent?.id ?? null)).map(b => b.order)) + 1,
          childCount: 0,
          attachmentCount: 0,
          isTrash: false,
          creator: { type: 'agent', agentId: proposal.agentId },
          createdAt: now,
          updatedAt: now,
          lastAgentEditAt: now
        };
        if (op.type === 'task') {
          target.kind = 'task';
          target.task = createTaskMetadata(
            now,
            { type: 'agent', agentId: proposal.agentId, agentTarget: 'custom', customAgentName: proposal.customAgentName || proposal.agentId, requestId: `${block.id}:${proposal.id}:${results.length}` },
            getNextTaskNumber(blocks)
          );
        }
        put(target);
        revision(target);
        if (parent) put({ ...parent, childCount: blocks.filter(b => b.parentId === parent.id && !b.isTrash).length, updatedAt: Math.max(now, parent.updatedAt + 1) });
      } else {
        throw new Error('Invalid capture operation type.');
      }
      results.push({ blockId: target.id, projectId: target.projectId, title: target.title, action: op.type });
      if (!state.links.some(l => l.sourceBlockId === target.id && l.targetBlockId === block.id && l.type === 'derived-from')) {
        links.push({ id: `link-${uuid()}`, sourceBlockId: target.id, targetBlockId: block.id, type: 'derived-from', createdBy: 'agent', createdAt: now });
      }
      if (op.type !== 'existing') {
        activities.push({
          id: uuid(),
          projectId: target.projectId,
          blockId: target.id,
          source: 'agent',
          action: op.type === 'append' ? 'block-updated' : 'block-created',
          summary: `Capture processed into “${target.title}”`,
          createdAt: now
        });
      }
    }

    const updatedMeta = {
      ...meta,
      claim: undefined,
      status: 'processed',
      results,
      processedAt: now,
      activeProposal: { ...proposal, status: 'approved' }
    };
    const updated = {
      ...block,
      capture: updatedMeta,
      tags: [...block.tags.filter((/** @type {string} */ t) => t !== 'capture-unprocessed' && t !== 'capture-processed'), 'capture-processed']
    };
    put(updated);
    result = publicCapture(updated);
    return finish();
  }

  throw new Error('Unknown capture operation.');
}
