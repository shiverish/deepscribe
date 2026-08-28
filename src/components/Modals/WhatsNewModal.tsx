import React, { useState, useEffect } from 'react';
import { Sparkles, X, ChevronDown, ChevronRight, Check, Zap, Wrench, Calendar } from 'lucide-react';
import { CHANGELOG_ENTRIES, CURRENT_APP_VERSION, type ReleaseEntry, type ChangelogCategory } from '../../data/changelog';

interface WhatsNewModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAppVersion?: string;
}

export const WhatsNewModal: React.FC<WhatsNewModalProps> = ({
  isOpen,
  onClose,
  currentAppVersion = CURRENT_APP_VERSION
}) => {
  const [expandedVersions, setExpandedVersions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const latestRelease = CHANGELOG_ENTRIES[0] || null;
  const previousReleases = CHANGELOG_ENTRIES.slice(1);

  const toggleVersion = (version: string) => {
    setExpandedVersions(prev => ({
      ...prev,
      [version]: !prev[version]
    }));
  };

  const renderCategoryBadge = (type: ChangelogCategory) => {
    switch (type) {
      case 'feature':
        return (
          <span
            style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              padding: '2px 7px',
              borderRadius: '10px',
              background: 'rgba(16, 185, 129, 0.16)',
              color: '#34D399',
              border: '1px solid rgba(52, 211, 153, 0.35)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            <Sparkles size={10} /> Feature
          </span>
        );
      case 'improvement':
        return (
          <span
            style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              padding: '2px 7px',
              borderRadius: '10px',
              background: 'rgba(59, 130, 246, 0.16)',
              color: '#60A5FA',
              border: '1px solid rgba(59, 130, 246, 0.35)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            <Zap size={10} /> Improvement
          </span>
        );
      case 'fix':
      default:
        return (
          <span
            style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              padding: '2px 7px',
              borderRadius: '10px',
              background: 'rgba(245, 158, 11, 0.16)',
              color: '#FBBF24',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            <Wrench size={10} /> Fix
          </span>
        );
    }
  };

  const renderReleaseItems = (release: ReleaseEntry) => {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {release.items.map((item, index) => (
          <div
            key={index}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              padding: '8px 12px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.04)'
            }}
          >
            <div style={{ marginTop: '2px' }}>
              {renderCategoryBadge(item.type)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary, #FAF6EE)', lineHeight: 1.3 }}>
                {item.text}
              </div>
              {item.detail && (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #a8a29e)', marginTop: '3px', lineHeight: 1.4 }}>
                  {item.detail}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(7, 10, 18, 0.82)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px'
      }}
    >
      <div
        className="modal-container whats-new-modal"
        onClick={e => e.stopPropagation()}
        style={{
          width: '680px',
          maxWidth: '92vw',
          maxHeight: '85vh',
          background: 'var(--bg-surface, #1e1d1b)',
          backdropFilter: 'var(--glass-backdrop, blur(16px))',
          border: '1px solid var(--border-neon-cyan, rgba(59, 130, 246, 0.4))',
          borderRadius: 'var(--radius-lg, 12px)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6), 0 0 30px rgba(var(--atmosphere-rgb, 59, 130, 246), 0.2)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Modal Header */}
        <div
          className="modal-header"
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255, 255, 255, 0.02)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                color: '#34D399',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Sparkles size={18} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary, #FAF6EE)' }}>
                  What's New in DeepScribe
                </h2>
                <span
                  style={{
                    fontSize: '0.72rem',
                    color: 'var(--text-secondary, #a8a29e)',
                    padding: '2px 6px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.1))',
                    borderRadius: '4px',
                    fontWeight: 500
                  }}
                >
                  v{currentAppVersion}
                </span>
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary, #a8a29e)', marginTop: '2px' }}>
                Explore recent highlights, features, and performance improvements
              </div>
            </div>
          </div>

          <button
            className="icon-button"
            onClick={onClose}
            title="Close (Esc)"
            aria-label="Close What's New modal"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary, #a8a29e)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div
          className="modal-body"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px'
          }}
        >
          {/* Latest Release Spotlight */}
          {latestRelease && (
            <div
              style={{
                borderRadius: '10px',
                border: '1px solid var(--border-neon-cyan, rgba(59, 130, 246, 0.35))',
                background: 'linear-gradient(180deg, rgba(59, 130, 246, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%)',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: '6px',
                      background: 'rgba(16, 185, 129, 0.2)',
                      color: '#10B981',
                      border: '1px solid rgba(16, 185, 129, 0.4)'
                    }}
                  >
                    LATEST • v{latestRelease.version}
                  </span>
                  <span style={{ fontSize: '0.96rem', fontWeight: 600, color: 'var(--text-primary, #FAF6EE)' }}>
                    {latestRelease.title}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--text-secondary, #a8a29e)' }}>
                  <Calendar size={12} />
                  <span>{latestRelease.date}</span>
                </div>
              </div>

              {latestRelease.summary && (
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary, #d6d3d1)', lineHeight: 1.45 }}>
                  {latestRelease.summary}
                </div>
              )}

              {renderReleaseItems(latestRelease)}
            </div>
          )}

          {/* Previous Releases Accordion */}
          {previousReleases.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div
                style={{
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--text-secondary, #a8a29e)',
                  paddingLeft: '2px'
                }}
              >
                Previous Releases
              </div>

              {previousReleases.map(release => {
                const isExpanded = !!expandedVersions[release.version];

                return (
                  <div
                    key={release.version}
                    style={{
                      borderRadius: '8px',
                      border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
                      background: 'rgba(0, 0, 0, 0.15)',
                      overflow: 'hidden'
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleVersion(release.version)}
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        background: isExpanded ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
                        border: 'none',
                        color: 'inherit',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        textAlign: 'left'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {isExpanded ? <ChevronDown size={16} color="var(--text-secondary, #a8a29e)" /> : <ChevronRight size={16} color="var(--text-secondary, #a8a29e)" />}
                        <div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary, #FAF6EE)' }}>
                            v{release.version} — {release.title}
                          </div>
                          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary, #a8a29e)', marginTop: '2px' }}>
                            {release.date}
                          </div>
                        </div>
                      </div>

                      <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #a8a29e)' }}>
                        {release.items.length} {release.items.length === 1 ? 'update' : 'updates'}
                      </span>
                    </button>

                    {isExpanded && (
                      <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        {release.summary && (
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #a8a29e)', marginBottom: '10px' }}>
                            {release.summary}
                          </div>
                        )}
                        {renderReleaseItems(release)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          className="modal-footer"
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
            background: 'rgba(255, 255, 255, 0.02)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #a8a29e)' }}>
            DeepScribe is updated regularly with new features and fixes.
          </div>

          <button
            type="button"
            className="primary-button"
            onClick={onClose}
            style={{
              padding: '6px 18px',
              fontSize: '0.82rem',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--accent-color, #3b82f6)',
              borderColor: 'var(--accent-color, #3b82f6)',
              color: '#ffffff',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Check size={14} />
            <span>Got it</span>
          </button>
        </div>
      </div>
    </div>
  );
};
