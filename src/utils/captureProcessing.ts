import { db } from '../db/db';
import {
  CAPTURE_PROCESSOR_KEY,
  prepareCaptureOperation,
  answerCapture,
  keepCaptureAsLooseNote as keepLooseNoteHelper,
  dismissCapture as dismissCaptureHelper,
  editCaptureProposal as editProposalHelper
} from '../../mcp/core/captures.mjs';
import type { Block, BlockLink, BlockRevision, ActivityEntry, CaptureProposal, CaptureProposalOperation } from '../types';

export async function executeCaptureOperation(method: string, params: Record<string, unknown>) {
  return db.transaction('rw', [db.blocks, db.projects, db.links, db.revisions, db.activities, db.settings], async () => {
    const prepared = prepareCaptureOperation(method, params, {
      blocks: await db.blocks.toArray(),
      projects: await db.projects.toArray(),
      links: await db.links.toArray(),
      processor: (await db.settings.get(CAPTURE_PROCESSOR_KEY))?.value
    });
    if (prepared.blocks.length) await db.blocks.bulkPut(prepared.blocks as Block[]);
    if (prepared.links.length) await db.links.bulkPut(prepared.links as BlockLink[]);
    if (prepared.revisions.length) await db.revisions.bulkPut(prepared.revisions as BlockRevision[]);
    if (prepared.activities.length) await db.activities.bulkPut(prepared.activities as ActivityEntry[]);
    if (prepared.processor) await db.settings.put(prepared.processor);
    return prepared.result;
  });
}

export async function applyCaptureProposal(
  captureId: string,
  options?: { proposal?: CaptureProposal; operations?: CaptureProposalOperation[] }
) {
  return executeCaptureOperation('apply_capture_proposal', {
    captureId,
    ...(options?.proposal ? { proposal: options.proposal } : {}),
    ...(options?.operations ? { operations: options.operations } : {})
  });
}

export async function submitCaptureAnswer(captureId: string, answer: string) {
  await db.transaction('rw', db.blocks, async () => {
    const block = await db.blocks.get(captureId);
    if (!block || block.isTrash) throw new Error('Capture not found.');
    await db.blocks.put(answerCapture(block, answer) as Block);
  });
}

export async function keepCaptureAsLooseNote(captureId: string) {
  await db.transaction('rw', db.blocks, async () => {
    const block = await db.blocks.get(captureId);
    if (!block || block.isTrash) throw new Error('Capture not found.');
    await db.blocks.put(keepLooseNoteHelper(block) as Block);
  });
}

export async function dismissCapture(captureId: string) {
  await db.transaction('rw', db.blocks, async () => {
    const block = await db.blocks.get(captureId);
    if (!block || block.isTrash) throw new Error('Capture not found.');
    await db.blocks.put(dismissCaptureHelper(block) as Block);
  });
}

export async function editCaptureProposal(captureId: string, proposalEdits: Partial<CaptureProposal>) {
  await db.transaction('rw', db.blocks, async () => {
    const block = await db.blocks.get(captureId);
    if (!block || block.isTrash) throw new Error('Capture not found.');
    await db.blocks.put(editProposalHelper(block, proposalEdits) as Block);
  });
}

export async function requestImmediateAnalysis(captureId: string) {
  await db.transaction('rw', db.blocks, async () => {
    const block = await db.blocks.get(captureId);
    if (!block || block.isTrash) throw new Error('Capture not found.');
    const updated = {
      ...block,
      capture: {
        ...block.capture,
        needsImmediateReview: true
      },
      updatedAt: Date.now()
    };
    await db.blocks.put(updated as Block);
  });
}
