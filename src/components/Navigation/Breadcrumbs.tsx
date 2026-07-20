import React from 'react';
import type { PathSegment } from '../../types';
import { ChevronRight, Search, Trash2, Download, HelpCircle, PanelRightOpen, PanelRightClose, Folder, FileText } from 'lucide-react';

interface BreadcrumbsProps {
  pathSegments: PathSegment[];
  onSelectSegment: (index: number) => void;
  onOpenSearch: () => void;
  onOpenTrash: () => void;
  onOpenExportImport: () => void;
  onOpenHelp: () => void;
  isWritingPanelOpen: boolean;
  onToggleWritingPanel: () => void;
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({
  pathSegments,
  onSelectSegment,
  onOpenSearch,
  onOpenTrash,
  onOpenExportImport,
  onOpenHelp,
  isWritingPanelOpen,
  onToggleWritingPanel
}) => {
  return (
    <div
      style={{
        height: '48px',
        background: 'rgba(18, 16, 14, 0.92)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        gap: '16px',
        zIndex: 20
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          overflowX: 'auto',
          scrollBehavior: 'smooth',
          fontSize: '0.85rem',
          fontWeight: 500
        }}
      >
        <span
          onClick={() => onSelectSegment(0)}
          style={{
            color: pathSegments.length === 0 ? '#EBDEC3' : 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            transition: 'color 0.15s'
          }}
          title="Projectenlijst"
        >
          <Folder size={15} color="#EBDEC3" />
          <span>Projecten</span>
        </span>

        {pathSegments.map((segment, index) => {
          const isLast = index === pathSegments.length - 1;
          return (
            <React.Fragment key={segment.id || index}>
              <ChevronRight size={14} color="#8C857B" />
              <span
                onClick={() => onSelectSegment(index + 1)}
                style={{
                  color: isLast ? '#EBDEC3' : 'var(--text-secondary)',
                  fontWeight: isLast ? 600 : 400,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: isLast ? 'rgba(235, 222, 195, 0.08)' : 'transparent',
                  border: isLast ? '1px solid rgba(235, 222, 195, 0.2)' : '1px solid transparent'
                }}
              >
                {segment.type === 'project' ? <Folder size={14} color="#EBDEC3" /> : <FileText size={14} color="#D6CFC4" />}
                {segment.title}
              </span>
            </React.Fragment>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          onClick={onOpenSearch}
          style={{
            background: 'rgba(235, 222, 195, 0.08)',
            border: '1px solid rgba(235, 222, 195, 0.22)',
            color: '#EBDEC3',
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

        <div style={{ width: 1, height: 20, background: 'var(--border-subtle)', margin: '0 4px' }} />

        <button
          onClick={onToggleWritingPanel}
          style={{
            background: isWritingPanelOpen ? 'rgba(235, 222, 195, 0.1)' : 'rgba(255, 255, 255, 0.03)',
            border: isWritingPanelOpen ? '1px solid rgba(235, 222, 195, 0.3)' : '1px solid var(--border-subtle)',
            color: isWritingPanelOpen ? '#EBDEC3' : 'var(--text-secondary)',
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
