import { db } from '../db/db';
import type { Attachment, Block } from '../types';
import { createId } from '../db/operations';
import { TASK_INBOX_PROJECT_ID } from './taskBlocks';

export interface CreateAnnotationPayload {
  projectId?: string;
  parentId?: string | null;
  title?: string;
  promptText?: string;
  imageBase64?: string;
  kind?: 'task' | 'block';
  isReadyTask?: boolean;
}

export async function createAnnotationBlock(payload: CreateAnnotationPayload): Promise<{ block: Block; attachment?: Attachment }> {
  const projectId = payload.projectId || TASK_INBOX_PROJECT_ID;
  const blockId = createId('block');
  const now = Date.now();
  const timestampStr = new Date(now).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const defaultTitle = payload.promptText
    ? (payload.promptText.length > 50 ? payload.promptText.substring(0, 47) + '...' : payload.promptText)
    : `Screen Annotation (${timestampStr})`;

  const title = payload.title?.trim() || defaultTitle;
  const isTask = payload.kind === 'task';

  let attachment: Attachment | undefined;
  let imageHtml = '';

  if (payload.imageBase64 && typeof window !== 'undefined' && window.electronAPI?.importAttachment) {
    const fileName = `screenshot-${now}.png`;
    try {
      const result = await window.electronAPI.importAttachment({
        projectId,
        blockId,
        fileName,
        base64: payload.imageBase64
      });

      const attachmentId = createId('attachment');
      attachment = {
        id: attachmentId,
        blockId,
        fileName,
        fileType: 'image/png',
        fileSize: Math.round((payload.imageBase64.length * 3) / 4),
        localPath: result.localPath,
        createdAt: now
      };

      await db.attachments.add(attachment);
      imageHtml = `<p><em>Annotated screenshot:</em></p>`;
    } catch (err) {
      console.warn('Failed to save screenshot attachment:', err);
    }
  }

  let contentHtml = '';
  let plainText = '';

  if (isTask) {
    contentHtml = `
      <h3>Goal</h3>
      <p>${payload.promptText || title}</p>
      ${imageHtml}
      <h3>Context</h3>
      <p>Captured via DeepScribe Screen Annotation on ${new Date(now).toLocaleString('en-US')}.</p>
      <h3>Action items</h3>
      <ul data-type="taskList">
        <li data-type="taskItem" data-checked="false"><p>Review and process the annotated items in the screenshot.</p></li>
      </ul>
    `.trim();
    plainText = `Goal\n${payload.promptText || title}\n\nContext\nCaptured via DeepScribe Screen Annotation.\n\nAction items\n[ ] Review and process the annotated items.`;
  } else {
    contentHtml = `
      <p><strong>${payload.promptText || title}</strong></p>
      ${imageHtml}
      <p>Captured via DeepScribe Screen Annotation on ${new Date(now).toLocaleString('en-US')}.</p>
    `.trim();
    plainText = `${payload.promptText || title}\n\nCaptured via DeepScribe Screen Annotation.`;
  }

  const block: Block = {
    id: blockId,
    projectId,
    parentId: payload.parentId || null,
    title,
    content: contentHtml,
    plainText,
    order: now,
    childCount: 0,
    taskCount: isTask ? 1 : 0,
    completedTaskCount: 0,
    attachmentCount: attachment ? 1 : 0,
    isTrash: false,
    tags: ['screenshot', 'annotation', ...(isTask ? ['todo'] : [])],
    kind: isTask ? 'task' : undefined,
    task: isTask
      ? {
          status: payload.isReadyTask ? 'ready' : 'inbox',
          agentTarget: 'any',
          position: now,
          creator: { type: 'user' }
        }
      : undefined,
    createdAt: now,
    updatedAt: now
  };

  await db.blocks.add(block);

  // Record Activity
  try {
    await db.activities.add({
      id: crypto.randomUUID(),
      projectId,
      blockId,
      source: 'user',
      action: isTask ? 'create_task' : 'create_block',
      summary: `Created new ${isTask ? 'task' : 'annotation'}: “${title}”`,
      createdAt: now
    });
  } catch {}

  return { block, attachment };
}
