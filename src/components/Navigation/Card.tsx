import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Block, Project, DragTarget } from '../../types';
import { TagBadge } from './TagBadge';
import { Bot, Folder, FileText, Layers, CheckSquare, MoreVertical, Paperclip, Plus, ExternalLink, Check, ClipboardCopy, Lock } from 'lucide-react';
import { describeProjectAgentBadges, formatAgentEditBadgeLabel, hasUnseenAgentEdits } from '../../utils/agentEdits';
import { copyAgentReference } from '../../utils/agentReferences';
import { TASK_AGENT_LABELS, TASK_STATUS_LABELS } from '../../utils/taskBlocks';
import { getProjectColor } from '../../utils/projectColors';

interface CardProps {
  item: Block | Project;
  type: 'project' | 'block';
  isSelected: boolean;
  isCurrent?: boolean;
  isKeyboardFocused?: boolean;
  unseenAgentEditCount?: number;
  /** Project cards only: task blocks the agent created or changed and you have not read. */
  unseenTaskEditCount?: number;
  isBlocked?: boolean;
  onSelect: () => void;
  /** Project cards only: jump to the task list filtered on this project. */
  onOpenProjectTasks?: (projectId: string) => void;
  onContextMenu?: (e: React.MouseEvent, item: Block | Project, type: 'project' | 'block') => void;
  onAddChild?: (parentId: string) => void;
  onDuplicate?: (block: Block) => void;
  onDelete?: (block: Block) => void;
  onTagClick?: (tag: string) => void;
  dragTarget?: DragTarget | null;
  onDragStart?: (e: React.DragEvent, item: Block | Project, type: 'project' | 'block') => void;
  onDragOver?: (e: React.DragEvent, item: Block | Project, type: 'project' | 'block') => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent, targetItem: Block | Project, type: 'project' | 'block') => void;
}

interface ExtractedLink {
  title: string;
  url: string;
}

export const Card: React.FC<CardProps> = ({
  item,
  type,
  isSelected,
  isCurrent = false,
  isKeyboardFocused,
  unseenAgentEditCount = 0,
  unseenTaskEditCount = 0,
  isBlocked = false,
  onSelect,
  onOpenProjectTasks,
  onContextMenu,
  onAddChild,
  onTagClick,
  dragTarget,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDragEnd,
  onDrop
}) => {
  const [referenceCopied, setReferenceCopied] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);
  const isBlock = type === 'block';
  const block = isBlock ? (item as Block) : null;
  const project = !isBlock ? (item as Project) : null;
  const itemTags = isBlock ? block?.tags : project?.tags;
  const hasOwnAgentUpdate = Boolean(block && hasUnseenAgentEdits(block));
  const descendantAgentEditCount = block ? Math.max(0, unseenAgentEditCount - (hasOwnAgentUpdate ? 1 : 0)) : 0;
  const agentEditCount = unseenAgentEditCount;
  // On a project card the two kinds are told apart; a block card keeps one combined count.
  const projectBadges = describeProjectAgentBadges(agentEditCount, unseenTaskEditCount);
  const taskEditCount = project ? projectBadges.taskEditCount : 0;
  const hasAgentUpdates = project ? projectBadges.hasAgentUpdates : agentEditCount > 0;
  const agentBadgeLabel = project
    ? String(agentEditCount)
    : formatAgentEditBadgeLabel(hasOwnAgentUpdate, agentEditCount);
  const agentBadgeTitle = project
    ? projectBadges.blockBadgeTitle
    : hasOwnAgentUpdate && descendantAgentEditCount > 0
      ? `This block and ${descendantAgentEditCount} descendant block${descendantAgentEditCount === 1 ? '' : 's'} contain unread agent edits.`
      : hasOwnAgentUpdate
        ? 'This block contains agent edits you have not reviewed yet.'
        : `${descendantAgentEditCount} descendant block${descendantAgentEditCount === 1 ? '' : 's'} contain unread agent edits.`;

  useEffect(() => () => {
    if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
  }, []);

  const handleCopyReference = async (event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await copyAgentReference(item, type);
      setReferenceCopied(true);
      if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = window.setTimeout(() => setReferenceCopied(false), 1600);
    } catch (error) {
      console.error('Failed to copy agent reference.', error);
    }
  };

  const extractedLinks: ExtractedLink[] = useMemo(() => {
    const rawContent = isBlock ? block?.content : project?.description;
    const rawPlainText = isBlock ? block?.plainText : project?.description;
    if (!rawContent && !rawPlainText) return [];
    const linksMap = new Map<string, string>();

    if (rawContent) {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(rawContent, 'text/html');
        const anchors = doc.querySelectorAll('a[href]');
        anchors.forEach(a => {
          const href = a.getAttribute('href');
          if (href && href !== '#') {
            const text = a.textContent?.trim() || href;
            linksMap.set(href, text);
          }
        });
      } catch (err) {
        console.error(err);
      }
    }

    if (rawPlainText) {
      const urlRegex = /(https?:\/\/[^\s<]+)/g;
      const matches = rawPlainText.match(urlRegex);
      if (matches) {
        matches.forEach(url => {
          const cleanUrl = url.replace(/[.,;!?)]$/, '');
          if (!linksMap.has(cleanUrl)) {
            try {
              const parsed = new URL(cleanUrl);
              linksMap.set(cleanUrl, parsed.hostname + (parsed.pathname.length > 1 ? parsed.pathname.substring(0, 15) + '...' : ''));
            } catch {
              linksMap.set(cleanUrl, cleanUrl);
            }
          }
        });
      }
    }

    return Array.from(linksMap.entries()).map(([url, title]) => ({ url, title }));
  }, [isBlock, block, project]);

  let dropClass = '';
  if (dragTarget && dragTarget.itemId === item.id) {
    if (dragTarget.position === 'above') dropClass = 'drop-above';
    else if (dragTarget.position === 'below') dropClass = 'drop-below';
    else if (dragTarget.position === 'inside') dropClass = 'drop-inside';
  }

  return (
    <div
      className={`miller-card ${isSelected ? 'selected' : ''} ${isCurrent ? 'current' : ''} ${isKeyboardFocused ? 'focused-keyboard' : ''} ${hasAgentUpdates ? 'has-agent-updates' : ''} ${dropClass}`}
      data-item-id={item.id}
      onClick={onSelect}
      onContextMenu={(e) => onContextMenu && onContextMenu(e, item, type)}
      draggable
      onDragStart={(e) => onDragStart && onDragStart(e, item, type)}
      onDragOver={(e) => onDragOver && onDragOver(e, item, type)}
      onDragLeave={onDragLeave}
      onDragEnd={onDragEnd}
      onDrop={(e) => onDrop && onDrop(e, item, type)}
      aria-current={isCurrent ? 'page' : undefined}
    >
      <div className="card-title-row">
        <div className="card-title">
          {type === 'project' ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Folder size={16} color={getProjectColor(project?.color)} />
              {project?.title}
            </span>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {block?.kind === 'task' ? <CheckSquare size={15} color="#A78BFA" /> : <FileText size={15} color="var(--atmosphere-secondary)" />}
              {block?.title || 'Untitled block'}
            </span>
          )}
        </div>

        <div className="card-actions">
          <button
            className={`card-reference-button ${referenceCopied ? 'copied' : ''}`}
            onClick={handleCopyReference}
            title={referenceCopied ? 'Agent reference copied' : 'Copy agent reference with ID'}
            aria-label={referenceCopied ? 'Agent reference copied' : 'Copy agent reference with ID'}
          >
            {referenceCopied ? <Check size={13} /> : <ClipboardCopy size={13} />}
          </button>
          <button
            className="icon-btn-subtle"
            onClick={(e) => {
              e.stopPropagation();
              if (onContextMenu) onContextMenu(e, item, type);
            }}
            title="Opties"
            aria-label="Opties"
            style={{ background: 'none', border: 'none', color: 'var(--atmosphere-muted)', cursor: 'pointer', padding: 2 }}
          >
            <MoreVertical size={14} />
          </button>
        </div>
      </div>

      {isSelected && (
        <span className={`card-path-status ${isCurrent ? 'current' : ''}`}>
          <Check size={11} strokeWidth={2.5} />
          {isCurrent ? 'Open' : 'In pad'}
        </span>
      )}

      {block && block.plainText && (
        <div className="card-snippet">
          {block.plainText}
        </div>
      )}

      {project && project.description && (
        <div className="card-snippet">
          {project.description.replace(/<[^>]*>/g, ' ').trim()}
        </div>
      )}

      {itemTags && itemTags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6, marginBottom: 2 }}>
          {itemTags.slice(0, 3).map(tag => (
            <TagBadge key={tag} tag={tag} size="sm" onClick={onTagClick} />
          ))}
          {itemTags.length > 3 && (
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
              +{itemTags.length - 3}
            </span>
          )}
        </div>
      )}

      <div className="card-meta-row">
        {block?.kind === 'task' && block.task && (
          <>
            <span className="card-badge magenta"><CheckSquare size={11} /> {TASK_STATUS_LABELS[block.task.status]}</span>
            <span className="card-badge cyan"><Bot size={11} /> {block.task.agentTarget === 'custom' ? block.task.customAgentName : TASK_AGENT_LABELS[block.task.agentTarget]}</span>
          </>
        )}
        {isBlocked && (
          <span
            className="card-badge blocked"
            title="This task is blocked by pending dependencies."
            style={{
              background: 'rgba(245, 158, 11, 0.15)',
              color: '#F59E0B',
              border: '1px solid rgba(245, 158, 11, 0.3)'
            }}
          >
            <Lock size={10} /> Blocked
          </span>
        )}

        {agentEditCount > 0 && (
          <span className="card-badge agent-update" title={agentBadgeTitle}>
            <Bot size={11} /> {agentBadgeLabel}
          </span>
        )}

        {project && taskEditCount > 0 && (
          <button
            type="button"
            className="card-badge agent-update agent-task-update"
            title={projectBadges.taskBadgeTitle}
            onClick={e => {
              e.stopPropagation();
              onOpenProjectTasks?.(project.id);
            }}
          >
            <CheckSquare size={11} /> {taskEditCount}
          </button>
        )}

        {type === 'project' && Boolean((item as Project).scratchpad) && (
          <span className="card-badge agent-update" title="Project contains an active agent scratchpad">
            <Bot size={11} /> Context
          </span>
        )}

        {block && block.childCount > 0 && (
          <span className="card-badge cyan">
            <Layers size={11} /> {block.childCount}
          </span>
        )}

        {block && block.taskCount > 0 && (
          <span className="card-badge magenta">
            <CheckSquare size={11} /> {block.completedTaskCount}/{block.taskCount}
          </span>
        )}

        {block && block.attachmentCount > 0 && (
          <span className="card-badge cyan" title={`${block.attachmentCount} attachment${block.attachmentCount === 1 ? '' : 's'}`}>
            <Paperclip size={11} /> {block.attachmentCount}
          </span>
        )}

        {extractedLinks.slice(0, 2).map((link, idx) => (
          <a
            key={idx}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="card-badge link"
            title={`Open link: ${link.url}`}
          >
            <ExternalLink size={10} />
            <span>{link.title}</span>
          </a>
        ))}

        {isBlock && onAddChild && (
          <button
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 2,
              fontSize: '0.7rem'
            }}
            onClick={(e) => {
              e.stopPropagation();
              onAddChild(item.id);
            }}
            title="Add new child block"
          >
            <Plus size={12} /> Child
          </button>
        )}
      </div>
    </div>
  );
};
