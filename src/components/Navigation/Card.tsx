import React, { useMemo } from 'react';
import type { Block, Project, DragTarget } from '../../types';
import { TagBadge } from './TagBadge';
import { Folder, FileText, Layers, CheckSquare, MoreVertical, Paperclip, Plus, ExternalLink, Check } from 'lucide-react';

interface CardProps {
  item: Block | Project;
  type: 'project' | 'block';
  isSelected: boolean;
  isCurrent?: boolean;
  isKeyboardFocused?: boolean;
  onSelect: () => void;
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
  onSelect,
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
  const isBlock = type === 'block';
  const block = isBlock ? (item as Block) : null;
  const project = !isBlock ? (item as Project) : null;
  const itemTags = isBlock ? block?.tags : project?.tags;

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
      className={`miller-card ${isSelected ? 'selected' : ''} ${isCurrent ? 'current' : ''} ${isKeyboardFocused ? 'focused-keyboard' : ''} ${dropClass}`}
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
              <Folder size={16} color={project?.color || 'var(--atmosphere-color)'} />
              {project?.title}
            </span>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <FileText size={15} color="var(--atmosphere-secondary)" />
              {block?.title || 'Naamloos blok'}
            </span>
          )}
        </div>

        <button
          className="icon-btn-subtle"
          onClick={(e) => {
            e.stopPropagation();
            if (onContextMenu) onContextMenu(e, item, type);
          }}
          title="Opties"
          style={{ background: 'none', border: 'none', color: 'var(--atmosphere-muted)', cursor: 'pointer', padding: 2 }}
        >
          <MoreVertical size={14} />
        </button>
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
          <span className="card-badge cyan" title={`${block.attachmentCount} bijlage${block.attachmentCount === 1 ? '' : 'n'}`}>
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
            title="Nieuw onderliggend blok toevoegen"
          >
            <Plus size={12} /> Kind
          </button>
        )}
      </div>
    </div>
  );
};
