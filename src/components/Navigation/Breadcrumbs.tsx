import React from 'react';
import type { PathSegment, ActiveView } from '../../types';
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
  Network,
  BarChart3
} from 'lucide-react';

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
  isWritingPanelOpen: boolean;
  onToggleWritingPanel: () => void;
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
  isWritingPanelOpen,
  onToggleWritingPanel
}) => {
  return (
    <div className="app-topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
        <nav className="breadcrumb-trail" aria-label="Huidig pad">
          <button
            type="button"
            className={`breadcrumb-segment ${pathSegments.length === 0 ? 'current' : ''}`}
            onClick={() => onSelectSegment(0)}
            aria-current={pathSegments.length === 0 ? 'page' : undefined}
            title="Projectenlijst"
          >
            <Folder size={15} />
            <span>Projecten</span>
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

        {/* View Switcher: Columns | Graph | Stats */}
        <div className="view-switcher-group">
          <button
            type="button"
            className={`view-switch-btn ${activeView === 'columns' ? 'active' : ''}`}
            onClick={() => onViewChange('columns')}
            title="Columns View (Ctrl+1)"
          >
            <Columns3 size={13} />
            <span>Columns</span>
          </button>

          <button
            type="button"
            className={`view-switch-btn ${activeView === 'graph' ? 'active' : ''}`}
            onClick={() => onViewChange('graph')}
            title="Graph View (Ctrl+2)"
          >
            <Network size={13} />
            <span>Graph</span>
          </button>

          <button
            type="button"
            className={`view-switch-btn ${activeView === 'stats' ? 'active' : ''}`}
            onClick={() => onViewChange('stats')}
            title="Statistics View (Ctrl+3)"
          >
            <BarChart3 size={13} />
            <span>Stats</span>
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
          title="Zoeken (Ctrl + K)"
        >
          <Search size={14} />
          <span>Zoeken</span>
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
          title="Project Exporteren / Importeren"
        >
          <Download size={14} />
          <span>Archief</span>
        </button>

        <button
          onClick={onOpenWorkspace}
          className="topbar-workspace-button"
          title="Agent Inbox, activiteit en templates"
        >
          <Bot size={14} />
          <span>Werkruimte</span>
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
          title="Prullenbak"
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
          title="Sneltoetsen (Shift + ?)"
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
          title="Instellingen (Ctrl + ,)"
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
          title="Schrijfpaneel in/uitklappen (Ctrl + Shift + E)"
        >
          {isWritingPanelOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
          <span>Schrijfpaneel</span>
        </button>
      </div>
    </div>
  );
};
