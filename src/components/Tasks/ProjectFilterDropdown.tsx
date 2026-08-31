import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { Project } from '../../types';
import { TASK_INBOX_PROJECT_ID } from '../../utils/taskBlocks';
import { DEFAULT_PROJECT_COLOR } from '../../utils/projectColors';
import { ChevronDown, Search, Check, Filter } from 'lucide-react';
import { ClearSearchButton } from '../Search/ClearSearchButton';

interface ProjectFilterDropdownProps {
  projects: Project[];
  selectedProjectIds: string[]; // empty array means "All projects"
  onChangeSelectedProjects: (projectIds: string[]) => void;
  taskCountsByProject?: Record<string, number>;
}

export const ProjectFilterDropdown: React.FC<ProjectFilterDropdownProps> = ({
  projects,
  selectedProjectIds,
  onChangeSelectedProjects,
  taskCountsByProject = {}
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const clearSearchQuery = () => {
    setSearchQuery('');
    searchInputRef.current?.focus();
  };

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  const isAllSelected = selectedProjectIds.length === 0;

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const q = searchQuery.toLowerCase();
    return projects.filter(p => p.title.toLowerCase().includes(q));
  }, [projects, searchQuery]);

  const toggleProject = (projectId: string) => {
    if (isAllSelected) {
      onChangeSelectedProjects([projectId]);
      return;
    }

    if (selectedProjectIds.includes(projectId)) {
      const next = selectedProjectIds.filter(id => id !== projectId);
      onChangeSelectedProjects(next);
    } else {
      onChangeSelectedProjects([...selectedProjectIds, projectId]);
    }
  };

  const handleSelectAll = () => {
    onChangeSelectedProjects([]);
  };

  const handleClear = () => {
    onChangeSelectedProjects([]);
  };

  const buttonLabel = useMemo(() => {
    if (isAllSelected) return 'All projects';
    if (selectedProjectIds.length === 1) {
      const id = selectedProjectIds[0];
      if (id === TASK_INBOX_PROJECT_ID) return 'Workspace Inbox';
      const proj = projects.find(p => p.id === id);
      return proj ? proj.title : '1 project';
    }
    return `${selectedProjectIds.length} projects`;
  }, [isAllSelected, selectedProjectIds, projects]);

  return (
    <div className="project-filter-dropdown" ref={containerRef}>
      <button
        type="button"
        className={`project-filter-trigger ${!isAllSelected ? 'is-filtered' : ''}`}
        onClick={() => setIsOpen(prev => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        title="Filter by projects"
      >
        <Filter size={13} className="project-filter-icon" />
        <span className="project-filter-label">{buttonLabel}</span>
        {!isAllSelected && (
          <span className="project-filter-badge">{selectedProjectIds.length}</span>
        )}
        <ChevronDown size={13} className={`project-filter-chevron ${isOpen ? 'open' : ''}`} />
      </button>

      {isOpen && (
        <div className="project-filter-popover" role="dialog">
          <div className="project-filter-search-box">
            <Search size={13} color="var(--text-muted)" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape' && searchQuery) {
                  e.preventDefault();
                  e.stopPropagation();
                  clearSearchQuery();
                }
              }}
            />
            <ClearSearchButton
              visible={searchQuery.length > 0}
              onClear={clearSearchQuery}
              size={12}
              className="project-filter-search-clear"
            />
          </div>

          <div className="project-filter-actions">
            <button
              type="button"
              className="project-filter-action-btn"
              onClick={handleSelectAll}
            >
              All projects
            </button>
            {!isAllSelected && (
              <button
                type="button"
                className="project-filter-action-btn text-muted"
                onClick={handleClear}
              >
                Reset
              </button>
            )}
          </div>

          <div className="project-filter-list" role="listbox" aria-multiselectable="true">
            {/* Workspace Inbox Item */}
            {(!searchQuery || 'workspace inbox'.includes(searchQuery.toLowerCase())) && (
              <div
                className={`project-filter-item ${selectedProjectIds.includes(TASK_INBOX_PROJECT_ID) ? 'selected' : ''}`}
                onClick={() => toggleProject(TASK_INBOX_PROJECT_ID)}
                role="option"
                aria-selected={selectedProjectIds.includes(TASK_INBOX_PROJECT_ID)}
              >
                <div className={`project-filter-checkbox ${selectedProjectIds.includes(TASK_INBOX_PROJECT_ID) || isAllSelected ? 'checked' : ''}`}>
                  {(selectedProjectIds.includes(TASK_INBOX_PROJECT_ID) || isAllSelected) && <Check size={11} />}
                </div>
                <span className="project-color-pip" style={{ backgroundColor: 'var(--atmosphere-color)' }} />
                <span className="project-filter-item-title">Workspace Inbox</span>
                {taskCountsByProject[TASK_INBOX_PROJECT_ID] !== undefined && (
                  <span className="project-filter-item-count">{taskCountsByProject[TASK_INBOX_PROJECT_ID]}</span>
                )}
              </div>
            )}

            {filteredProjects.map(project => {
              const isChecked = selectedProjectIds.includes(project.id);
              const count = taskCountsByProject[project.id];
              return (
                <div
                  key={project.id}
                  className={`project-filter-item ${isChecked ? 'selected' : ''}`}
                  onClick={() => toggleProject(project.id)}
                  role="option"
                  aria-selected={isChecked}
                >
                  <div className={`project-filter-checkbox ${isChecked || isAllSelected ? 'checked' : ''}`}>
                    {(isChecked || isAllSelected) && <Check size={11} />}
                  </div>
                  <span
                    className="project-color-pip"
                    style={{ backgroundColor: project.color || DEFAULT_PROJECT_COLOR }}
                  />
                  <span className="project-filter-item-title">{project.title}</span>
                  {count !== undefined && (
                    <span className="project-filter-item-count">{count}</span>
                  )}
                </div>
              );
            })}

            {filteredProjects.length === 0 && searchQuery && (
              <div className="project-filter-empty">
                No matching projects
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
