import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bot, CheckCircle2, Inbox, PauseCircle, UserCheck } from 'lucide-react';
import type { Block, Project } from '../../types';
import { buildFocusData, describeAlert, type FocusItem, type FocusSectionId } from '../../utils/focusData';
import './Focus.css';

interface FocusViewProps {
  projects: Project[];
  blocks: Block[];
  onOpenBlock: (blockId: string) => void;
}

const SECTION_ICONS: Record<FocusSectionId, React.ComponentType<{ size?: number }>> = {
  working: Bot,
  'your-turn': UserCheck,
  stuck: PauseCircle,
  ready: Inbox
};

/** Durations are shown relative to now, so the screen re-reads itself now and then. */
const REFRESH_INTERVAL_MS = 60000;

/**
 * One screen across every project, grouped by whose turn it is. It only reads
 * status, claim and agent-edit data that already exists — nothing here is
 * editable, every row leads back to the block where editing belongs.
 */
export const FocusView: React.FC<FocusViewProps> = ({ projects, blocks, onOpenBlock }) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  const focus = useMemo(() => buildFocusData(projects, blocks, now), [projects, blocks, now]);

  return (
    <div className="focus-view">
      <header className="focus-header">
        <div>
          <h1>Focus</h1>
          <p>
            {focus.totalCount === 0
              ? 'Nothing is in flight across your projects.'
              : `${focus.totalCount} item${focus.totalCount === 1 ? '' : 's'} in flight across your projects.`}
          </p>
        </div>
        {focus.alertCount > 0 && (
          <span className="focus-alert-count">
            <AlertTriangle size={13} />
            {focus.alertCount} need{focus.alertCount === 1 ? 's' : ''} a look
          </span>
        )}
      </header>

      <div className="focus-sections">
        {focus.sections.map(section => {
          const Icon = SECTION_ICONS[section.id];
          return (
            <section key={section.id} className="focus-section">
              <h2>
                <Icon size={14} />
                <span>{section.title}</span>
                <span className="focus-section-count">{section.items.length}</span>
              </h2>

              {section.items.length === 0 ? (
                <p className="focus-empty">
                  <CheckCircle2 size={13} />
                  {section.emptyLabel}
                </p>
              ) : (
                <ul className="focus-list">
                  {section.items.map(item => (
                    <FocusRow key={item.blockId} item={item} onOpen={onOpenBlock} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
};

const FocusRow: React.FC<{ item: FocusItem; onOpen: (blockId: string) => void }> = ({ item, onOpen }) => (
  <li className={`focus-row ${item.alerts.length > 0 ? 'has-alert' : ''}`}>
    <button type="button" onClick={() => onOpen(item.blockId)}>
      <span className="focus-row-project" style={{ background: item.projectColor }} aria-hidden="true" />
      <span className="focus-row-body">
        <span className="focus-row-title">{item.title}</span>
        <span className="focus-row-meta">
          <span className="focus-row-project-name">{item.projectName}</span>
          {item.agentLabel && <span className="focus-row-agent">{item.agentLabel}</span>}
          {item.detail && <span>{item.detail}</span>}
        </span>
        {item.alerts.length > 0 && (
          <span className="focus-row-alerts">
            {item.alerts.map(alert => (
              <span key={alert.kind} className="focus-row-alert">
                <AlertTriangle size={11} />
                {describeAlert(alert)}
              </span>
            ))}
          </span>
        )}
      </span>
    </button>
  </li>
);
