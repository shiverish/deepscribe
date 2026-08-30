import React, { useMemo, useState } from 'react';
import type { Block, BlockLink, Project } from '../../types';
import { buildGraphNeighbourhood, GRAPH_EDGE_TYPES, type GraphEdgeType, type GraphNode } from '../../utils/graphNeighbourhood';
import { buildProjectHubs, buildProjectOverview, findLooseEnds } from '../../utils/graphOverview';
import { resolveWikiLinkTargets } from '../../../mcp/core/links.mjs';
import { Crosshair, ExternalLink, Layers, Network, Unlink } from 'lucide-react';
import './Graph.css';

interface GraphViewProps {
  blocks: Block[];
  projects: Project[];
  links: BlockLink[];
  /** Block that is open elsewhere in the app, offered as a shortcut. */
  activeBlockId: string | null;
  onOpenBlock: (blockId: string) => void;
}

/**
 * Three levels of zoom. The graph opens on the workspace, because arriving at
 * whichever block happened to be open answers a question you can only ask once
 * you already know where to look.
 */
type ZoomLevel = 'workspace' | 'project' | 'block';

const RELATION_TYPES: GraphEdgeType[] = GRAPH_EDGE_TYPES.filter(type => type !== 'depends-on');
const NODE_WIDTH = 124;
const NODE_HEIGHT = 44;
const PROJECT_NODE_WIDTH = 168;
const PROJECT_NODE_HEIGHT = 62;

/** Dashed for a derived dependency, solid for a relation someone recorded. */
function edgeDash(type: GraphEdgeType): string | undefined {
  if (type === 'depends-on') return '5 4';
  if (type === 'contradicts') return '2 3';
  return undefined;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Frames whatever is on the canvas, so every level fills the same viewport. */
function boundsOf(points: Array<{ x: number; y: number }>, padding: number) {
  if (points.length === 0) return { minX: -300, minY: -200, width: 600, height: 400 };
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  const minX = Math.min(...xs) - padding;
  const minY = Math.min(...ys) - padding;
  return {
    minX, minY,
    width: Math.max(...xs) - minX + padding,
    height: Math.max(...ys) - minY + padding
  };
}

export const GraphView: React.FC<GraphViewProps> = ({ blocks, projects, links, activeBlockId, onOpenBlock }) => {
  const [level, setLevel] = useState<ZoomLevel>('workspace');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [centerId, setCenterId] = useState<string | null>(null);
  const [showLooseEnds, setShowLooseEnds] = useState(false);
  const [depth, setDepth] = useState(1);
  const [includeDependencies, setIncludeDependencies] = useState(true);
  const [crossProjectOnly, setCrossProjectOnly] = useState(false);
  const [activeTypes, setActiveTypes] = useState<GraphEdgeType[]>(RELATION_TYPES);

  const activeBlock = useMemo(
    () => blocks.find(block => block.id === activeBlockId) ?? null,
    [blocks, activeBlockId]
  );
  const centerBlock = useMemo(
    () => blocks.find(block => block.id === centerId) ?? null,
    [blocks, centerId]
  );

  const overview = useMemo(
    () => buildProjectOverview(blocks, links, projects),
    [blocks, links, projects]
  );

  const hubs = useMemo(
    () => (projectId ? buildProjectHubs(projectId, blocks, links, projects) : null),
    [projectId, blocks, links, projects]
  );

  const neighbourhood = useMemo(() => {
    if (!centerId) return { nodes: [], edges: [], hiddenCount: 0 };
    const types = includeDependencies ? [...activeTypes, 'depends-on' as GraphEdgeType] : activeTypes;
    return buildGraphNeighbourhood(centerId, blocks, links, projects, {
      depth, types, includeDependencies, crossProjectOnly
    });
  }, [centerId, blocks, links, projects, depth, activeTypes, includeDependencies, crossProjectOnly]);

  // Scoped to what you are looking at: the whole workspace, or one project.
  const looseEnds = useMemo(
    () => findLooseEnds(blocks, links, projects, {
      projectId: level === 'workspace' ? null : projectId
    }),
    [blocks, links, projects, level, projectId]
  );

  const unresolvedHere = useMemo(() => {
    if (!centerBlock) return [];
    return resolveWikiLinkTargets(centerBlock, blocks).unresolved;
  }, [centerBlock, blocks]);

  const openProject = (id: string) => {
    setProjectId(id);
    setCenterId(null);
    setLevel('project');
  };

  const openNeighbourhood = (blockId: string) => {
    const block = blocks.find(candidate => candidate.id === blockId);
    if (block) setProjectId(block.projectId);
    setCenterId(blockId);
    setLevel('block');
  };

  const toggleType = (type: GraphEdgeType) => {
    setActiveTypes(current => current.includes(type)
      ? current.filter(item => item !== type)
      : [...current, type]);
  };

  const looseEndCount = looseEnds.orphans.length + looseEnds.danglingReferences.length;
  const currentProject = hubs?.project ?? null;

  const breadcrumb = (
    <div className="graph-breadcrumb">
      <button
        type="button"
        className={level === 'workspace' ? 'active' : ''}
        onClick={() => { setLevel('workspace'); setProjectId(null); setCenterId(null); }}
      >
        <Layers size={13} /> Workspace
      </button>
      {currentProject && (
        <>
          <span aria-hidden="true">/</span>
          <button
            type="button"
            className={level === 'project' ? 'active' : ''}
            onClick={() => openProject(currentProject.id)}
          >
            {truncate(currentProject.title, 28)}
          </button>
        </>
      )}
      {level === 'block' && centerBlock && (
        <>
          <span aria-hidden="true">/</span>
          <button type="button" className="active" disabled>
            {truncate(centerBlock.title, 28)}
          </button>
        </>
      )}
    </div>
  );

  const summary = level === 'workspace'
    ? `${overview.nodes.length} projects${overview.hiddenCount > 0 ? `, ${overview.hiddenCount} more not shown` : ''}`
    : level === 'project'
      ? `${hubs?.nodes.length ?? 0} connected${hubs?.hiddenCount ? `, ${hubs.hiddenCount} more` : ''}${hubs?.orphanCount ? ` · ${hubs.orphanCount} unlinked` : ''}`
      : `${neighbourhood.nodes.length - 1} connected${neighbourhood.hiddenCount > 0 ? `, ${neighbourhood.hiddenCount} more not shown` : ''}`;

  return (
    <div className="graph-view">
      <div className="graph-toolbar">
        <div className="graph-center-label">
          <Network size={14} />
          {breadcrumb}
          <span>{summary}</span>
        </div>

        <div className="graph-controls">
          {level === 'workspace' && activeBlock && (
            <button
              type="button"
              className="graph-jump"
              onClick={() => openNeighbourhood(activeBlock.id)}
            >
              <Crosshair size={12} /> {truncate(activeBlock.title, 22)}
            </button>
          )}

          {level === 'block' && (
            <>
              <label>
                Depth
                <select value={depth} onChange={event => setDepth(Number(event.target.value))}>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                </select>
              </label>

              <label className="graph-toggle">
                <input
                  type="checkbox"
                  checked={includeDependencies}
                  onChange={event => setIncludeDependencies(event.target.checked)}
                />
                Dependencies
              </label>

              <label className="graph-toggle">
                <input
                  type="checkbox"
                  checked={crossProjectOnly}
                  onChange={event => setCrossProjectOnly(event.target.checked)}
                />
                Across projects only
              </label>
            </>
          )}

          <button
            type="button"
            className={`graph-jump ${showLooseEnds ? 'active' : ''}`}
            onClick={() => setShowLooseEnds(current => !current)}
          >
            <Unlink size={12} /> Loose ends{looseEndCount > 0 ? ` (${looseEndCount})` : ''}
          </button>
        </div>
      </div>

      {level === 'block' && (
        <div className="graph-type-filters">
          {RELATION_TYPES.map(type => (
            <button
              key={type}
              type="button"
              className={`graph-type-chip ${activeTypes.includes(type) ? 'active' : ''}`}
              onClick={() => toggleType(type)}
            >
              {type}
            </button>
          ))}
        </div>
      )}

      <div className="graph-body">
        {level === 'workspace' && <WorkspaceCanvas overview={overview} onOpenProject={openProject} />}
        {level === 'project' && hubs && (
          <ProjectCanvas hubs={hubs} onOpenBlock={onOpenBlock} onCentre={openNeighbourhood} />
        )}
        {level === 'block' && (centerBlock ? (
          <NeighbourhoodCanvas
            centerBlock={centerBlock}
            graph={neighbourhood}
            unresolved={unresolvedHere}
            onOpenBlock={onOpenBlock}
            onCentre={openNeighbourhood}
          />
        ) : (
          // The block was deleted or trashed while it was on screen.
          <div className="graph-empty">
            <Network size={28} />
            <p>That block is gone.</p>
            <p className="graph-empty-help">Step back up to the project or the workspace to pick another.</p>
          </div>
        ))}

        {showLooseEnds && (
          <aside className="graph-loose-ends">
            <h3>Loose ends</h3>
            <p className="graph-loose-scope">
              {level === 'workspace' ? 'Across the workspace' : `In ${currentProject?.title ?? 'this project'}`}
            </p>

            <h4>Nothing links here ({looseEnds.orphans.length})</h4>
            {looseEnds.orphans.length === 0
              ? <p className="graph-loose-none">Every block is connected.</p>
              : (
                <ul>
                  {looseEnds.orphans.map(entry => (
                    <li key={entry.block.id}>
                      <button type="button" onClick={() => onOpenBlock(entry.block.id)}>
                        {truncate(entry.block.title, 34)}
                      </button>
                      {level === 'workspace' && entry.projectTitle && <span>{entry.projectTitle}</span>}
                    </li>
                  ))}
                </ul>
              )}

            <h4>References that go nowhere ({looseEnds.danglingReferences.length})</h4>
            {looseEnds.danglingReferences.length === 0
              ? <p className="graph-loose-none">Every reference resolves.</p>
              : (
                <ul>
                  {looseEnds.danglingReferences.map(entry => (
                    <li key={entry.block.id}>
                      <button type="button" onClick={() => onOpenBlock(entry.block.id)}>
                        {truncate(entry.block.title, 34)}
                      </button>
                      <span>
                        {[...entry.unresolved.map(title => `[[${title}]] missing`),
                          ...entry.ambiguous.map(title => `[[${title}]] ambiguous`)].join(', ')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
          </aside>
        )}
      </div>
    </div>
  );
};

const WorkspaceCanvas: React.FC<{
  overview: ReturnType<typeof buildProjectOverview>;
  onOpenProject: (projectId: string) => void;
}> = ({ overview, onOpenProject }) => {
  const positions = useMemo(
    () => new Map(overview.nodes.map(node => [node.project.id, node])),
    [overview.nodes]
  );
  const bounds = useMemo(() => boundsOf(overview.nodes, 95), [overview.nodes]);
  const heaviest = Math.max(1, ...overview.edges.map(edge => edge.weight));

  if (overview.nodes.length === 0) {
    return (
      <div className="graph-empty">
        <Layers size={28} />
        <p>No projects to show yet.</p>
      </div>
    );
  }

  return (
    <svg
      className="graph-canvas"
      viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
      role="img"
      aria-label="Projects and how strongly they are connected"
    >
      {overview.edges.map(edge => {
        const source = positions.get(edge.sourceId);
        const target = positions.get(edge.targetId);
        if (!source || !target) return null;
        return (
          <line
            key={`${edge.sourceId}-${edge.targetId}`}
            x1={source.x} y1={source.y} x2={target.x} y2={target.y}
            className="graph-edge cross-project"
            strokeWidth={1.5 + (edge.weight / heaviest) * 4}
          >
            <title>{`${edge.weight} relation${edge.weight === 1 ? '' : 's'} between these projects`}</title>
          </line>
        );
      })}

      {overview.nodes.map(node => (
        <g
          key={node.project.id}
          transform={`translate(${node.x - PROJECT_NODE_WIDTH / 2}, ${node.y - PROJECT_NODE_HEIGHT / 2})`}
          className="graph-node graph-project-node"
          role="button"
          tabIndex={0}
          onClick={() => onOpenProject(node.project.id)}
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') onOpenProject(node.project.id); }}
        >
          <title>{`${node.project.title}\n${node.blockCount} blocks, ${node.linkCount} relations, ${node.crossProjectCount} reaching another project`}</title>
          <rect width={PROJECT_NODE_WIDTH} height={PROJECT_NODE_HEIGHT} rx={10} />
          <rect width={4} height={PROJECT_NODE_HEIGHT} rx={2} fill={node.project.color} />
          <text x={PROJECT_NODE_WIDTH / 2} y={26} textAnchor="middle" className="graph-node-title">
            {truncate(node.project.title, 22)}
          </text>
          <text x={PROJECT_NODE_WIDTH / 2} y={44} textAnchor="middle" className="graph-node-project">
            {node.blockCount} blocks · {node.linkCount} relations
          </text>
        </g>
      ))}
    </svg>
  );
};

const ProjectCanvas: React.FC<{
  hubs: NonNullable<ReturnType<typeof buildProjectHubs>>;
  onOpenBlock: (blockId: string) => void;
  onCentre: (blockId: string) => void;
}> = ({ hubs, onOpenBlock, onCentre }) => {
  const positions = useMemo(
    () => new Map(hubs.nodes.map(node => [node.block.id, node])),
    [hubs.nodes]
  );
  const bounds = useMemo(() => boundsOf(hubs.nodes, 110), [hubs.nodes]);

  if (hubs.nodes.length === 0) {
    return (
      <div className="graph-empty">
        <Network size={28} />
        <p>Nothing in “{hubs.project?.title ?? 'this project'}” is linked yet.</p>
        <p className="graph-empty-help">
          Write <code>[[Block title]]</code> in the text to link another block, or let an agent record one.
        </p>
      </div>
    );
  }

  const busiest = Math.max(1, ...hubs.nodes.map(node => node.degree));

  return (
    <svg
      className="graph-canvas"
      viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
      role="img"
      aria-label={`Best connected blocks in ${hubs.project?.title ?? 'this project'}`}
    >
      <defs>
        <marker id="graph-arrow-hub" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" fill="var(--border-strong, #64748B)" />
        </marker>
      </defs>

      {hubs.edges.map(edge => {
        const source = positions.get(edge.sourceId);
        const target = positions.get(edge.targetId);
        if (!source || !target) return null;
        return (
          <line
            key={`${edge.sourceId}-${edge.targetId}-${edge.type}`}
            x1={source.x} y1={source.y} x2={target.x} y2={target.y}
            className="graph-edge"
            strokeDasharray={edgeDash(edge.type)}
            markerEnd="url(#graph-arrow-hub)"
          >
            <title>{edge.type}</title>
          </line>
        );
      })}

      {hubs.nodes.map(node => (
        <g
          key={node.block.id}
          transform={`translate(${node.x - NODE_WIDTH / 2}, ${node.y - NODE_HEIGHT / 2})`}
          className={`graph-node ${node.degree === busiest ? 'center' : ''}`}
        >
          <title>{`${node.block.title}\n${node.degree} relation${node.degree === 1 ? '' : 's'}\n${node.block.plainText.slice(0, 160)}`}</title>
          <rect width={NODE_WIDTH} height={NODE_HEIGHT} rx={8} />
          <text x={NODE_WIDTH / 2} y={19} textAnchor="middle" className="graph-node-title">
            {truncate(node.block.title, 18)}
          </text>
          <text x={NODE_WIDTH / 2} y={32} textAnchor="middle" className="graph-node-project">
            {node.degree} relation{node.degree === 1 ? '' : 's'}
          </text>
          <foreignObject x={NODE_WIDTH - 44} y={NODE_HEIGHT - 18} width={42} height={18}>
            <div className="graph-node-actions">
              <button type="button" title="Open this block" onClick={() => onOpenBlock(node.block.id)}>
                <ExternalLink size={11} />
              </button>
              <button type="button" title="Centre on this block" onClick={() => onCentre(node.block.id)}>
                <Crosshair size={11} />
              </button>
            </div>
          </foreignObject>
        </g>
      ))}
    </svg>
  );
};

const NeighbourhoodCanvas: React.FC<{
  centerBlock: Block;
  graph: ReturnType<typeof buildGraphNeighbourhood>;
  unresolved: string[];
  onOpenBlock: (blockId: string) => void;
  onCentre: (blockId: string) => void;
}> = ({ centerBlock, graph, unresolved, onOpenBlock, onCentre }) => {
  const positions = useMemo(
    () => new Map(graph.nodes.map(node => [node.block.id, node])),
    [graph.nodes]
  );
  const bounds = useMemo(() => boundsOf(graph.nodes, 110), [graph.nodes]);

  if (graph.nodes.length <= 1) {
    return (
      <div className="graph-empty">
        <Network size={28} />
        <p>“{centerBlock.title}” has no relations yet.</p>
        <p className="graph-empty-help">
          Write <code>[[Block title]]</code> in the text to link another block, or let an agent record one.
        </p>
        {unresolved.length > 0 && (
          <p className="graph-empty-help">
            Unresolved references in this block: {unresolved.map(title => `[[${title}]]`).join(', ')}.
            They point at a title that does not exist, or one that more than one block carries.
          </p>
        )}
      </div>
    );
  }

  return (
    <svg
      className="graph-canvas"
      viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
      role="img"
      aria-label={`Relations around ${centerBlock.title}`}
    >
      <defs>
        <marker id="graph-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" fill="var(--border-strong, #64748B)" />
        </marker>
      </defs>

      {graph.edges.map(edge => {
        const source = positions.get(edge.sourceId);
        const target = positions.get(edge.targetId);
        if (!source || !target) return null;
        return (
          <line
            key={`${edge.sourceId}-${edge.targetId}-${edge.type}`}
            x1={source.x} y1={source.y} x2={target.x} y2={target.y}
            className={`graph-edge ${edge.crossProject ? 'cross-project' : ''}`}
            strokeDasharray={edgeDash(edge.type)}
            markerEnd="url(#graph-arrow)"
          >
            <title>{`${edge.type}${edge.crossProject ? ' (across projects)' : ''}`}</title>
          </line>
        );
      })}

      {graph.nodes.map((node: GraphNode) => (
        <g
          key={node.block.id}
          transform={`translate(${node.x - NODE_WIDTH / 2}, ${node.y - NODE_HEIGHT / 2})`}
          className={`graph-node ${node.distance === 0 ? 'center' : ''} ${node.crossProject ? 'cross-project' : ''}`}
        >
          <title>
            {`${node.block.title}${node.projectTitle ? ` — ${node.projectTitle}` : ''}\n${node.block.plainText.slice(0, 160)}`}
          </title>
          <rect width={NODE_WIDTH} height={NODE_HEIGHT} rx={8} />
          {node.crossProject && node.projectColor && (
            <rect width={3} height={NODE_HEIGHT} rx={2} fill={node.projectColor} />
          )}
          <text x={NODE_WIDTH / 2} y={node.crossProject ? 19 : 26} textAnchor="middle" className="graph-node-title">
            {truncate(node.block.title, 18)}
          </text>
          {node.crossProject && node.projectTitle && (
            <text x={NODE_WIDTH / 2} y={32} textAnchor="middle" className="graph-node-project">
              {truncate(node.projectTitle, 20)}
            </text>
          )}
          <foreignObject x={NODE_WIDTH - 44} y={NODE_HEIGHT - 18} width={42} height={18}>
            <div className="graph-node-actions">
              <button type="button" title="Open this block" onClick={() => onOpenBlock(node.block.id)}>
                <ExternalLink size={11} />
              </button>
              {node.distance > 0 && (
                <button type="button" title="Centre on this block" onClick={() => onCentre(node.block.id)}>
                  <Crosshair size={11} />
                </button>
              )}
            </div>
          </foreignObject>
        </g>
      ))}
    </svg>
  );
};
