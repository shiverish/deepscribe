import React from 'react';
import type { PathSegment, ActiveView } from '../../types';
import { VIEW_DEFINITIONS } from '../../utils/views';
import type { UpdaterState } from './UpdateNotification';
import {
  Bot,
  ChevronRight,
  Search,
  Trash2,
  Download,
  HelpCircle,
  Settings,
  PanelRightOpen,
  PanelRightClose,
  Folder,
  FileText,
  Columns3,
  CheckSquare,
  BarChart3,
  Camera,
  ArrowUpCircle
} from 'lucide-react';

/** Keyed by view id, so a new view cannot be added without giving it an icon. */
const VIEW_ICONS: Record<ActiveView, React.ComponentType<{ size?: number }>> = {
  columns: Columns3,
  tasks: CheckSquare,
  stats: BarChart3
};

interface BreadcrumbsProps {
  pathSegments: PathSegment[];
  onSelectSegment: (index: number) => void;
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
  onOpenSearch: () => void;
  onOpenTrash: () => void;
  onOpenExportImport: () => void;
  onOpenHelp: () => void;
  onOpenSettings: () => void;
  onOpenWorkspace: () => void;
  onTriggerScreenAnnotation?: () => void;
  isWritingPanelOpen: boolean;
  onToggleWritingPanel: () => void;
  updaterState?: UpdaterState | null;
  onInstallUpdate?: () => void;
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({
  pathSegments,
  onSelectSegment,
  activeView,
  onViewChange,
  onOpenSearch,
  onOpenTrash,
  onOpenExportImport,
  onOpenHelp,
  onOpenSettings,
  onOpenWorkspace,
  onTriggerScreenAnnotation,
  isWritingPanelOpen,
  onToggleWritingPanel,
  updaterState,
  onInstallUpdate
}) => {
  const isUpdateDownloaded = updaterState?.status === 'downloaded';

  return (
    <div className="app-topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
        <nav className="breadcrumb-trail" aria-label="Current path">
          <button
            type="button"
            className={`breadcrumb-segment ${pathSegments.length === 0 ? 'current' : ''}`}
            onClick={() => onSelectSegment(0)}
            aria-current={pathSegments.length === 0 ? 'page' : undefined}
            title="Project List"
          >
            <Folder size={15} />
            <span>Projects</span>
          </button>

          {pathSegments.map((segment, index) => {
            const isLast = index === pathSegments.length - 1;
            return (
              <React.Fragment key={segment.id || index}>
                <ChevronRight className="breadcrumb-separator" size={14} />
                <button
                  type="button"
                  className={`breadcrumb-segment ${isLast ? 'current' : ''}`}
                  onClick={() => onSelectSegment(index + 1)}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {segment.type === 'project' ? <Folder size={14} /> : <FileText size={14} />}
                  <span>{segment.title}</span>
                  {isLast && <span className="breadcrumb-current-label">Open</span>}
                </button>
              </React.Fragment>
            );
          })}
        </nav>

        {/* View Switcher, built from the shared view definitions */}
        <div className="view-switcher-group">
          {VIEW_DEFINITIONS.map(view => {
            const Icon = VIEW_ICONS[view.id];
            return (
              <button
                key={view.id}
                type="button"
                className={`view-switch-btn ${activeView === view.id ? 'active' : ''}`}
                onClick={() => onViewChange(view.id)}
                title={`${view.title} (${view.shortcut})`}
              >
                <Icon size={13} />
                <span>{view.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {isUpdateDownloaded && (
          <button
            onClick={onInstallUpdate || onOpenSettings}
            style={{
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              color: '#10B981',
              padding: '5px 10px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.78rem',
              fontWeight: 600,
              animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
            }}
            title={`Update v${updaterState?.availableVersion || ''} is ready. Click to restart and update.`}
          >
            <ArrowUpCircle size={14} />
            <span>Update Ready</span>
          </button>
        )}

        {onTriggerScreenAnnotation && (
          <button
            onClick={onTriggerScreenAnnotation}
            style={{
              background: 'rgba(59, 130, 246, 0.12)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              color: '#60A5FA',
              padding: '5px 10px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.78rem',
              fontWeight: 500
            }}
            title="Annotate screen & create task (Ctrl + Alt + S)"
          >
            <Camera size={14} />
            <span>Annotate</span>
            <kbd style={{ fontSize: '0.68rem', opacity: 0.8 }}>Ctrl+Alt+S</kbd>
          </button>
        )}

        <button
          onClick={onOpenSearch}
          style={{
            background: 'rgba(var(--atmosphere-rgb), 0.08)',
            border: '1px solid rgba(var(--atmosphere-rgb), 0.22)',
            color: 'var(--atmosphere-color)',
            padding: '5px 10px',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '0.78rem',
            fontWeight: 500
          }}
          title="Search (Ctrl + K)"
        >
          <Search size={14} />
          <span>Search</span>
          <kbd>Ctrl+K</kbd>
        </button>

        <button
          onClick={onOpenExportImport}
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            padding: '5px 8px',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: '0.78rem'
          }}
          title="Export / Import Project"
        >
          <Download size={14} />
          <span>Archive</span>
        </button>

        <button
          onClick={onOpenWorkspace}
          className="topbar-workspace-button"
          title="Activity and templates"
        >
          <Bot size={14} />
          <span>Workspace</span>
        </button>

        <button
          onClick={onOpenTrash}
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            padding: '5px 8px',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: '0.78rem'
          }}
          title="Trash"
        >
          <Trash2 size={14} />
        </button>

        <button
          onClick={onOpenHelp}
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            padding: '5px 8px',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: '0.78rem'
          }}
          title="Keyboard Shortcuts (Shift + ?)"
        >
          <HelpCircle size={14} />
        </button>

        <button
          onClick={onOpenSettings}
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            padding: '5px 8px',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: '0.78rem'
          }}
          title="Settings (Ctrl + ,)"
        >
          <Settings size={14} />
        </button>

        <div style={{ width: 1, height: 20, background: 'var(--border-subtle)', margin: '0 4px' }} />

        <button
          onClick={onToggleWritingPanel}
          style={{
            background: isWritingPanelOpen ? 'rgba(var(--atmosphere-rgb), 0.1)' : 'rgba(255, 255, 255, 0.03)',
            border: isWritingPanelOpen ? '1px solid rgba(var(--atmosphere-rgb), 0.3)' : '1px solid var(--border-subtle)',
            color: isWritingPanelOpen ? 'var(--atmosphere-color)' : 'var(--text-secondary)',
            padding: '5px 10px',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '0.78rem',
            fontWeight: 500
          }}
          title="Toggle Writing Panel (Ctrl + Shift + E)"
        >
          {isWritingPanelOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
          <span>Writing Panel</span>
        </button>
      </div>
    </div>
  );
};
