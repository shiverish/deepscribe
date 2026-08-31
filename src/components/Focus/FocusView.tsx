import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  FileText,
  Inbox,
  Pause,
  PauseCircle,
  Play,
  UserCheck
} from 'lucide-react';
import type { Block, Project } from '../../types';
import {
  buildFocusData,
  describeAlert,
  type FocusItem
} from '../../utils/focusData';
import { ProjectFilterDropdown } from '../Tasks/ProjectFilterDropdown';
import './Focus.css';

interface FocusViewProps {
  projects: Project[];
  blocks: Block[];
  onOpenBlock: (blockId: string) => void;
}

const REFRESH_INTERVAL_MS = 60000;

// Radii in pixels for the 3 concentric orbits
const ORBIT_RADII = {
  yourTurn: 120,
  working: 195,
  ready: 270
} as const;

export const FocusView: React.FC<FocusViewProps> = ({ projects, blocks, onOpenBlock }) => {
  const [now, setNow] = useState(() => Date.now());
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [highlightZone, setHighlightZone] = useState<'all' | 'your-turn' | 'working' | 'ready'>('all');
  const radarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  const focus = useMemo(
    () => buildFocusData(projects, blocks, now, selectedProjectIds),
    [projects, blocks, now, selectedProjectIds]
  );

  // Calculate task counts per project for the filter dropdown
  const taskCountsByProject = useMemo(() => {
    const counts: Record<string, number> = {};
    const active = blocks.filter(b => !b.isTrash && b.kind === 'task');
    for (const b of active) {
      if (
        b.task &&
        (b.task.status === 'in-progress' ||
          b.task.status === 'review' ||
          b.task.status === 'ready' ||
          b.task.status === 'blocked')
      ) {
        counts[b.projectId] = (counts[b.projectId] || 0) + 1;
      }
    }
    return counts;
  }, [blocks]);

  const hasItems = focus.totalCount > 0;

  return (
    <div className="focus-radar-view">
      {/* Top Header Controls */}
      <header className="focus-radar-header">
        <div className="focus-radar-title-group">
          <div className="focus-radar-heading">
            <h1>Focus Radar</h1>
            {focus.alertCount > 0 && (
              <span className="focus-alert-pill" title={`${focus.alertCount} item(s) require immediate attention`}>
                <AlertTriangle size={13} />
                <span>{focus.alertCount} need{focus.alertCount === 1 ? 's' : ''} attention</span>
              </span>
            )}
          </div>
          <p className="focus-radar-subtitle">
            {focus.totalCount === 0
              ? 'Nothing is currently in flight across your workspace.'
              : `${focus.totalCount} active item${focus.totalCount === 1 ? '' : 's'} in motion • ${focus.activeAgentCount} agent${focus.activeAgentCount === 1 ? '' : 's'} running`}
          </p>
        </div>

        <div className="focus-radar-controls">
          <ProjectFilterDropdown
            projects={projects}
            selectedProjectIds={selectedProjectIds}
            onChangeSelectedProjects={setSelectedProjectIds}
            taskCountsByProject={taskCountsByProject}
          />

          <button
            type="button"
            className={`focus-radar-btn ${isPaused ? 'active' : ''}`}
            onClick={() => setIsPaused(prev => !prev)}
            title={isPaused ? 'Resume radar orbit rotation' : 'Pause radar orbit rotation'}
            aria-label={isPaused ? 'Resume rotation' : 'Pause rotation'}
          >
            {isPaused ? <Play size={14} /> : <Pause size={14} />}
            <span>{isPaused ? 'Resume' : 'Pause'}</span>
          </button>
        </div>
      </header>

      {/* Main Radar Container */}
      <div className="focus-radar-stage">
        <div
          ref={radarRef}
          className={`focus-radar-canvas ${isPaused ? 'is-paused' : ''} ${!hasItems ? 'is-empty' : ''}`}
        >
          {/* SVG Background Orbits & Scan Lines */}
          <svg className="focus-radar-svg-grid" viewBox="-320 -320 640 640" aria-hidden="true">
            <defs>
              <radialGradient id="radar-glow-grad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="var(--accent-color, #6366f1)" stopOpacity="0.08" />
                <stop offset="60%" stopColor="var(--accent-color, #6366f1)" stopOpacity="0.02" />
                <stop offset="100%" stopColor="transparent" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="sweep-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--accent-color, #6366f1)" stopOpacity="0.16" />
                <stop offset="100%" stopColor="transparent" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Ambient Background Radial Glow */}
            <circle cx="0" cy="0" r="310" fill="url(#radar-glow-grad)" />

            {/* Radar Crosshairs */}
            <line x1="-310" y1="0" x2="310" y2="0" className="radar-axis-line" />
            <line x1="0" y1="-310" x2="0" y2="310" className="radar-axis-line" />
            <line x1="-220" y1="-220" x2="220" y2="220" className="radar-axis-line subtle" />
            <line x1="-220" y1="220" x2="220" y2="-220" className="radar-axis-line subtle" />

            {/* Orbit Tracks */}
            <circle
              cx="0"
              cy="0"
              r={ORBIT_RADII.ready}
              className={`radar-orbit-track ready-track ${highlightZone === 'ready' ? 'highlighted' : ''}`}
            />
            <circle
              cx="0"
              cy="0"
              r={ORBIT_RADII.working}
              className={`radar-orbit-track working-track ${highlightZone === 'working' ? 'highlighted' : ''}`}
            />
            <circle
              cx="0"
              cy="0"
              r={ORBIT_RADII.yourTurn}
              className={`radar-orbit-track your-turn-track ${highlightZone === 'your-turn' ? 'highlighted' : ''}`}
            />

            {/* Rotating Radar Sweep Beam */}
            {!isPaused && hasItems && (
              <g className="radar-sweep-beam">
                <path d="M 0 0 L 0 -290 A 290 290 0 0 1 205 -205 Z" fill="url(#sweep-grad)" />
              </g>
            )}
          </svg>

          {/* Central Momentum Core */}
          <div className="focus-center-hub" title="Workspace Momentum Center">
            <div className="focus-center-pulse-ring" />
            <div className="focus-center-core">
              <span className="focus-center-number">{focus.totalCount}</span>
              <span className="focus-center-label">IN FLIGHT</span>
              <div className="focus-center-meta">
                {focus.activeAgentCount > 0 && (
                  <span className="focus-center-agent-count" title={`${focus.activeAgentCount} active agent(s)`}>
                    <Bot size={11} /> {focus.activeAgentCount}
                  </span>
                )}
                {focus.alertCount > 0 && (
                  <span className="focus-center-alert-count" title={`${focus.alertCount} alert(s)`}>
                    <AlertTriangle size={11} /> {focus.alertCount}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Concentric Orbit Rings & Orbiting Nodes */}
          {hasItems ? (
            <>
              {/* Ring 1 (Inner): Your Turn */}
              <OrbitRing
                items={focus.rings.yourTurn}
                radius={ORBIT_RADII.yourTurn}
                ringClass="orbit-your-turn"
                animationClass="orbit-anim-inner"
                counterAnimClass="counter-anim-inner"
                isPaused={isPaused}
                hoveredItemId={hoveredItemId}
                onHoverItem={setHoveredItemId}
                onOpenBlock={onOpenBlock}
                isDimmed={highlightZone !== 'all' && highlightZone !== 'your-turn'}
              />

              {/* Ring 2 (Middle): In Flight (Agents Working) */}
              <OrbitRing
                items={focus.rings.working}
                radius={ORBIT_RADII.working}
                ringClass="orbit-working"
                animationClass="orbit-anim-middle"
                counterAnimClass="counter-anim-middle"
                isPaused={isPaused}
                hoveredItemId={hoveredItemId}
                onHoverItem={setHoveredItemId}
                onOpenBlock={onOpenBlock}
                isDimmed={highlightZone !== 'all' && highlightZone !== 'working'}
              />

              {/* Ring 3 (Outer): Up Next / Ready */}
              <OrbitRing
                items={focus.rings.ready}
                radius={ORBIT_RADII.ready}
                ringClass="orbit-ready"
                animationClass="orbit-anim-outer"
                counterAnimClass="counter-anim-outer"
                isPaused={isPaused}
                hoveredItemId={hoveredItemId}
                onHoverItem={setHoveredItemId}
                onOpenBlock={onOpenBlock}
                isDimmed={highlightZone !== 'all' && highlightZone !== 'ready'}
              />
            </>
          ) : (
            <div className="focus-radar-empty-state">
              <div className="focus-radar-empty-icon">
                <CheckCircle2 size={32} />
              </div>
              <h3>All clear on radar</h3>
              <p>No active tasks or unread notes are waiting across selected projects.</p>
            </div>
          )}
        </div>
      </div>

      {/* Interactive Legend Strip */}
      <footer className="focus-radar-legend">
        <button
          type="button"
          className={`focus-legend-item your-turn ${highlightZone === 'your-turn' ? 'active' : ''}`}
          onClick={() => setHighlightZone(prev => (prev === 'your-turn' ? 'all' : 'your-turn'))}
        >
          <span className="focus-legend-indicator your-turn" />
          <UserCheck size={14} />
          <span className="focus-legend-label">Your Turn / Urgent</span>
          <span className="focus-legend-badge">{focus.rings.yourTurn.length}</span>
        </button>

        <button
          type="button"
          className={`focus-legend-item working ${highlightZone === 'working' ? 'active' : ''}`}
          onClick={() => setHighlightZone(prev => (prev === 'working' ? 'all' : 'working'))}
        >
          <span className="focus-legend-indicator working" />
          <Bot size={14} />
          <span className="focus-legend-label">In Flight / Working</span>
          <span className="focus-legend-badge">{focus.rings.working.length}</span>
        </button>

        <button
          type="button"
          className={`focus-legend-item ready ${highlightZone === 'ready' ? 'active' : ''}`}
          onClick={() => setHighlightZone(prev => (prev === 'ready' ? 'all' : 'ready'))}
        >
          <span className="focus-legend-indicator ready" />
          <Inbox size={14} />
          <span className="focus-legend-label">Up Next / Ready</span>
          <span className="focus-legend-badge">{focus.rings.ready.length}</span>
        </button>
      </footer>
    </div>
  );
};

interface OrbitRingProps {
  items: FocusItem[];
  radius: number;
  ringClass: string;
  animationClass: string;
  counterAnimClass: string;
  isPaused: boolean;
  hoveredItemId: string | null;
  onHoverItem: (id: string | null) => void;
  onOpenBlock: (id: string) => void;
  isDimmed: boolean;
}

const OrbitRing: React.FC<OrbitRingProps> = ({
  items,
  radius,
  ringClass,
  animationClass,
  counterAnimClass,
  isPaused,
  hoveredItemId,
  onHoverItem,
  onOpenBlock,
  isDimmed
}) => {
  if (items.length === 0) return null;

  const total = items.length;
  const diameter = radius * 2;

  return (
    <div
      className={`focus-orbit-layer ${ringClass} ${animationClass} ${isPaused ? 'paused' : ''} ${isDimmed ? 'dimmed' : ''}`}
      style={{
        width: diameter,
        height: diameter,
        marginLeft: -radius,
        marginTop: -radius
      }}
    >
      {items.map((item, index) => {
        const angleDeg = (index / total) * 360;
        const angleRad = (angleDeg * Math.PI) / 180;
        // Node position along the circle circumference
        const leftPercent = 50 + 50 * Math.cos(angleRad);
        const topPercent = 50 + 50 * Math.sin(angleRad);
        const isHovered = hoveredItemId === item.blockId;

        return (
          <div
            key={item.blockId}
            className={`focus-node-slot ${counterAnimClass} ${isPaused ? 'paused' : ''}`}
            style={{
              left: `${leftPercent}%`,
              top: `${topPercent}%`
            }}
          >
            <RadarNode
              item={item}
              isHovered={isHovered}
              onHover={hovering => onHoverItem(hovering ? item.blockId : null)}
              onOpen={() => onOpenBlock(item.blockId)}
            />
          </div>
        );
      })}
    </div>
  );
};

interface RadarNodeProps {
  item: FocusItem;
  isHovered: boolean;
  onHover: (hovering: boolean) => void;
  onOpen: () => void;
}

const RadarNode: React.FC<RadarNodeProps> = ({ item, isHovered, onHover, onOpen }) => {
  const hasAlerts = item.alerts.length > 0;

  const renderIcon = () => {
    if (!item.isTask) {
      return <FileText size={14} />;
    }
    if (hasAlerts) {
      return <AlertTriangle size={14} className="node-icon-alert" />;
    }
    switch (item.sectionId) {
      case 'working':
        return <Bot size={14} />;
      case 'your-turn':
        return <UserCheck size={14} />;
      case 'stuck':
        return <PauseCircle size={14} />;
      case 'ready':
      default:
        return <Inbox size={14} />;
    }
  };

  return (
    <div
      className={`focus-radar-node-container ${isHovered ? 'is-hovered' : ''}`}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <button
        type="button"
        className={`focus-radar-node ${hasAlerts ? 'has-alert' : ''} pulse-${item.pulseIntensity}`}
        style={{
          borderColor: hasAlerts ? '#f59e0b' : item.projectColor,
          boxShadow: hasAlerts
            ? '0 0 14px rgba(245, 158, 11, 0.45)'
            : `0 0 10px ${item.projectColor}33`
        }}
        onClick={onOpen}
        aria-label={`Open ${item.title}`}
      >
        <span
          className="focus-node-project-pip"
          style={{ backgroundColor: item.projectColor }}
          aria-hidden="true"
        />
        {renderIcon()}
      </button>

      {/* Floating Popover on Hover */}
      {isHovered && (
        <div className="focus-node-popover" role="tooltip">
          <div className="focus-popover-header">
            <span
              className="focus-popover-project-badge"
              style={{
                backgroundColor: `${item.projectColor}26`,
                color: item.projectColor,
                borderColor: `${item.projectColor}4d`
              }}
            >
              <span className="popover-dot" style={{ backgroundColor: item.projectColor }} />
              {item.projectName}
            </span>
            {item.agentLabel && (
              <span className="focus-popover-agent-badge">
                <Bot size={11} />
                {item.agentLabel}
              </span>
            )}
          </div>

          <div className="focus-popover-title">{item.title}</div>

          {item.detail && <div className="focus-popover-detail">{item.detail}</div>}

          {hasAlerts && (
            <div className="focus-popover-alerts">
              {item.alerts.map(alert => (
                <div key={alert.kind} className="focus-popover-alert-item">
                  <AlertTriangle size={11} />
                  <span>{describeAlert(alert)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="focus-popover-footer">
            <span>Click to open block</span>
            <span className="focus-popover-arrow">→</span>
          </div>
        </div>
      )}
    </div>
  );
};
