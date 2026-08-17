import React, { useState, useEffect, useRef } from 'react';
import { db } from '../../db/db';
import type { Block, Project, SearchResultItem, PathSegment } from '../../types';
import { TagBadge } from '../Navigation/TagBadge';
import { Search, FileText, ChevronRight, X, Tag as TagIcon } from 'lucide-react';
import { parseSearchQuery } from '../../utils/searchUtils';
import { sanitizeTags } from '../../utils/tagUtils';
import { rankBlocksLocally } from '../../utils/semanticSearch';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectResult: (blockId: string, projectId: string, pathSegmentIds: string[]) => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  onSelectResult
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRequestRef = useRef(0);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);

      // Load all distinct tags in DB for quick filter chips
      db.blocks.filter(b => !b.isTrash && Boolean(b.tags?.length)).toArray().then(blocks => {
        const tagSet = new Set<string>();
        blocks.forEach(b => sanitizeTags(b.tags).forEach(t => tagSet.add(t)));
        setAllTags(Array.from(tagSet).sort());
      }).catch(err => console.error(err));
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const performSearch = async () => {
      const requestId = ++searchRequestRef.current;
      const parsed = parseSearchQuery(query);
      let allBlocks: Block[];
      if (parsed.tags.length > 0) {
        const [firstTag, ...otherTags] = parsed.tags;
        allBlocks = await db.blocks.where('tags').equals(firstTag).and(block =>
          !block.isTrash && otherTags.every(tag => block.tags.includes(tag))
        ).toArray();
      } else {
        allBlocks = await db.blocks.filter(b => !b.isTrash).toArray();
      }
      const [allProjects, navigationBlocks] = await Promise.all([
        db.projects.toArray(),
        parsed.tags.length > 0 ? db.blocks.filter(b => !b.isTrash).toArray() : Promise.resolve(allBlocks)
      ]);
      if (requestId !== searchRequestRef.current) return;
      const projectMap = new Map<string, Project>(allProjects.map(p => [p.id, p]));
      const blockMap = new Map<string, Block>(navigationBlocks.map(b => [b.id, b]));

      const matchedResults: SearchResultItem[] = [];
      const rankedBlocks = parsed.text ? rankBlocksLocally(allBlocks, parsed.text).map(result => result.block) : allBlocks;

      for (const block of rankedBlocks) {
          const project = projectMap.get(block.projectId);
          const projectTitle = project?.title || 'Onbekend Project';

          const pathSegments: PathSegment[] = [];
          if (project) {
            pathSegments.push({ id: project.id, title: project.title, type: 'project' });
          }

          const ancestors: Block[] = [];
          let currParentId = block.parentId;
          while (currParentId) {
            const parentBlock = blockMap.get(currParentId);
            if (parentBlock) {
              ancestors.unshift(parentBlock);
              currParentId = parentBlock.parentId;
            } else {
              break;
            }
          }

          ancestors.forEach(anc => {
            pathSegments.push({ id: anc.id, title: anc.title, type: 'block' });
          });

          let snippet = block.plainText;
          const idx = parsed.text ? block.plainText.toLowerCase().indexOf(parsed.text) : -1;
          if (idx !== -1) {
            const start = Math.max(0, idx - 40);
            const end = Math.min(block.plainText.length, idx + parsed.text.length + 60);
            snippet = (start > 0 ? '...' : '') + block.plainText.substring(start, end) + (end < block.plainText.length ? '...' : '');
          } else {
            snippet = snippet.substring(0, 100);
          }

        matchedResults.push({
            block,
            projectTitle,
            pathSegments,
            snippet
        });
      }

      if (requestId === searchRequestRef.current) {
        setResults(matchedResults.slice(0, 20));
        setSelectedIndex(0);
      }
    };

    const timer = setTimeout(performSearch, 150);
    return () => {
      clearTimeout(timer);
      searchRequestRef.current += 1;
    };
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        const item = results[selectedIndex];
        const pathSegmentIds = item.pathSegments.map(s => s.id);
        onSelectResult(item.block.id, item.block.projectId, pathSegmentIds);
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(7, 10, 18, 0.8)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
        zIndex: 100
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '640px',
          maxWidth: '90vw',
          background: 'var(--bg-surface)',
          backdropFilter: 'var(--glass-backdrop)',
          border: '1px solid var(--border-neon-cyan)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 0 30px rgba(0, 240, 255, 0.2)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: 'rgba(10, 15, 26, 0.8)'
          }}
        >
          <Search size={20} color="#00F0FF" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Zoek lokaal op woorden, betekenis of tags... (Ctrl + K)"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: '1rem',
              outline: 'none'
            }}
          />
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        {allTags.length > 0 && (
          <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', background: 'rgba(0,0,0,0.1)' }}>
            <TagIcon size={12} color="var(--text-muted)" />
            <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>Tags:</span>
            {allTags.map(tag => (
              <TagBadge
                key={tag}
                tag={tag}
                size="sm"
                active={parseSearchQuery(query).tags.includes(tag)}
                onClick={(t) => {
                  const parsed = parseSearchQuery(query);
                  const nextTags = parsed.tags.includes(t) ? parsed.tags.filter(tag => tag !== t) : [...parsed.tags, t];
                  setQuery([parsed.text, ...nextTags.map(tag => `#${tag}`)].filter(Boolean).join(' '));
                }}
              />
            ))}
          </div>
        )}

        <div style={{ maxHeight: '420px', overflowY: 'auto', padding: '8px' }}>
          {!query.trim() ? (
            <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Zoek lokaal op woorden of verwante begrippen, of klik hierboven op een tag.
            </div>
          ) : results.length === 0 ? (
            <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Geen resultaten gevonden voor &quot;{query}&quot;.
            </div>
          ) : (
            results.map((res, index) => {
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={res.block.id}
                  onClick={() => {
                    const pathSegmentIds = res.pathSegments.map(s => s.id);
                    onSelectResult(res.block.id, res.block.projectId, pathSegmentIds);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  style={{
                    padding: '12px 16px',
                    borderRadius: 'var(--radius-sm)',
                    background: isSelected ? 'var(--bg-card-active)' : 'transparent',
                    border: isSelected ? '1px solid var(--neon-cyan)' : '1px solid transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    marginBottom: 4,
                    transition: 'all 0.15s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <FileText size={15} color="#38BDF8" />
                      {res.block.title}
                    </div>
                    {res.block.tags && res.block.tags.length > 0 && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        {res.block.tags.map(tag => (
                          <TagBadge key={tag} tag={tag} size="sm" onClick={() => setQuery(`#${tag}`)} />
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {res.pathSegments.map((seg, idx) => (
                      <React.Fragment key={seg.id || idx}>
                        {idx > 0 && <ChevronRight size={12} color="#64748B" />}
                        <span>{seg.title}</span>
                      </React.Fragment>
                    ))}
                  </div>

                  <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    {res.snippet}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div
          style={{
            padding: '10px 20px',
            borderTop: '1px solid var(--border-subtle)',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(10, 15, 26, 0.8)'
          }}
        >
          <span>Gebruik <kbd>↑</kbd> <kbd>↓</kbd> om te navigeren, <kbd>Enter</kbd> om te openen</span>
          <span><kbd>Esc</kbd> sluiten</span>
        </div>
      </div>
    </div>
  );
};
