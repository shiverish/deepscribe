import React, { useState, useEffect } from 'react';
import { db } from '../../db/db';
import type { Block, Project } from '../../types';
import {
  emptyTrash,
  permanentlyDeleteBlock,
  permanentlyDeleteProject,
  restoreBlock,
  restoreProject,
  topLevelTrashedBlocks
} from '../../db/operations';
import { Trash2, RotateCcw, X } from 'lucide-react';

interface TrashModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshData: () => void;
}

export const TrashModal: React.FC<TrashModalProps> = ({
  isOpen,
  onClose,
  onRefreshData
}) => {
  const [trashedBlocks, setTrashedBlocks] = useState<Block[]>([]);
  const [trashedProjects, setTrashedProjects] = useState<Project[]>([]);
  const [projectsMap, setProjectsMap] = useState<Map<string, Project>>(new Map());

  const fetchTrashItems = async () => {
    const blocks = await db.blocks.toArray();
    const projects = await db.projects.toArray();
    const trashedProjectIds = new Set(projects.filter(project => project.isTrash).map(project => project.id));
    setTrashedProjects(projects.filter(project => project.isTrash));
    setTrashedBlocks(topLevelTrashedBlocks(blocks).filter(block => !trashedProjectIds.has(block.projectId)));
    setProjectsMap(new Map(projects.map(p => [p.id, p])));
  };

  useEffect(() => {
    if (isOpen) {
      fetchTrashItems();
    }
  }, [isOpen]);

  const handleRestore = async (blockId: string) => {
    await restoreBlock(blockId);
    await fetchTrashItems();
    onRefreshData();
  };

  const handleRestoreProject = async (projectId: string) => {
    await restoreProject(projectId);
    await fetchTrashItems();
    onRefreshData();
  };

  const handlePermanentDelete = async (blockId: string) => {
    if (!window.confirm('Weet je zeker dat je dit blok en de onderliggende tak definitief wilt verwijderen? Dit kan niet ongedaan worden gemaakt.')) {
      return;
    }

    await permanentlyDeleteBlock(blockId);
    await fetchTrashItems();
    onRefreshData();
  };

  const handlePermanentDeleteProject = async (projectId: string) => {
    if (!window.confirm('Dit project met alle blokken en bijlagen definitief verwijderen? Dit kan niet ongedaan worden gemaakt.')) return;
    await permanentlyDeleteProject(projectId);
    await fetchTrashItems();
    onRefreshData();
  };

  const handleEmptyTrash = async () => {
    if (!window.confirm('Weet je zeker dat je de gehele prullenbak wilt leegmaken? Alle verwijderde onderdelen worden permanent gewist.')) {
      return;
    }

    await emptyTrash();
    await fetchTrashItems();
    onRefreshData();
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
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '560px',
          maxWidth: '90vw',
          background: 'var(--bg-surface)',
          backdropFilter: 'var(--glass-backdrop)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 0 30px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(10, 15, 26, 0.8)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '1rem', fontWeight: 600 }}>
            <Trash2 size={18} color="#FF007F" />
            <span>Prullenbak</span>
          </div>

          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ maxHeight: '380px', overflowY: 'auto', padding: '12px 16px' }}>
          {trashedBlocks.length === 0 && trashedProjects.length === 0 ? (
            <div style={{ padding: '35px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              De prullenbak is momenteel leeg.
            </div>
          ) : (
            <>
            {trashedProjects.map(project => (
              <div
                key={project.id}
                style={{ padding: '12px 16px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-card)', border: '1px solid var(--border-card)', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
              >
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{project.title}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>Volledig project · verwijderd {project.trashedAt ? new Date(project.trashedAt).toLocaleDateString() : 'onbekend'}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={() => handleRestoreProject(project.id)} style={{ background: 'rgba(0, 240, 255, 0.1)', border: '1px solid var(--neon-cyan)', color: 'var(--neon-cyan)', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem' }}><RotateCcw size={13} /><span>Herstellen</span></button>
                  <button onClick={() => handlePermanentDeleteProject(project.id)} style={{ background: 'rgba(255, 0, 127, 0.1)', border: '1px solid var(--neon-magenta)', color: 'var(--neon-magenta)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem' }} title="Definitief verwijderen"><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
            {trashedBlocks.map(block => {
              const project = projectsMap.get(block.projectId);
              return (
                <div
                  key={block.id}
                  style={{
                    padding: '12px 16px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-card)',
                    marginBottom: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12
                  }}
                >
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                      {block.title}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      Project: {project?.title || 'Onbekend'} | Verwijderd op: {block.trashedAt ? new Date(block.trashedAt).toLocaleDateString() : 'Onbekend'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      onClick={() => handleRestore(block.id)}
                      style={{
                        background: 'rgba(0, 240, 255, 0.1)',
                        border: '1px solid var(--neon-cyan)',
                        color: 'var(--neon-cyan)',
                        padding: '4px 10px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: '0.75rem'
                      }}
                      title="Herstellen"
                    >
                      <RotateCcw size={13} />
                      <span>Herstellen</span>
                    </button>

                    <button
                      onClick={() => handlePermanentDelete(block.id)}
                      style={{
                        background: 'rgba(255, 0, 127, 0.1)',
                        border: '1px solid var(--neon-magenta)',
                        color: 'var(--neon-magenta)',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: '0.75rem'
                      }}
                      title="Definitief verwijderen"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
            </>
          )}
        </div>

        {(trashedBlocks.length > 0 || trashedProjects.length > 0) && (
          <div
            style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(10, 15, 26, 0.8)'
            }}
          >
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {trashedBlocks.length + trashedProjects.length} item(s) in prullenbak
            </span>

            <button
              onClick={handleEmptyTrash}
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid #EF4444',
                color: '#EF4444',
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <Trash2 size={13} />
              <span>Prullenbak leegmaken</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
