import React, { useState, useMemo } from 'react';
import type { Block, Project } from '../../types';
import { calculateStatistics } from '../../utils/statisticsData';
import {
  FileText,
  Type,
  Clock,
  Layers,
  Folder,
  Tag as TagIcon,
  Paperclip,
  CheckSquare,
  BarChart3
} from 'lucide-react';
import './Statistics.css';

interface StatisticsViewProps {
  projects: Project[];
  blocks: Block[];
  activeProjectId: string | null;
  onSelectProject?: (projectId: string) => void;
}

export const StatisticsView: React.FC<StatisticsViewProps> = ({
  projects,
  blocks,
  activeProjectId,
  onSelectProject
}) => {
  const [scope, setScope] = useState<'project' | 'workspace'>('project');

  const stats = useMemo(() => {
    return calculateStatistics(projects, blocks, scope, activeProjectId);
  }, [projects, blocks, scope, activeProjectId]);

  return (
    <div className="stats-view-container">
      {/* Header */}
      <div className="stats-header">
        <div className="stats-title-group">
          <h1>Statistics & Analytics</h1>
          <div className="stats-subtitle">
            {scope === 'project'
              ? `Showing metrics for: ${stats.activeProjectTitle || 'No project selected'}`
              : 'Showing workspace-wide content and productivity metrics'}
          </div>
        </div>

        {/* Scope Switcher */}
        <div className="stats-scope-switch">
          <button
            type="button"
            className={`stats-scope-btn ${scope === 'project' ? 'active' : ''}`}
            onClick={() => setScope('project')}
          >
            <Folder size={14} />
            <span>Current Project</span>
          </button>
          <button
            type="button"
            className={`stats-scope-btn ${scope === 'workspace' ? 'active' : ''}`}
            onClick={() => setScope('workspace')}
          >
            <Layers size={14} />
            <span>Entire Workspace</span>
          </button>
        </div>
      </div>

      {/* Core Stat Cards */}
      <div className="stats-cards-grid">
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Total Words</span>
            <FileText size={16} className="stat-card-icon" />
          </div>
          <div className="stat-card-value">{stats.totalWords.toLocaleString()}</div>
          <div className="stat-card-unit">Across {stats.totalBlocks} blocks</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Characters</span>
            <Type size={16} className="stat-card-icon" />
          </div>
          <div className="stat-card-value">{stats.totalCharacters.toLocaleString()}</div>
          <div className="stat-card-unit">Plain text content</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Reading Time</span>
            <Clock size={16} className="stat-card-icon" />
          </div>
          <div className="stat-card-value">{stats.estimatedReadingTimeMinutes}</div>
          <div className="stat-card-unit">Minutes (~200 wpm)</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Blocks</span>
            <Layers size={16} className="stat-card-icon" />
          </div>
          <div className="stat-card-value">{stats.totalBlocks}</div>
          <div className="stat-card-unit">{scope === 'workspace' ? `In ${stats.totalProjects} projects` : 'In current project'}</div>
        </div>

        {scope === 'workspace' && (
          <div className="stat-card">
            <div className="stat-card-header">
              <span className="stat-card-label">Projects</span>
              <Folder size={16} className="stat-card-icon" />
            </div>
            <div className="stat-card-value">{stats.totalProjects}</div>
            <div className="stat-card-unit">Active projects</div>
          </div>
        )}

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Attachments</span>
            <Paperclip size={16} className="stat-card-icon" />
          </div>
          <div className="stat-card-value">{stats.totalAttachments}</div>
          <div className="stat-card-unit">Embedded files & images</div>
        </div>
      </div>

      {/* Sections Grid: Tasks Progress & Tag Distribution */}
      <div className="stats-sections-grid">
        {/* Task Progress Panel */}
        <div className="stats-panel">
          <h2 className="stats-panel-title">
            <CheckSquare size={17} />
            <span>Tasks & Progress</span>
          </h2>

          <div className="task-progress-box">
            <div className="task-progress-overall">
              <div className="task-progress-percentage">
                {stats.taskCompletionPercentage}%
              </div>
              <div className="task-progress-bar-container">
                <div className="task-progress-bar-bg">
                  <div
                    className="task-progress-bar-fill"
                    style={{ width: `${stats.taskCompletionPercentage}%` }}
                  />
                </div>
                <div className="task-progress-meta">
                  <span>{stats.completedTasks} completed</span>
                  <span>{stats.pendingTasks} remaining ({stats.totalTasks} total)</span>
                </div>
              </div>
            </div>

            {scope === 'workspace' && stats.projectBreakdown.length > 0 && (
              <>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, marginTop: '8px', color: 'var(--text-secondary)' }}>
                  Per-Project Breakdown:
                </div>
                <div className="task-project-list">
                  {stats.projectBreakdown.map(p => (
                    <div key={p.projectId} className="task-project-item">
                      <div className="task-project-info">
                        <div className="task-project-title">
                          <div className="task-project-color-dot" style={{ background: p.color }} />
                          <span>{p.title}</span>
                        </div>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {p.completedTaskCount}/{p.taskCount} tasks ({p.taskPercentage}%)
                        </span>
                      </div>
                      <div className="task-progress-bar-bg" style={{ height: 4 }}>
                        <div
                          className="task-progress-bar-fill"
                          style={{
                            width: `${p.taskPercentage}%`,
                            background: p.color || 'var(--accent-color)'
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Tag Distribution Panel */}
        <div className="stats-panel">
          <h2 className="stats-panel-title">
            <TagIcon size={17} />
            <span>Tag Distribution</span>
          </h2>

          {stats.tagDistribution.length === 0 ? (
            <p className="stats-empty-text">No tags found in this scope. Add #tags to blocks to categorize them.</p>
          ) : (
            <div className="tags-distribution-list">
              {stats.tagDistribution.map(t => (
                <div key={t.tag} className="tag-dist-row">
                  <div className="tag-dist-header">
                    <span className="tag-dist-badge">{t.tag}</span>
                    <span className="tag-dist-count">
                      {t.count} {t.count === 1 ? 'block' : 'blocks'} ({t.percentage}%)
                    </span>
                  </div>
                  <div className="tag-dist-bar-bg">
                    <div
                      className="tag-dist-bar-fill"
                      style={{ width: `${Math.max(4, t.percentage)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Workspace Scope Projects Comparison Table */}
      {scope === 'workspace' && stats.projectBreakdown.length > 0 && (
        <div className="stats-panel" style={{ marginTop: '8px' }}>
          <h2 className="stats-panel-title">
            <BarChart3 size={17} />
            <span>Projects Overview</span>
          </h2>
          <table className="projects-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Blocks</th>
                <th>Words</th>
                <th>Tasks</th>
                <th>Progress</th>
              </tr>
            </thead>
            <tbody>
              {stats.projectBreakdown.map(p => (
                <tr
                  key={p.projectId}
                  style={{ cursor: onSelectProject ? 'pointer' : 'default' }}
                  onClick={() => onSelectProject && onSelectProject(p.projectId)}
                >
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div className="task-project-color-dot" style={{ background: p.color }} />
                      <strong>{p.title}</strong>
                    </div>
                  </td>
                  <td>{p.blockCount}</td>
                  <td>{p.wordCount.toLocaleString()}</td>
                  <td>{p.completedTaskCount} / {p.taskCount}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div className="task-progress-bar-bg" style={{ width: 80, height: 6 }}>
                        <div
                          className="task-progress-bar-fill"
                          style={{ width: `${p.taskPercentage}%`, background: p.color }}
                        />
                      </div>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>{p.taskPercentage}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
