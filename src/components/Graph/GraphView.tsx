import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import type { Block, Project } from '../../types';
import {
  buildGraphData,
  type GraphNode,
  type GraphEdge,
  type GraphScope
} from '../../utils/graphData';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Search,
  Folder,
  Layers,
  Link2,
  GitFork,
  Tag as TagIcon,
  EyeOff
} from 'lucide-react';
import './Graph.css';

interface GraphViewProps {
  projects: Project[];
  blocks: Block[];
  activeProjectId: string | null;
  selectedBlockId: string | null;
  onSelectBlock: (blockId: string, projectId: string) => void;
  onSelectProject: (projectId: string) => void;
}

export const GraphView: React.FC<GraphViewProps> = ({
  projects,
  blocks,
  activeProjectId,
  selectedBlockId,
  onSelectBlock,
  onSelectProject
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Filter & scope state
  const [scope, setScope] = useState<GraphScope>('project');
  const [showWikiLinks, setShowWikiLinks] = useState(true);
  const [showHierarchy, setShowHierarchy] = useState(true);
  const [showTags, setShowTags] = useState(true);
  const [showOrphans, setShowOrphans] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Transform state (Pan & Zoom)
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });

  // Hover & selection state
  const [hoveredNode, setHoveredNode] = useState<{ node: GraphNode; screenX: number; screenY: number } | null>(null);

  // Physics simulation nodes & edges
  const simNodesRef = useRef<GraphNode[]>([]);
  const simEdgesRef = useRef<GraphEdge[]>([]);
  const animFrameIdRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const draggedNodeRef = useRef<GraphNode | null>(null);
  const dragStartPosRef = useRef<{ x: number; y: number; moved: boolean }>({ x: 0, y: 0, moved: false });
  const isPanningRef = useRef(false);
  const panStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Build current graph data
  const graphData = useMemo(() => {
    return buildGraphData(projects, blocks, {
      scope,
      activeProjectId,
      showWikiLinks,
      showHierarchy,
      showTags,
      showOrphans,
      searchQuery
    });
  }, [projects, blocks, scope, activeProjectId, showWikiLinks, showHierarchy, showTags, showOrphans, searchQuery]);

  // Synchronize simulation nodes when graph data changes
  useEffect(() => {
    const existingNodeMap = new Map<string, GraphNode>();
    for (const n of simNodesRef.current) {
      existingNodeMap.set(n.id, n);
    }

    const newSimNodes: GraphNode[] = graphData.nodes.map(n => {
      const existing = existingNodeMap.get(n.id);
      if (existing && existing.x !== undefined && existing.y !== undefined) {
        return {
          ...n,
          x: existing.x,
          y: existing.y,
          vx: existing.vx || 0,
          vy: existing.vy || 0
        };
      }
      // Random initial scatter around center
      const angle = Math.random() * Math.PI * 2;
      const radius = 50 + Math.random() * 200;
      return {
        ...n,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2
      };
    });

    simNodesRef.current = newSimNodes;
    simEdgesRef.current = graphData.edges;
  }, [graphData]);

  // Center initial view if needed
  const resetView = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const nextTransform = { x: width / 2, y: height / 2, scale: 0.95 };
    transformRef.current = nextTransform;
    setTransform(nextTransform);
  }, []);

  useEffect(() => {
    resetView();
  }, [scope, resetView]);

  // Force-directed physics loop & Canvas Render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let isRunning = true;

    const stepSimulation = () => {
      const nodes = simNodesRef.current;
      const edges = simEdgesRef.current;
      const nodeMap = new Map<string, GraphNode>(nodes.map(n => [n.id, n]));

      // 1. Repulsion (Coulomb force)
      const repulsionConstant = 1800;
      for (let i = 0; i < nodes.length; i++) {
        const n1 = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const n2 = nodes[j];
          const dx = (n2.x ?? 0) - (n1.x ?? 0);
          const dy = (n2.y ?? 0) - (n1.y ?? 0);
          let distSq = dx * dx + dy * dy;
          if (distSq < 1) distSq = 1;
          const dist = Math.sqrt(distSq);
          if (dist > 450) continue; // Cutoff for speed

          const force = repulsionConstant / distSq;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          if (draggedNodeRef.current !== n1) {
            n1.vx = (n1.vx ?? 0) - fx;
            n1.vy = (n1.vy ?? 0) - fy;
          }
          if (draggedNodeRef.current !== n2) {
            n2.vx = (n2.vx ?? 0) + fx;
            n2.vy = (n2.vy ?? 0) + fy;
          }
        }
      }

      // 2. Spring attraction along edges
      const springConstant = 0.04;
      const restLength = 80;
      for (const edge of edges) {
        const s = nodeMap.get(edge.source);
        const t = nodeMap.get(edge.target);
        if (!s || !t) continue;

        const dx = (t.x ?? 0) - (s.x ?? 0);
        const dy = (t.y ?? 0) - (s.y ?? 0);
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const displacement = dist - restLength;
        const force = displacement * springConstant;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        if (draggedNodeRef.current !== s) {
          s.vx = (s.vx ?? 0) + fx;
          s.vy = (s.vy ?? 0) + fy;
        }
        if (draggedNodeRef.current !== t) {
          t.vx = (t.vx ?? 0) - fx;
          t.vy = (t.vy ?? 0) - fy;
        }
      }

      // 3. Center gravity & velocity integration
      const centerGravity = 0.005;
      const damping = 0.82;
      for (const node of nodes) {
        if (draggedNodeRef.current === node) continue;
        node.vx = ((node.vx ?? 0) - (node.x ?? 0) * centerGravity) * damping;
        node.vy = ((node.vy ?? 0) - (node.y ?? 0) * centerGravity) * damping;

        // Cap max velocity
        const maxV = 15;
        const v = Math.sqrt((node.vx ?? 0) * (node.vx ?? 0) + (node.vy ?? 0) * (node.vy ?? 0));
        if (v > maxV) {
          node.vx = ((node.vx ?? 0) / v) * maxV;
          node.vy = ((node.vy ?? 0) / v) * maxV;
        }

        node.x = (node.x ?? 0) + (node.vx ?? 0);
        node.y = (node.y ?? 0) + (node.vy ?? 0);
      }
    };

    const render = () => {
      if (!canvas || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const { x: panX, y: panY, scale } = transformRef.current;

      ctx.save();
      ctx.translate(panX, panY);
      ctx.scale(scale, scale);

      const nodes = simNodesRef.current;
      const edges = simEdgesRef.current;
      const nodeMap = new Map<string, GraphNode>(nodes.map(n => [n.id, n]));

      // Determine hovered / selected node and their connected neighborhood
      const activeHoveredNode = hoveredNode?.node;
      const connectedNodeIds = new Set<string>();
      if (activeHoveredNode) {
        connectedNodeIds.add(activeHoveredNode.id);
        for (const e of edges) {
          if (e.source === activeHoveredNode.id) connectedNodeIds.add(e.target);
          if (e.target === activeHoveredNode.id) connectedNodeIds.add(e.source);
        }
      }

      // Draw Edges
      for (const edge of edges) {
        const s = nodeMap.get(edge.source);
        const t = nodeMap.get(edge.target);
        if (!s || !t) continue;

        const isHighlighted = activeHoveredNode
          ? (edge.source === activeHoveredNode.id || edge.target === activeHoveredNode.id)
          : false;

        const isDimmed = activeHoveredNode && !isHighlighted;

        ctx.beginPath();
        ctx.moveTo(s.x ?? 0, s.y ?? 0);
        ctx.lineTo(t.x ?? 0, t.y ?? 0);

        if (edge.type === 'wiki-link') {
          ctx.strokeStyle = isHighlighted
            ? '#38bdf8'
            : isDimmed
            ? 'rgba(56, 189, 248, 0.1)'
            : 'rgba(56, 189, 248, 0.45)';
          ctx.lineWidth = isHighlighted ? 2.5 : 1.4;
          ctx.setLineDash([]);
        } else if (edge.type === 'hierarchy') {
          ctx.strokeStyle = isHighlighted
            ? '#ebdec3'
            : isDimmed
            ? 'rgba(235, 222, 195, 0.1)'
            : 'rgba(235, 222, 195, 0.35)';
          ctx.lineWidth = isHighlighted ? 2 : 1.2;
          ctx.setLineDash([4, 4]);
        } else if (edge.type === 'tag') {
          ctx.strokeStyle = isHighlighted
            ? '#eab308'
            : isDimmed
            ? 'rgba(234, 179, 8, 0.1)'
            : 'rgba(234, 179, 8, 0.35)';
          ctx.lineWidth = isHighlighted ? 1.8 : 1;
          ctx.setLineDash([2, 3]);
        } else if (edge.type === 'dependency') {
          ctx.strokeStyle = isHighlighted
            ? '#f59e0b'
            : isDimmed
            ? 'rgba(245, 158, 11, 0.1)'
            : 'rgba(245, 158, 11, 0.45)';
          ctx.lineWidth = isHighlighted ? 2.4 : 1.4;
          ctx.setLineDash([5, 3]);
        } else {
          // Project link
          ctx.strokeStyle = isHighlighted
            ? '#a855f7'
            : isDimmed
            ? 'rgba(168, 85, 247, 0.1)'
            : 'rgba(168, 85, 247, 0.4)';
          ctx.lineWidth = isHighlighted ? 2.5 : 1.6;
          ctx.setLineDash([]);
        }

        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Draw Nodes
      const query = searchQuery.trim().toLowerCase();

      for (const node of nodes) {
        const isSelected = selectedBlockId === node.id;
        const isHovered = activeHoveredNode?.id === node.id;
        const isConnectedToHovered = activeHoveredNode ? connectedNodeIds.has(node.id) : true;
        const isSearchMatch = query ? node.title.toLowerCase().includes(query) : false;

        const alpha = activeHoveredNode ? (isConnectedToHovered ? 1 : 0.25) : 1;
        const radius = node.radius || 10;
        const x = node.x ?? 0;
        const y = node.y ?? 0;

        ctx.save();
        ctx.globalAlpha = alpha;

        // Outer glow/ring for selected or hovered
        if (isSelected || isHovered || isSearchMatch) {
          ctx.beginPath();
          ctx.arc(x, y, radius + (isHovered || isSelected ? 5 : 3), 0, Math.PI * 2);
          ctx.fillStyle = isSelected
            ? 'rgba(235, 222, 195, 0.35)'
            : isSearchMatch
            ? 'rgba(234, 179, 8, 0.35)'
            : 'rgba(56, 189, 248, 0.35)';
          ctx.fill();
        }

        // Main node circle
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);

        if (node.type === 'project') {
          ctx.fillStyle = node.color || '#3b82f6';
        } else if (node.type === 'tag') {
          ctx.fillStyle = '#eab308';
        } else {
          // Block node
          ctx.fillStyle = isSelected
            ? '#ebdec3'
            : (node.color || '#38bdf8');
        }
        ctx.fill();

        // Node border
        ctx.lineWidth = isSelected ? 2.5 : 1.5;
        ctx.strokeStyle = isSelected
          ? '#ffffff'
          : 'rgba(255, 255, 255, 0.3)';
        ctx.stroke();

        // Node Label
        const showLabel = scale > 0.6 || isSelected || isHovered || isSearchMatch || node.type === 'project';
        if (showLabel) {
          ctx.font = isSelected || isHovered || node.type === 'project'
            ? 'bold 11px system-ui, -apple-system, sans-serif'
            : '10px system-ui, -apple-system, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';

          // Text shadow for readability
          ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
          ctx.fillText(node.title, x + 1, y + radius + 5);
          ctx.fillText(node.title, x - 1, y + radius + 5);
          ctx.fillText(node.title, x, y + radius + 6);

          ctx.fillStyle = isSelected
            ? '#ebdec3'
            : isSearchMatch
            ? '#fef08a'
            : '#ffffff';
          ctx.fillText(node.title, x, y + radius + 5);
        }

        ctx.restore();
      }

      ctx.restore();
      ctx.restore();
    };

    const loop = () => {
      if (!isRunning) return;
      stepSimulation();
      render();
      animFrameIdRef.current = requestAnimationFrame(loop);
    };

    animFrameIdRef.current = requestAnimationFrame(loop);

    return () => {
      isRunning = false;
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [hoveredNode, selectedBlockId, searchQuery]);

  // Find node under mouse coordinates
  const getNodeAtCoords = (screenX: number, screenY: number): GraphNode | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const { x: panX, y: panY, scale } = transformRef.current;

    const mouseX = screenX - rect.left;
    const mouseY = screenY - rect.top;

    // Convert screen coords to graph world coords
    const worldX = (mouseX - panX) / scale;
    const worldY = (mouseY - panY) / scale;

    const nodes = simNodesRef.current;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      const dx = (node.x ?? 0) - worldX;
      const dy = (node.y ?? 0) - worldY;
      const radius = (node.radius || 10) + 4; // Add generous hit margin
      if (dx * dx + dy * dy <= radius * radius) {
        return node;
      }
    }
    return null;
  };

  // Mouse / Wheel Event Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const node = getNodeAtCoords(e.clientX, e.clientY);
    if (node) {
      isDraggingRef.current = true;
      draggedNodeRef.current = node;
      dragStartPosRef.current = { x: e.clientX, y: e.clientY, moved: false };
    } else {
      isPanningRef.current = true;
      panStartPosRef.current = {
        x: e.clientX - transformRef.current.x,
        y: e.clientY - transformRef.current.y
      };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDraggingRef.current && draggedNodeRef.current) {
      const node = draggedNodeRef.current;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const { x: panX, y: panY, scale } = transformRef.current;

      const worldX = (e.clientX - rect.left - panX) / scale;
      const worldY = (e.clientY - rect.top - panY) / scale;

      node.x = worldX;
      node.y = worldY;
      node.vx = 0;
      node.vy = 0;

      const dist = Math.hypot(e.clientX - dragStartPosRef.current.x, e.clientY - dragStartPosRef.current.y);
      if (dist > 4) {
        dragStartPosRef.current.moved = true;
      }
    } else if (isPanningRef.current) {
      const nextTransform = {
        ...transformRef.current,
        x: e.clientX - panStartPosRef.current.x,
        y: e.clientY - panStartPosRef.current.y
      };
      transformRef.current = nextTransform;
      setTransform(nextTransform);
    } else {
      // Hover detection
      const node = getNodeAtCoords(e.clientX, e.clientY);
      if (node) {
        const canvas = canvasRef.current;
        const rect = canvas?.getBoundingClientRect();
        setHoveredNode({
          node,
          screenX: e.clientX - (rect?.left || 0),
          screenY: e.clientY - (rect?.top || 0)
        });
      } else {
        setHoveredNode(null);
      }
    }
  };

  const handleMouseUp = (_e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDraggingRef.current && draggedNodeRef.current) {
      if (!dragStartPosRef.current.moved) {
        // Simple click without dragging -> Select node
        const clickedNode = draggedNodeRef.current;
        if (clickedNode.type === 'block') {
          onSelectBlock(clickedNode.id, clickedNode.projectId || activeProjectId || '');
        } else if (clickedNode.type === 'project') {
          onSelectProject(clickedNode.id);
        }
      }
      isDraggingRef.current = false;
      draggedNodeRef.current = null;
    }
    isPanningRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
    const current = transformRef.current;
    const newScale = Math.max(0.15, Math.min(4.0, current.scale * zoomFactor));

    // Zoom centered towards mouse position
    const newX = mouseX - (mouseX - current.x) * (newScale / current.scale);
    const newY = mouseY - (mouseY - current.y) * (newScale / current.scale);

    const nextTransform = { x: newX, y: newY, scale: newScale };
    transformRef.current = nextTransform;
    setTransform(nextTransform);
  };

  const handleZoom = (delta: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const centerX = canvas.clientWidth / 2;
    const centerY = canvas.clientHeight / 2;

    const current = transformRef.current;
    const newScale = Math.max(0.15, Math.min(4.0, current.scale * delta));
    const newX = centerX - (centerX - current.x) * (newScale / current.scale);
    const newY = centerY - (centerY - current.y) * (newScale / current.scale);

    const nextTransform = { x: newX, y: newY, scale: newScale };
    transformRef.current = nextTransform;
    setTransform(nextTransform);
  };

  return (
    <div className="graph-view-container">
      {/* Floating Control Toolbar */}
      <div className="graph-toolbar">
        {/* Left Toolbar Controls */}
        <div className="graph-toolbar-left">
          <div className="graph-scope-switch">
            <button
              type="button"
              className={`graph-scope-btn ${scope === 'project' ? 'active' : ''}`}
              onClick={() => setScope('project')}
              title="View current project relationships"
            >
              <Folder size={13} />
              <span>Current Project</span>
            </button>
            <button
              type="button"
              className={`graph-scope-btn ${scope === 'workspace' ? 'active' : ''}`}
              onClick={() => setScope('workspace')}
              title="View entire workspace graph"
            >
              <Layers size={13} />
              <span>Entire Workspace</span>
            </button>
          </div>

          <div style={{ width: 1, height: 18, background: 'var(--border-subtle)' }} />

          {/* Filter badges */}
          <button
            type="button"
            className={`graph-filter-badge ${showWikiLinks ? 'active' : ''}`}
            onClick={() => setShowWikiLinks(!showWikiLinks)}
            title="Toggle Wiki-link references"
          >
            <Link2 size={13} />
            <span>Wiki-links</span>
          </button>

          <button
            type="button"
            className={`graph-filter-badge ${showHierarchy ? 'active' : ''}`}
            onClick={() => setShowHierarchy(!showHierarchy)}
            title="Toggle Parent-child hierarchy"
          >
            <GitFork size={13} />
            <span>Hierarchy</span>
          </button>

          <button
            type="button"
            className={`graph-filter-badge ${showTags ? 'active' : ''}`}
            onClick={() => setShowTags(!showTags)}
            title="Toggle Tag hubs"
          >
            <TagIcon size={13} />
            <span>Tags</span>
          </button>

          <button
            type="button"
            className={`graph-filter-badge ${showOrphans ? 'active' : ''}`}
            onClick={() => setShowOrphans(!showOrphans)}
            title="Toggle Unlinked / Orphan nodes"
          >
            <EyeOff size={13} />
            <span>Orphans</span>
          </button>
        </div>

        {/* Right Toolbar Controls */}
        <div className="graph-toolbar-right">
          <div className="graph-search-box">
            <Search size={13} style={{ color: 'var(--text-secondary)' }} />
            <input
              type="text"
              className="graph-search-input"
              placeholder="Search graph..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <div style={{ width: 1, height: 18, background: 'var(--border-subtle)' }} />

          <button
            type="button"
            className="graph-tool-btn"
            onClick={() => handleZoom(1.2)}
            title="Zoom In"
          >
            <ZoomIn size={14} />
          </button>

          <button
            type="button"
            className="graph-tool-btn"
            onClick={() => handleZoom(0.83)}
            title="Zoom Out"
          >
            <ZoomOut size={14} />
          </button>

          <button
            type="button"
            className="graph-tool-btn"
            onClick={resetView}
            title="Reset View"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {/* Main Canvas */}
      <canvas
        ref={canvasRef}
        className="graph-canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
      />

      {/* Bottom Left Stats Indicator */}
      <div className="graph-stats-overlay">
        <div className="graph-stats-item">
          <span>Nodes:</span>
          <strong>{graphData.nodes.length}</strong>
        </div>
        <div className="graph-stats-item">
          <span>Connections:</span>
          <strong>{graphData.edges.length}</strong>
        </div>
        <div className="graph-stats-item">
          <span>Zoom:</span>
          <strong>{Math.round(transform.scale * 100)}%</strong>
        </div>
      </div>

      {/* Node Tooltip on Hover */}
      {hoveredNode && (
        <div
          className="graph-tooltip"
          style={{ left: hoveredNode.screenX, top: hoveredNode.screenY }}
        >
          <div className="graph-tooltip-title">{hoveredNode.node.title}</div>
          <div className="graph-tooltip-meta">
            <span>Type: {hoveredNode.node.type}</span>
            <span>Links: {hoveredNode.node.connectionCount}</span>
            {hoveredNode.node.wordCount > 0 && <span>{hoveredNode.node.wordCount} words</span>}
          </div>
          {hoveredNode.node.tags && hoveredNode.node.tags.length > 0 && (
            <div className="graph-tooltip-tags">
              {hoveredNode.node.tags.map(t => (
                <span key={t} className="graph-tooltip-tag">{t}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
