import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import type { Project } from '../types';
import { TASK_INBOX_PROJECT_ID } from './taskBlocks';
import {
  CAPTURE_PROCESSED_TAG,
  CAPTURE_TAG,
  CAPTURE_UNPROCESSED_TAG,
  capturePlainText,
  captureContentHtml,
  captureTitleFromText,
  convertCaptureToReadyTask,
  createCaptureBlock,
  extractProjectHint,
  isCaptureBlock,
  isProcessedCapture,
  isUnprocessedCapture,
  updateCaptureProjectHint
} from './quickCapture';

describe('captureTitleFromText', () => {
  it('takes the first line that has something on it', () => {
    expect(captureTitleFromText('\n\n  Call the supplier back  \nand ask about the invoice')).toBe('Call the supplier back');
  });

  it('shortens a long first line', () => {
    const title = captureTitleFromText('x'.repeat(200));
    expect(title).toHaveLength(60);
    expect(title.endsWith('…')).toBe(true);
  });

  it('falls back to a label when there is nothing to derive from', () => {
    expect(captureTitleFromText('   \n  ')).toBe('Capture');
  });
});

describe('captureContentHtml', () => {
  it('keeps the typed text verbatim, one paragraph per line', () => {
    expect(captureContentHtml('first\nsecond')).toBe('<p>first</p><p>second</p>');
  });

  it('keeps blank lines rather than collapsing them', () => {
    expect(captureContentHtml('a\n\nb')).toBe('<p>a</p><p><br></p><p>b</p>');
  });

  it('escapes markup so a capture cannot inject content', () => {
    expect(captureContentHtml('<script>alert("x")</script>')).toBe(
      '<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>'
    );
  });

  it('adds a project hint as its own line, after the text', () => {
    expect(captureContentHtml('idea', 'Acme')).toBe('<p>idea</p><p><em>Project hint: Acme</em></p>');
  });

  it('leaves the hint out when none was given', () => {
    expect(captureContentHtml('idea')).toBe('<p>idea</p>');
  });
});

describe('capturePlainText', () => {
  it('is the raw text when there is no hint', () => {
    expect(capturePlainText('idea')).toBe('idea');
  });

  it('appends the hint below the text', () => {
    expect(capturePlainText('idea', 'Acme')).toBe('idea\n\nProject hint: Acme');
  });
});

describe('extractProjectHint', () => {
  it('extracts hint name and raw text when hint is present', () => {
    const result = extractProjectHint('Need to buy milk\n\nProject hint: Personal');
    expect(result.rawText).toBe('Need to buy milk');
    expect(result.hintName).toBe('Personal');
  });

  it('returns raw text and undefined hint when no hint is present', () => {
    const result = extractProjectHint('Just a simple note');
    expect(result.rawText).toBe('Just a simple note');
    expect(result.hintName).toBeUndefined();
  });
});

describe('capture state', () => {
  it('recognises a capture by its tag', () => {
    expect(isCaptureBlock({ tags: [CAPTURE_TAG, CAPTURE_UNPROCESSED_TAG] })).toBe(true);
    expect(isCaptureBlock({ tags: ['idea'] })).toBe(false);
    expect(isCaptureBlock({ tags: undefined })).toBe(false);
  });

  it('recognises unprocessed captures', () => {
    expect(isUnprocessedCapture({ tags: [CAPTURE_TAG, CAPTURE_UNPROCESSED_TAG] })).toBe(true);
    expect(isUnprocessedCapture({ tags: [CAPTURE_TAG, CAPTURE_PROCESSED_TAG] })).toBe(false);
    expect(isUnprocessedCapture({ tags: [CAPTURE_TAG, CAPTURE_UNPROCESSED_TAG], kind: 'task' })).toBe(false);
    expect(isUnprocessedCapture({ tags: [CAPTURE_TAG, CAPTURE_UNPROCESSED_TAG], isTrash: true })).toBe(false);
  });

  it('counts an entry as processed only once an agent swapped the tag over', () => {
    expect(isProcessedCapture({ tags: [CAPTURE_TAG, CAPTURE_UNPROCESSED_TAG] })).toBe(false);
    expect(isProcessedCapture({ tags: [CAPTURE_TAG, CAPTURE_PROCESSED_TAG] })).toBe(true);
  });

  it('leaves an ordinary block alone even if it carries the processed tag', () => {
    expect(isProcessedCapture({ tags: [CAPTURE_PROCESSED_TAG] })).toBe(false);
  });
});

describe('createCaptureBlock and convertCaptureToReadyTask with agent target and project hint', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
    await db.blocks.clear();
  });

  afterAll(async () => {
    db.close();
    await db.delete();
  });

  it('preserves captureAgentTarget when creating a capture block', async () => {
    const block = await createCaptureBlock({
      text: 'Research new LLM capabilities',
      projectHintName: 'AI Roadmap',
      agentTarget: 'openai'
    });

    expect(block).not.toBeNull();
    expect(block?.captureAgentTarget).toBe('openai');
    const stored = await db.blocks.get(block!.id);
    expect(stored?.captureAgentTarget).toBe('openai');
  });

  it('converts capture with specific agent to a Ready task assigned to that agent', async () => {
    const projects: Project[] = [
      { id: 'proj-ai', title: 'AI Roadmap', description: '', color: '#3b82f6', order: 0, tags: [], isTrash: false, createdAt: 1, updatedAt: 1 }
    ];

    const capture = await createCaptureBlock({
      text: 'Build new agent feature',
      projectHintName: 'AI Roadmap',
      agentTarget: 'claude'
    });
    expect(capture).not.toBeNull();

    const readyTask = await convertCaptureToReadyTask(capture!, projects, [capture!]);
    expect(readyTask.kind).toBe('task');
    expect(readyTask.projectId).toBe('proj-ai');
    expect(readyTask.task?.status).toBe('ready');
    expect(readyTask.task?.agentTarget).toBe('claude');
  });

  it('converts capture with none agent to a Ready task assigned to any', async () => {
    const projects: Project[] = [];

    const capture = await createCaptureBlock({
      text: 'Unassigned task note',
      agentTarget: 'none'
    });
    expect(capture).not.toBeNull();

    const readyTask = await convertCaptureToReadyTask(capture!, projects, [capture!]);
    expect(readyTask.kind).toBe('task');
    expect(readyTask.projectId).toBe(TASK_INBOX_PROJECT_ID);
    expect(readyTask.task?.status).toBe('ready');
    expect(readyTask.task?.agentTarget).toBe('any');
  });

  it('converts capture without agent specified to a Ready task assigned to any', async () => {
    const projects: Project[] = [];

    const capture = await createCaptureBlock({
      text: 'Capture without agent field'
    });
    expect(capture).not.toBeNull();

    const readyTask = await convertCaptureToReadyTask(capture!, projects, [capture!]);
    expect(readyTask.task?.agentTarget).toBe('any');
  });

  describe('updateCaptureProjectHint', () => {
    it('appends a project hint when none existed', () => {
      const html = '<p>Initial capture text</p>';
      const plain = 'Initial capture text';
      const updated = updateCaptureProjectHint(html, plain, 'DeepScribe');

      expect(updated.plainText).toBe('Initial capture text\n\nProject hint: DeepScribe');
      expect(updated.html).toBe('<p>Initial capture text</p><p><em>Project hint: DeepScribe</em></p>');
    });

    it('replaces an existing project hint with a new one', () => {
      const html = '<p>Call supplier</p><p><em>Project hint: Old Project</em></p>';
      const plain = 'Call supplier\n\nProject hint: Old Project';
      const updated = updateCaptureProjectHint(html, plain, 'New Project');

      expect(updated.plainText).toBe('Call supplier\n\nProject hint: New Project');
      expect(updated.html).toBe('<p>Call supplier</p><p><em>Project hint: New Project</em></p>');
    });

    it('removes an existing project hint when projectTitle is undefined or empty', () => {
      const html = '<p>Call supplier</p><p><em>Project hint: Old Project</em></p>';
      const plain = 'Call supplier\n\nProject hint: Old Project';
      const updated = updateCaptureProjectHint(html, plain, undefined);

      expect(updated.plainText).toBe('Call supplier');
      expect(updated.html).toBe('<p>Call supplier</p>');

      const updatedEmpty = updateCaptureProjectHint(html, plain, '   ');
      expect(updatedEmpty.plainText).toBe('Call supplier');
      expect(updatedEmpty.html).toBe('<p>Call supplier</p>');
    });

    it('handles empty body text gracefully when adding and removing hints', () => {
      const updated = updateCaptureProjectHint('', '', 'Website');
      expect(updated.plainText).toBe('Project hint: Website');
      expect(updated.html).toBe('<p><em>Project hint: Website</em></p>');

      const cleared = updateCaptureProjectHint(updated.html, updated.plainText, '');
      expect(cleared.plainText).toBe('');
      expect(cleared.html).toBe('<p></p>');
    });
  });
});

