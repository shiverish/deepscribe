import React, { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CircleDotDashed, Link2, Pause, Play, Sparkles } from 'lucide-react';
import type { Block, BlockLink, Project } from '../../types';
import { buildProjectRadarData, formatDuration, type ProjectRadarItem } from '../../utils/focusData';
import { ProjectFilterDropdown } from '../Tasks/ProjectFilterDropdown';
import './Focus.css';

interface FocusViewProps {
  projects: Project[];
  blocks: Block[];
  links: BlockLink[];
  onOpenBlock: (blockId: string) => void;
}

const REFRESH_INTERVAL_MS = 60_000;

export const FocusView: React.FC<FocusViewProps> = ({ projects, blocks, links, onOpenBlock }) => {
  const [now, setNow] = useState(() => Date.now());
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  const radar = useMemo(
    () => buildProjectRadarData(projects, blocks, links, now, selectedProjectIds),
    [projects, blocks, links, now, selectedProjectIds]
  );

  const taskCountsByProject = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const block of blocks) {
      if (!block.isTrash && block.kind === 'task' && block.task && ['in-progress', 'review', 'ready', 'blocked'].includes(block.task.status)) {
        counts[block.projectId] = (counts[block.projectId] ?? 0) + 1;
      }
    }
    return counts;
  }, [blocks]);

  return (
    <div className="focus-radar-view">
      <header className="focus-radar-header">
        <div className="focus-radar-title-group">
          <div className="focus-radar-heading"><h1>Focus Radar</h1></div>
          <p className="focus-radar-subtitle">
            Projects orbit by momentum: current work and references pull inward; stale, sparse projects remain visible at the edge.
          </p>
        </div>
        <div className="focus-radar-controls">
          <ProjectFilterDropdown
            projects={projects}
            selectedProjectIds={selectedProjectIds}
            onChangeSelectedProjects={setSelectedProjectIds}
            taskCountsByProject={taskCountsByProject}
          />
          <button type="button" className={`focus-radar-btn ${isPaused ? 'active' : ''}`} onClick={() => setIsPaused(value => !value)}>
            {isPaused ? <Play size={14} /> : <Pause size={14} />}
            <span>{isPaused ? 'Resume' : 'Pause'}</span>
          </button>
        </div>
      </header>

      <main className="focus-radar-stage">
        <div className={`focus-radar-canvas project-radar-canvas ${isPaused ? 'is-paused' : ''}`}>
          <svg className="focus-radar-svg-grid" viewBox="-320 -320 640 640" aria-hidden="true">
            <circle cx="0" cy="0" r="294" className="project-radar-track outer" />
            <circle cx="0" cy="0" r="220" className="project-radar-track" />
            <circle cx="0" cy="0" r="150" className="project-radar-track" />
            <circle cx="0" cy="0" r="86" className="project-radar-track inner" />
            <line x1="-300" y1="0" x2="300" y2="0" className="radar-axis-line" />
            <line x1="0" y1="-300" x2="0" y2="300" className="radar-axis-line" />
            {!isPaused && radar.items.length > 0 && <g className="radar-sweep-beam"><path d="M 0 0 L 0 -290 A 290 290 0 0 1 205 -205 Z" fill="url(#focus-sweep)" /></g>}
            <defs><linearGradient id="focus-sweep" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="var(--accent-color, #6366f1)" stopOpacity="0.14" /><stop offset="100%" stopColor="transparent" stopOpacity="0" /></linearGradient></defs>
          </svg>

          <div className="focus-center-hub">
            <div className="focus-center-pulse-ring" />
            <div className="focus-center-core">
              <span className="focus-center-number">{radar.items.length}</span>
              <span className="focus-center-label">PROJECTS</span>
              <div className="focus-center-meta"><span className="focus-center-agent-count"><Activity size={11} /> {radar.activeProjectCount}</span></div>
            </div>
          </div>

          {radar.items.length === 0 ? (
            <div className="focus-radar-empty-state"><div className="focus-radar-empty-icon"><CircleDotDashed size={32} /></div><h3>No projects selected</h3><p>Select one or more projects to place them on the radar.</p></div>
          ) : (
            <div className={`project-radar-orbit ${isPaused ? 'paused' : ''}`}>
              {radar.items.map((item, index) => (
                <ProjectNode
                  key={item.projectId}
                  item={item}
                  index={index}
                  total={radar.items.length}
                  now={now}
                  isHovered={hoveredProjectId === item.projectId}
                  onHover={setHoveredProjectId}
                  onOpenBlock={onOpenBlock}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <footer className="focus-radar-legend project-radar-legend">
        <span><Sparkles size={14} /> Inner orbit: active, connected work</span>
        <span><Link2 size={14} /> Reference count strengthens project momentum</span>
        <span><AlertTriangle size={14} /> Outer orbit: stale or sparse projects</span>
      </footer>
    </div>
  );
};

interface ProjectNodeProps {
  item: ProjectRadarItem;
  index: number;
  total: number;
  now: number;
  isHovered: boolean;
  onHover: (projectId: string | null) => void;
  onOpenBlock: (blockId: string) => void;
}

const ProjectNode: React.FC<ProjectNodeProps> = ({ item, index, total, now, isHovered, onHover, onOpenBlock }) => {
  const angle = (index / total) * 360;
  const counts = item.statusCounts;
  const signals = [
    counts.blocked ? `${counts.blocked} blocked` : '',
    counts.review ? `${counts.review} in review` : '',
    counts.working ? `${counts.working} working` : '',
    counts.ready ? `${counts.ready} ready` : '',
    counts.unreadAgentEdits ? `${counts.unreadAgentEdits} unread edit${counts.unreadAgentEdits === 1 ? '' : 's'}` : ''
  ].filter(Boolean);

  return (
    <div
      className="project-radar-node-slot"
      style={{ '--project-angle': `${angle}deg`, '--project-radius': `${item.radius}px` } as React.CSSProperties}
      onMouseEnter={() => onHover(item.projectId)}
      onMouseLeave={() => onHover(null)}
    >
      <button
        type="button"
        className={`project-radar-node ${isHovered ? 'is-hovered' : ''}`}
        style={{ borderColor: item.color, boxShadow: `0 0 16px ${item.color}55` }}
        onClick={() => item.leadBlockId && onOpenBlock(item.leadBlockId)}
        aria-label={item.leadBlockId ? `Open most relevant block in ${item.title}` : item.title}
      >
        <span className="project-radar-dot" style={{ backgroundColor: item.color }} />
        <span className="project-radar-initial">{item.title.slice(0, 1).toUpperCase()}</span>
      </button>
      {isHovered && (
        <div className="focus-node-popover project-radar-popover" role="tooltip">
          <div className="focus-popover-title">{item.title}</div>
          <div className="focus-popover-detail">Momentum {item.momentumScore}/100 · updated {formatDuration(now - item.lastActivityAt)} ago</div>
          <div className="project-radar-popover-metrics"><span><Link2 size={11} /> {item.referenceCount} references</span><span>{signals.length ? signals.join(' · ') : 'No active task signals'}</span></div>
          <div className="focus-popover-footer"><span>{item.leadBlockId ? 'Click to open the most relevant block' : 'Project has no blocks yet'}</span></div>
        </div>
      )}
    </div>
  );
};
