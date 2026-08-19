import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Block, BlockRevision } from '../../types';
import { getBlockRevisions, restoreBlockRevision } from '../../db/revisions';
import { diffLines, diffTags, htmlToDiffableText, computeDiffSummary, type LineDiff } from '../../utils/diffUtils';
import { History, RotateCcw, X, User, Bot, Check, Clock } from 'lucide-react';

interface VersionHistoryModalProps {
  isOpen: boolean;
  block: Block | null;
  onClose: () => void;
  onRestored?: (restoredBlock: Block) => void;
}

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({
  isOpen,
  block,
  onClose,
  onRestored
}) => {
  const [revisions, setRevisions] = useState<BlockRevision[]>([]);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState<'with_current' | 'with_previous'>('with_current');
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreSuccess, setRestoreSuccess] = useState(false);

  const loadRevisions = useCallback(async () => {
    if (!block) return;
    const history = await getBlockRevisions(block.id);
    setRevisions(history);
    if (history.length > 0) {
      setSelectedRevisionId(prev => (prev && history.some(r => r.id === prev) ? prev : history[0].id));
    } else {
      setSelectedRevisionId(null);
    }
  }, [block]);

  useEffect(() => {
    if (!isOpen || !block) return;
    loadRevisions();
    setRestoreSuccess(false);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, block, loadRevisions, onClose]);

  const selectedRevision = useMemo(() => {
    return revisions.find(r => r.id === selectedRevisionId) || revisions[0] || null;
  }, [revisions, selectedRevisionId]);

  const previousRevision = useMemo(() => {
    if (!selectedRevision) return null;
    const currentIndex = revisions.findIndex(r => r.id === selectedRevision.id);
    if (currentIndex >= 0 && currentIndex + 1 < revisions.length) {
      return revisions[currentIndex + 1];
    }
    return null;
  }, [revisions, selectedRevision]);

  // Determine base for comparison
  const comparisonBase = useMemo(() => {
    if (compareMode === 'with_previous' && previousRevision) {
      return {
        title: previousRevision.title,
        content: previousRevision.content,
        plainText: previousRevision.plainText,
        tags: previousRevision.tags,
        label: `Version from ${new Date(previousRevision.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
      };
    }
    // Default: compare selected revision with current live block
    return block ? {
      title: block.title,
      content: block.content,
      plainText: block.plainText,
      tags: block.tags,
      label: 'Current live version'
    } : null;
  }, [compareMode, previousRevision, block]);

  // Diffs computation
  const lineDiffs = useMemo<LineDiff[]>(() => {
    if (!selectedRevision || !comparisonBase) return [];
    const oldText = htmlToDiffableText(selectedRevision.content);
    const newText = htmlToDiffableText(comparisonBase.content);
    return diffLines(oldText, newText);
  }, [selectedRevision, comparisonBase]);

  const tagDiff = useMemo(() => {
    if (!selectedRevision || !comparisonBase) return { added: [], removed: [], unchanged: [] };
    return diffTags(selectedRevision.tags, comparisonBase.tags);
  }, [selectedRevision, comparisonBase]);

  const summary = useMemo(() => {
    if (!selectedRevision || !comparisonBase) return null;
    const oldText = htmlToDiffableText(selectedRevision.content);
    const newText = htmlToDiffableText(comparisonBase.content);
    return computeDiffSummary(oldText, newText);
  }, [selectedRevision, comparisonBase]);

  const handleRestore = async () => {
    if (!selectedRevision || isRestoring) return;
    const dateStr = new Date(selectedRevision.createdAt).toLocaleString('en-US');
    if (!window.confirm(`Restore this block to the version from ${dateStr}?`)) {
      return;
    }

    setIsRestoring(true);
    try {
      const restored = await restoreBlockRevision(selectedRevision.id);
      setRestoreSuccess(true);
      await loadRevisions();
      if (onRestored) onRestored(restored);
      setTimeout(() => {
        setRestoreSuccess(false);
      }, 2500);
    } catch (err) {
      console.error(err);
      alert('Failed to restore the version.');
    } finally {
      setIsRestoring(false);
    }
  };

  const formatRelativeTime = (timestamp: number) => {
    const deltaSeconds = Math.floor((Date.now() - timestamp) / 1000);
    if (deltaSeconds < 60) return 'Just now';
    if (deltaSeconds < 3600) return `${Math.floor(deltaSeconds / 60)}m ago`;
    if (deltaSeconds < 86400) return `${Math.floor(deltaSeconds / 3600)}h ago`;
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const renderSourceBadge = (source: string) => {
    switch (source) {
      case 'agent':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: '0.7rem',
            padding: '2px 6px',
            borderRadius: '4px',
            background: 'rgba(56, 189, 248, 0.12)',
            color: '#38BDF8',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            fontWeight: 500
          }}>
            <Bot size={11} /> AI-Agent
          </span>
        );
      case 'restore':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: '0.7rem',
            padding: '2px 6px',
            borderRadius: '4px',
            background: 'rgba(52, 211, 153, 0.12)',
            color: '#34D399',
            border: '1px solid rgba(52, 211, 153, 0.25)',
            fontWeight: 500
          }}>
            <RotateCcw size={11} /> Restored
          </span>
        );
      case 'user':
      default:
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: '0.7rem',
            padding: '2px 6px',
            borderRadius: '4px',
            background: 'rgba(235, 222, 195, 0.12)',
            color: 'var(--atmosphere-color, #EBDEC3)',
            border: '1px solid rgba(235, 222, 195, 0.25)',
            fontWeight: 500
          }}>
            <User size={11} /> Developer
          </span>
        );
    }
  };

  if (!isOpen || !block) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(7, 10, 18, 0.82)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 110,
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '980px',
          maxWidth: '95vw',
          height: '82vh',
          maxHeight: '800px',
          background: 'var(--bg-surface, #1e1e1e)',
          border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.1))',
          borderRadius: '12px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.1))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255, 255, 255, 0.02)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <History size={19} color="var(--atmosphere-color, #EBDEC3)" />
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary, #fff)' }}>
                Version History & Diffs
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #888)' }}>
                Block: {block.title}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted, #888)',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 4
            }}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body: Two Column Split */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left Column: Revision Timeline */}
          <div
            style={{
              width: '320px',
              borderRight: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
              background: 'rgba(0, 0, 0, 0.15)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                padding: '10px 14px',
                borderBottom: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.06))',
                fontSize: '0.75rem',
                color: 'var(--text-muted, #888)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}
            >
              History ({revisions.length} {revisions.length === 1 ? 'version' : 'versions'})
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
              {revisions.length === 0 ? (
                <div style={{ padding: '30px 15px', textAlign: 'center', color: 'var(--text-muted, #888)', fontSize: '0.8rem' }}>
                  No saved revisions for this block yet. Revisions are created automatically when changes are made.
                </div>
              ) : (
                revisions.map(rev => {
                  const isSelected = rev.id === selectedRevisionId;

                  return (
                    <div
                      key={rev.id}
                      onClick={() => setSelectedRevisionId(rev.id)}
                      style={{
                        padding: '10px 12px',
                        marginBottom: '6px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        background: isSelected
                          ? 'var(--selected-card-color, rgba(255, 255, 255, 0.08))'
                          : 'rgba(255, 255, 255, 0.02)',
                        border: isSelected
                          ? '1px solid var(--accent-color, #3b82f6)'
                          : '1px solid transparent',
                        transition: 'background 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        {renderSourceBadge(rev.source)}
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #888)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <Clock size={10} />
                          {formatRelativeTime(rev.createdAt)}
                        </span>
                      </div>

                      <div style={{
                        fontSize: '0.825rem',
                        fontWeight: isSelected ? 600 : 500,
                        color: 'var(--text-primary, #fff)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        marginBottom: 2
                      }}>
                          {rev.title || 'Untitled'}
                      </div>

                      {rev.summary && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #888)', fontStyle: 'italic', marginBottom: 4 }}>
                          {rev.summary}
                        </div>
                      )}

                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #888)', display: 'flex', gap: 8, marginTop: 4 }}>
                        <span>{new Date(rev.createdAt).toLocaleDateString('nl-NL')}</span>
                        <span>{new Date(rev.createdAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Diff Preview & Controls */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {selectedRevision ? (
              <>
                {/* Diff Controls & Compare Mode Bar */}
                <div
                  style={{
                    padding: '10px 16px',
                    borderBottom: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
                    background: 'rgba(255, 255, 255, 0.01)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--text-muted, #888)' }}>Compare with:</span>
                    <div style={{ display: 'inline-flex', background: 'rgba(0, 0, 0, 0.25)', borderRadius: '6px', padding: '2px', border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))' }}>
                      <button
                        type="button"
                        onClick={() => setCompareMode('with_current')}
                        style={{
                          background: compareMode === 'with_current' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                          border: 'none',
                          color: compareMode === 'with_current' ? 'var(--text-primary, #fff)' : 'var(--text-muted, #888)',
                          fontSize: '0.75rem',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                    Current version
                      </button>
                      <button
                        type="button"
                        onClick={() => setCompareMode('with_previous')}
                        disabled={!previousRevision}
                        style={{
                          background: compareMode === 'with_previous' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                          border: 'none',
                          color: compareMode === 'with_previous' ? 'var(--text-primary, #fff)' : 'var(--text-muted, #888)',
                          fontSize: '0.75rem',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          cursor: previousRevision ? 'pointer' : 'not-allowed',
                          opacity: previousRevision ? 1 : 0.4
                        }}
                      >
                    Previous version
                      </button>
                    </div>
                  </div>

                  {summary && (
                    <div style={{ fontSize: '0.75rem', color: summary.hasChanges ? 'var(--text-secondary, #aaa)' : 'var(--text-muted, #888)' }}>
                      Diff delta: <strong style={{ color: summary.hasChanges ? 'var(--atmosphere-color, #EBDEC3)' : 'inherit' }}>{summary.label}</strong>
                    </div>
                  )}
                </div>

                {/* Diff Content View */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                  {/* Title Diff */}
                  {comparisonBase && selectedRevision.title !== comparisonBase.title && (
                    <div
                      style={{
                        padding: '10px 14px',
                        marginBottom: '14px',
                        borderRadius: '8px',
                        background: 'rgba(0, 0, 0, 0.2)',
                        border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))'
                      }}
                    >
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #888)', textTransform: 'uppercase', marginBottom: 4 }}>
                        Title change
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem' }}>
                        <div style={{ color: '#F87171', textDecoration: 'line-through' }}>
                          - {selectedRevision.title}
                        </div>
                        <div style={{ color: '#4ADE80' }}>
                          + {comparisonBase.title}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tag Diff */}
                  {(tagDiff.added.length > 0 || tagDiff.removed.length > 0) && (
                    <div
                      style={{
                        padding: '10px 14px',
                        marginBottom: '14px',
                        borderRadius: '8px',
                        background: 'rgba(0, 0, 0, 0.2)',
                        border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))'
                      }}
                    >
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #888)', textTransform: 'uppercase', marginBottom: 6 }}>
                        Changed tags
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {tagDiff.removed.map(tag => (
                          <span
                            key={tag}
                            style={{
                              fontSize: '0.72rem',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              background: 'rgba(239, 68, 68, 0.15)',
                              color: '#F87171',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              textDecoration: 'line-through'
                            }}
                          >
                            #{tag}
                          </span>
                        ))}
                        {tagDiff.added.map(tag => (
                          <span
                            key={tag}
                            style={{
                              fontSize: '0.72rem',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              background: 'rgba(34, 197, 94, 0.15)',
                              color: '#4ADE80',
                              border: '1px solid rgba(34, 197, 94, 0.3)'
                            }}
                          >
                            +#{tag}
                          </span>
                        ))}
                        {tagDiff.unchanged.map(tag => (
                          <span
                            key={tag}
                            style={{
                              fontSize: '0.72rem',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              background: 'rgba(255, 255, 255, 0.05)',
                              color: 'var(--text-muted, #888)'
                            }}
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Content Lines Diff */}
                  <div
                    style={{
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                      fontSize: '0.825rem',
                      lineHeight: '1.6',
                      borderRadius: '8px',
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
                      overflow: 'hidden'
                    }}
                  >
                    {lineDiffs.length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted, #888)' }}>
                        No text differences between the compared versions.
                      </div>
                    ) : (
                      lineDiffs.map((item, idx) => {
                        const isAdded = item.type === 'added';
                        const isRemoved = item.type === 'removed';

                        return (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              background: isAdded
                                ? 'rgba(34, 197, 94, 0.12)'
                                : isRemoved
                                  ? 'rgba(239, 68, 68, 0.12)'
                                  : 'transparent',
                              color: isAdded
                                ? '#4ADE80'
                                : isRemoved
                                  ? '#F87171'
                                  : 'var(--text-secondary, #ddd)',
                              borderLeft: isAdded
                                ? '3px solid #22c55e'
                                : isRemoved
                                  ? '3px solid #ef4444'
                                  : '3px solid transparent',
                              padding: '2px 8px'
                            }}
                          >
                            <span
                              style={{
                                width: '24px',
                                userSelect: 'none',
                                opacity: 0.5,
                                textAlign: 'right',
                                paddingRight: '8px'
                              }}
                            >
                              {isAdded ? '+' : isRemoved ? '-' : ' '}
                            </span>
                            <span style={{ flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                              {item.line || '\u00A0'}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Footer Action Bar */}
                <div
                  style={{
                    padding: '12px 20px',
                    borderTop: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
                    background: 'rgba(255, 255, 255, 0.02)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #888)' }}>
                    {restoreSuccess ? (
                      <span style={{ color: '#4ADE80', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Check size={14} /> Version restored successfully!
                      </span>
                    ) : (
                      <span>Select a version to inspect or restore earlier content.</span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button
                      type="button"
                      onClick={onClose}
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.15))',
                        color: 'var(--text-secondary, #ccc)',
                        padding: '6px 14px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.8rem'
                      }}
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={handleRestore}
                      disabled={isRestoring}
                      style={{
                        background: 'var(--accent-color, #3b82f6)',
                        border: 'none',
                        color: '#fff',
                        padding: '6px 14px',
                        borderRadius: '6px',
                        cursor: isRestoring ? 'wait' : 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: 500,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6
                      }}
                    >
                      <RotateCcw size={13} />
                      {isRestoring ? 'Restoring...' : 'Restore this version'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted, #888)', fontSize: '0.85rem' }}>
                No version selected.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
