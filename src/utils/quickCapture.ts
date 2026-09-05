import { db } from '../db/db';
import { createId } from '../db/operations';
import type { Block } from '../types';
import { TASK_INBOX_PROJECT_ID } from './taskBlocks';

/** Raw text captures stay source blocks; agents process them through the capture protocol. */
export const CAPTURE_TAG = 'capture';
export const CAPTURE_UNPROCESSED_TAG = 'capture-unprocessed';
export const CAPTURE_PROCESSED_TAG = 'capture-processed';

/** Longest a derived title gets before it is cut short. */
const TITLE_MAX_LENGTH = 60;

export function isCaptureBlock(block: { tags?: string[] }): boolean {
  return (block.tags ?? []).includes(CAPTURE_TAG);
}

/**
 * True once an agent has swapped the tags over. Processed entries drop out of
 * the inbox view; the block itself stays put, so the trail back to the original
 * wording survives.
 */
export function isProcessedCapture(block: { tags?: string[] }): boolean {
  const tags = block.tags ?? [];
  return tags.includes(CAPTURE_TAG) && tags.includes(CAPTURE_PROCESSED_TAG);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

/**
 * A capture never asks for a title, so one is derived from the first line that
 * has something on it. The full text is kept in the body either way.
 */
export function captureTitleFromText(text: string): string {
  const firstLine = text.split('\n').map(line => line.trim()).find(line => line.length > 0) ?? '';
  if (!firstLine) return 'Capture';
  if (firstLine.length <= TITLE_MAX_LENGTH) return firstLine;
  return `${firstLine.slice(0, TITLE_MAX_LENGTH - 1).trimEnd()}…`;
}

/**
 * The raw text goes in verbatim, one paragraph per line, so nothing the user
 * typed is reworded or dropped. A project hint is appended as its own line,
 * clearly separate from what was typed.
 */
export function captureContentHtml(text: string, projectHintName?: string): string {
  const paragraphs = text.replace(/\r\n/g, '\n').split('\n')
    .map(line => `<p>${escapeHtml(line) || '<br>'}</p>`)
    .join('');
  const hint = projectHintName
    ? `<p><em>Project hint: ${escapeHtml(projectHintName)}</em></p>`
    : '';
  return `${paragraphs}${hint}`;
}

export function capturePlainText(text: string, projectHintName?: string): string {
  const body = text.replace(/\r\n/g, '\n');
  return projectHintName ? `${body}\n\nProject hint: ${projectHintName}` : body;
}

export interface CreateCapturePayload {
  text: string;
  requestId?: string;
  /** Optional and never required — the user may already know where it belongs. */
  projectHintName?: string;
}

/**
 * Writes one capture entry into the Workspace Inbox. Returns null for text that
 * is only whitespace, so an accidental empty save leaves nothing behind.
 */
export async function createCaptureBlock(payload: CreateCapturePayload): Promise<Block | null> {
  const text = payload.text.replace(/\r\n/g, '\n');
  if (!text.trim()) return null;

  const hint = payload.projectHintName?.trim() || undefined;
  const now = Date.now();
  const title = captureTitleFromText(text);

  const block: Block = {
    id: createId('block'),
    projectId: TASK_INBOX_PROJECT_ID,
    parentId: null,
    title,
    content: captureContentHtml(text, hint),
    plainText: capturePlainText(text, hint),
    order: now,
    childCount: 0,
    taskCount: 0,
    completedTaskCount: 0,
    attachmentCount: 0,
    isTrash: false,
    tags: [CAPTURE_TAG, CAPTURE_UNPROCESSED_TAG],
    capture: { status: 'pending', rawText: text, requestId: payload.requestId, projectHintName: hint, questions: [], results: [] },
    creator: { type: 'user' },
    createdAt: now,
    updatedAt: now
  };

  const stored = await db.transaction('rw', db.blocks, async () => {
    const existing = payload.requestId ? await db.blocks.filter(b => b.capture?.requestId === payload.requestId).first() : undefined;
    if (existing) {
      if (existing.plainText !== block.plainText) throw new Error('This capture request was already saved with different content.');
      return existing;
    }
    await db.blocks.add(block);
    return block;
  });
  if (stored.id !== block.id) return stored;

  try {
    await db.activities.add({
      id: crypto.randomUUID(),
      projectId: block.projectId,
      blockId: block.id,
      source: 'user',
      action: 'block-created',
      summary: `Captured “${title}”`,
      createdAt: now
    });
  } catch {
    // An entry without an activity line is still an entry.
  }

  return block;
}

export function extractProjectHint(plainText: string): { rawText: string; hintName?: string } {
  const match = plainText.match(/(?:\r?\n)*Project hint:\s*(.+)$/i);
  if (match) {
    const hintName = match[1].trim();
    const rawText = plainText.slice(0, match.index).trim();
    return { rawText, hintName: hintName || undefined };
  }
  return { rawText: plainText.trim(), hintName: undefined };
}

export function isUnprocessedCapture(block: { tags?: string[]; kind?: string; isTrash?: boolean }): boolean {
  if (block.isTrash || block.kind === 'task') return false;
  const tags = block.tags ?? [];
  return tags.includes(CAPTURE_TAG) && tags.includes(CAPTURE_UNPROCESSED_TAG);
}
