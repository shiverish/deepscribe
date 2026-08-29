import React, { useMemo, useState } from 'react';
import type { Block, BlockLink, Project } from '../../types';
import { buildGraphNeighbourhood, GRAPH_EDGE_TYPES, type GraphEdgeType, type GraphNode } from '../../utils/graphNeighbourhood';
import { resolveWikiLinkTargets } from '../../../mcp/core/links.mjs';
import { Crosshair, ExternalLink, Network } from 'lucide-react';
import './Graph.css';

interface GraphViewProps {
  blocks: Block[];
  projects: Project[];
  links: BlockLink[];
  /** Block the view centres on when it opens. */
  activeBlockId: string | null;
  onOpenBlock: (blockId: string) => void;
}

const RELATION_TYPES: GraphEdgeType[] = GRAPH_EDGE_TYPES.filter(type => type !== 'depends-on');
const NODE_WIDTH = 124;
const NODE_HEIGHT = 44;

/** Dashed for a derived dependency, solid for a relation someone recorded. */
function edgeDash(type: GraphEdgeType): string | undefined {
  if (type === 'depends-on') return '5 4';
  if (type === 'contradicts') return '2 3';
  return undefined;
}

export const GraphView: React.FC<GraphViewProps> = ({ blocks, projects, links, activeBlockId, onOpenBlock }) => {
  const [centerId, setCenterId] = useState<string | null>(activeBlockId);
  const [depth, setDepth] = useState(1);
  const [includeDependencies, setIncludeDependencies] = useState(true);
  const [crossProjectOnly, setCrossProjectOnly] = useState(false);
  const [activeTypes, setActiveTypes] = useState<GraphEdgeType[]>(RELATION_TYPES);

  const effectiveCenterId = centerId ?? activeBlockId;
  const centerBlock = useMemo(
    () => blocks.find(block => block.id === effectiveCenterId) ?? null,
    [blocks, effectiveCenterId]
  );

  const graph = useMemo(() => {
    if (!effectiveCenterId) return { nodes: [], edges: [], hiddenCount: 0 };
    const types = includeDependencies ? [...activeTypes, 'depends-on' as GraphEdgeType] : activeTypes;
    return buildGraphNeighbourhood(effectiveCenterId, blocks, links, projects, {
      depth, types, includeDependencies, crossProjectOnly
    });
  }, [effectiveCenterId, blocks, links, projects, depth, activeTypes, includeDependencies, crossProjectOnly]);

  const unresolved = useMemo(() => {
    if (!centerBlock) return [];
    return resolveWikiLinkTargets(centerBlock, blocks).unresolved;
  }, [centerBlock, blocks]);

  const positions = useMemo(
    () => new Map(graph.nodes.map(node => [node.block.id, node])),
    [graph.nodes]
  );

  const bounds = useMemo(() => {
    if (graph.nodes.length === 0) return { minX: -300, minY: -200, width: 600, height: 400 };
    const padding = 110;
    const xs = graph.nodes.map(node => node.x);
    const ys = graph.nodes.map(node => node.y);
    const minX = Math.min(...xs) - padding;
    const minY = Math.min(...ys) - padding;
    return {
      minX, minY,
      width: Math.max(...xs) - minX + padding,
      height: Math.max(...ys) - minY + padding
    };
  }, [graph.nodes]);

  const toggleType = (type: GraphEdgeType) => {
    setActiveTypes(current => current.includes(type)
      ? current.filter(item => item !== type)
      : [...current, type]);
  };

  if (!centerBlock) {
    return (
      <div className="graph-empty">
        <Network size={28} />
        <p>Open a block to see what it connects to.</p>
      </div>
    );
  }

  const neighbourCount = graph.nodes.length - 1;

  return (
    <div className="graph-view">
      <div className="graph-toolbar">
        <div className="graph-center-label">
          <Network size={14} />
          <strong>{centerBlock.title}</strong>
          <span>{neighbourCount} connected{graph.hiddenCount > 0 ? `, ${graph.hiddenCount} more not shown` : ''}</span>
        </div>

        <div className="graph-controls">
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
        </div>
      </div>

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

      {neighbourCount === 0 ? (
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
      ) : (
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
                {node.block.title.length > 18 ? `${node.block.title.slice(0, 17)}…` : node.block.title}
              </text>
              {node.crossProject && node.projectTitle && (
                <text x={NODE_WIDTH / 2} y={32} textAnchor="middle" className="graph-node-project">
                  {node.projectTitle.length > 20 ? `${node.projectTitle.slice(0, 19)}…` : node.projectTitle}
                </text>
              )}
              <foreignObject x={NODE_WIDTH - 44} y={NODE_HEIGHT - 18} width={42} height={18}>
                <div className="graph-node-actions">
                  <button type="button" title="Open this block" onClick={() => onOpenBlock(node.block.id)}>
                    <ExternalLink size={11} />
                  </button>
                  {node.distance > 0 && (
                    <button type="button" title="Centre on this block" onClick={() => setCenterId(node.block.id)}>
                      <Crosshair size={11} />
                    </button>
                  )}
                </div>
              </foreignObject>
            </g>
          ))}
        </svg>
      )}
    </div>
  );
};
