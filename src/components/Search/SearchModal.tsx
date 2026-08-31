import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db } from '../../db/db';
import type { Block, SearchResultItem } from '../../types';
import { TagBadge } from '../Navigation/TagBadge';
import { Search, FileText, ChevronRight, X, Tag as TagIcon, CheckSquare, FolderOpen } from 'lucide-react';
import { parseSearchQuery, rankTopTags, type TagCount } from '../../utils/searchUtils';
import { sanitizeTags } from '../../utils/tagUtils';
import { buildSearchResults } from '../../utils/searchResults';
import { formatTaskHumanId } from '../../utils/taskBlocks';
import { ClearSearchButton } from './ClearSearchButton';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectResult: (blockId: string, projectId: string, pathSegmentIds: string[]) => void;
  onSelectProject: (projectId: string) => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  onSelectResult,
  onSelectProject
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [tagCounts, setTagCounts] = useState<TagCount[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRequestRef = useRef(0);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);

      // Load tags with occurrence counts for top tags ranking
      db.blocks.filter(b => !b.isTrash && Boolean(b.tags?.length)).toArray().then(blocks => {
        const countMap = new Map<string, number>();
        blocks.forEach(b => {
          sanitizeTags(b.tags).forEach(t => {
            countMap.set(t, (countMap.get(t) ?? 0) + 1);
          });
        });
        const tagsWithCounts: TagCount[] = Array.from(countMap.entries()).map(([tag, count]) => ({ tag, count }));
        setTagCounts(tagsWithCounts);
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
      const matchedResults = buildSearchResults({
        blocks: allBlocks,
        projects: allProjects,
        navigationBlocks,
        text: parsed.text,
        tags: parsed.tags
      });

      if (requestId === searchRequestRef.current) {
        setResults(matchedResults);
        setSelectedIndex(0);
      }
    };

    const timer = setTimeout(performSearch, 150);
    return () => {
      clearTimeout(timer);
      searchRequestRef.current += 1;
    };
  }, [query]);

  const openResult = (item: SearchResultItem) => {
    if (item.kind === 'project') onSelectProject(item.project.id);
    else onSelectResult(item.block.id, item.block.projectId, item.pathSegments.map(segment => segment.id));
    onClose();
  };

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
        openResult(results[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      if (query) {
        clearQuery();
      } else {
        onClose();
      }
    }
  };

  // Tags live inside the query string, so emptying it drops the active tag
  // filters along with the text.
  const clearQuery = () => {
    setQuery('');
    inputRef.current?.focus();
  };

  const activeTags = useMemo(() => parseSearchQuery(query).tags, [query]);
  const tagCountMap = useMemo(() => new Map(tagCounts.map(tc => [tc.tag, tc.count])), [tagCounts]);
  const visibleTags = useMemo(() => rankTopTags(tagCounts, activeTags, 10), [tagCounts, activeTags]);

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
          border: '1px solid var(--neon-cyan)',
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
            placeholder="Search locally by words, meaning, or tags... (Ctrl + Shift + F)"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: '1rem',
              outline: 'none'
            }}
          />
          <ClearSearchButton
            visible={query.length > 0}
            onClear={clearQuery}
            size={16}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}
          />
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        {visibleTags.length > 0 && (
          <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', background: 'rgba(0,0,0,0.1)' }}>
            <TagIcon size={12} color="var(--text-muted)" />
            <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>Top Tags:</span>
            {visibleTags.map(tag => {
              const count = tagCountMap.get(tag) ?? 1;
              const isActive = activeTags.includes(tag);
              return (
                <div key={tag} title={`${tag} (${count} ${count === 1 ? 'block' : 'blocks'})`}>
                  <TagBadge
                    tag={tag}
                    size="sm"
                    active={isActive}
                    onClick={(t) => {
                      const parsed = parseSearchQuery(query);
                      const nextTags = parsed.tags.includes(t) ? parsed.tags.filter(tagItem => tagItem !== t) : [...parsed.tags, t];
                      setQuery([parsed.text, ...nextTags.map(tagItem => `#${tagItem}`)].filter(Boolean).join(' '));
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}

        <div style={{ maxHeight: '420px', overflowY: 'auto', padding: '8px' }}>
          {!query.trim() ? (
            <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Search locally for words or related concepts, or click a tag above.
            </div>
          ) : results.length === 0 ? (
            <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No results found for &quot;{query}&quot;.
            </div>
          ) : (
            results.map((res, index) => {
              const isSelected = index === selectedIndex;
              if (res.kind === 'project') {
                return (
                  <div
                    key={res.project.id}
                    onClick={() => openResult(res)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    style={{
                      padding: '12px 16px',
                      borderRadius: 'var(--radius-sm)',
                      background: isSelected ? 'var(--bg-card-active)' : 'transparent',
                      border: isSelected ? '1px solid var(--neon-cyan)' : '1px solid transparent',
                      borderLeft: `3px solid ${res.project.color || 'var(--accent-color)'}`,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      marginBottom: 4,
                      transition: 'all 0.15s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      <FolderOpen size={15} color={res.project.color || '#A78BFA'} />
                      <span>{res.project.title}</span>
                      <span style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Project
                      </span>
                    </div>
                    {res.heading && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{res.heading}</div>
                    )}
                    <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      {res.snippet}
                    </div>
                  </div>
                );
              }
              return (
                <div
                  key={res.block.id}
                  onClick={() => openResult(res)}
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
                      {res.block.kind === 'task' ? (
                        <CheckSquare size={15} color="#A78BFA" />
                      ) : (
                        <FileText size={15} color="#38BDF8" />
                      )}
                      {res.block.kind === 'task' && formatTaskHumanId(res.block.task?.taskNumber) && (
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            color: '#A78BFA',
                            background: 'rgba(167, 139, 250, 0.15)',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            border: '1px solid rgba(167, 139, 250, 0.3)',
                            letterSpacing: '0.02em'
                          }}
                        >
                          {formatTaskHumanId(res.block.task?.taskNumber)}
                        </span>
                      )}
                      <span>{res.block.title}</span>
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
                    {res.heading && (
                      <>
                        <ChevronRight size={12} color="#64748B" />
                        <span style={{ fontStyle: 'italic' }}>{res.heading}</span>
                      </>
                    )}
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
          <span>Use <kbd>↑</kbd> <kbd>↓</kbd> to navigate, <kbd>Enter</kbd> to open</span>
          <span><kbd>Esc</kbd> {query ? 'clear' : 'close'}</span>
        </div>
      </div>
    </div>
  );
};
