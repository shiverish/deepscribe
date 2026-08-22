import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { AnnotationToolbar, type DrawingTool } from './AnnotationToolbar';
import { createAnnotationBlock } from '../../utils/screenAnnotation';
import { TASK_INBOX_PROJECT_ID } from '../../utils/taskBlocks';
import type { Block } from '../../types';

interface Shape {
  type: DrawingTool;
  color: string;
  lineWidth: number;
  points?: Array<{ x: number; y: number }>;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  badgeNumber?: number;
  text?: string;
}

interface ScreenAnnotationOverlayProps {
  screenshotDataUrl: string;
  onClose: () => void;
  onBlockCreated?: (block: Block) => void;
}

export const ScreenAnnotationOverlay: React.FC<ScreenAnnotationOverlayProps> = ({
  screenshotDataUrl,
  onClose,
  onBlockCreated
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);

  const [activeTool, setActiveTool] = useState<DrawingTool>('arrow');
  const [activeColor, setActiveColor] = useState<string>('#EF4444');
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentShape, setCurrentShape] = useState<Shape | null>(null);
  const [badgeCounter, setBadgeCounter] = useState(1);

  const [kind, setKind] = useState<'task' | 'block'>('task');
  const [isReadyTask, setIsReadyTask] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>(TASK_INBOX_PROJECT_ID);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch available projects
  const projects = useLiveQuery(async () => {
    return await db.projects.filter(p => !p.isTrash).toArray();
  }, []) || [];

  // Set default selected project
  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  // Load background image
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = screenshotDataUrl;
    img.onload = () => {
      bgImageRef.current = img;
      renderCanvas();
    };
  }, [screenshotDataUrl]);

  // Handle Window Resize
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current && containerRef.current) {
        canvasRef.current.width = containerRef.current.clientWidth;
        canvasRef.current.height = containerRef.current.clientHeight;
        renderCanvas();
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const drawShape = useCallback((ctx: CanvasRenderingContext2D, shape: Shape) => {
    ctx.save();
    ctx.strokeStyle = shape.color;
    ctx.fillStyle = shape.color;
    ctx.lineWidth = shape.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (shape.type) {
      case 'pen': {
        if (!shape.points || shape.points.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(shape.points[0].x, shape.points[0].y);
        for (let i = 1; i < shape.points.length; i++) {
          ctx.lineTo(shape.points[i].x, shape.points[i].y);
        }
        ctx.stroke();
        break;
      }
      case 'highlighter': {
        if (!shape.points || shape.points.length < 2) return;
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 18;
        ctx.beginPath();
        ctx.moveTo(shape.points[0].x, shape.points[0].y);
        for (let i = 1; i < shape.points.length; i++) {
          ctx.lineTo(shape.points[i].x, shape.points[i].y);
        }
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'rect': {
        if (shape.startX === undefined || shape.startY === undefined || shape.endX === undefined || shape.endY === undefined) return;
        const x = Math.min(shape.startX, shape.endX);
        const y = Math.min(shape.startY, shape.endY);
        const w = Math.abs(shape.endX - shape.startX);
        const h = Math.abs(shape.endY - shape.startY);
        ctx.strokeRect(x, y, w, h);
        break;
      }
      case 'ellipse': {
        if (shape.startX === undefined || shape.startY === undefined || shape.endX === undefined || shape.endY === undefined) return;
        const cx = (shape.startX + shape.endX) / 2;
        const cy = (shape.startY + shape.endY) / 2;
        const rx = Math.abs(shape.endX - shape.startX) / 2;
        const ry = Math.abs(shape.endY - shape.startY) / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
        ctx.stroke();
        break;
      }
      case 'arrow': {
        if (shape.startX === undefined || shape.startY === undefined || shape.endX === undefined || shape.endY === undefined) return;
        const { startX, startY, endX, endY } = shape;
        const headlen = 16;
        const angle = Math.atan2(endY - startY, endX - startX);

        // Draw main line
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Draw filled arrowhead
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - headlen * Math.cos(angle - Math.PI / 6), endY - headlen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(endX - headlen * Math.cos(angle + Math.PI / 6), endY - headlen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'badge': {
        if (shape.startX === undefined || shape.startY === undefined) return;
        const radius = 16;
        ctx.beginPath();
        ctx.arc(shape.startX, shape.startY, radius, 0, 2 * Math.PI);
        ctx.fill();

        // White border & text
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(shape.badgeNumber || 1), shape.startX, shape.startY);
        break;
      }
      case 'text': {
        if (shape.startX === undefined || shape.startY === undefined || !shape.text) return;
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(shape.text, shape.startX, shape.startY);
        break;
      }
    }
    ctx.restore();
  }, []);

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background image if available
    if (bgImageRef.current) {
      ctx.drawImage(bgImageRef.current, 0, 0, canvas.width, canvas.height);
    }

    // Draw committed shapes
    shapes.forEach(shape => drawShape(ctx, shape));

    // Draw current active drawing shape
    if (currentShape) {
      drawShape(ctx, currentShape);
    }
  }, [shapes, currentShape, drawShape]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Mouse Interactions
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (activeTool === 'badge') {
      const newShape: Shape = {
        type: 'badge',
        color: activeColor,
        lineWidth: 3,
        startX: x,
        startY: y,
        badgeNumber: badgeCounter
      };
      setShapes(prev => [...prev, newShape]);
      setBadgeCounter(prev => prev + 1);
      return;
    }

    if (activeTool === 'text') {
      const text = window.prompt('Voer annotatietekst in:');
      if (text) {
        const newShape: Shape = {
          type: 'text',
          color: activeColor,
          lineWidth: 3,
          startX: x,
          startY: y,
          text
        };
        setShapes(prev => [...prev, newShape]);
      }
      return;
    }

    setIsDrawing(true);
    const initialShape: Shape = {
      type: activeTool,
      color: activeColor,
      lineWidth: activeTool === 'highlighter' ? 18 : 3.5,
      startX: x,
      startY: y,
      endX: x,
      endY: y,
      points: [{ x, y }]
    };
    setCurrentShape(initialShape);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !currentShape) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (activeTool === 'pen' || activeTool === 'highlighter') {
      setCurrentShape(prev => prev ? {
        ...prev,
        points: [...(prev.points || []), { x, y }]
      } : null);
    } else {
      setCurrentShape(prev => prev ? {
        ...prev,
        endX: x,
        endY: y
      } : null);
    }
  };

  const handleMouseUp = () => {
    if (isDrawing && currentShape) {
      setShapes(prev => [...prev, currentShape]);
      setCurrentShape(null);
      setIsDrawing(false);
    }
  };

  const handleUndo = () => {
    setShapes(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    setShapes([]);
    setBadgeCounter(1);
  };

  // Keyboard Shortcuts (Esc to close, Ctrl+Z to undo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Save to DeepScribe
  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);

    try {
      // Export canvas as PNG base64
      const canvas = canvasRef.current;
      let imageBase64 = '';
      if (canvas) {
        const dataUrl = canvas.toDataURL('image/png');
        imageBase64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      }

      const { block } = await createAnnotationBlock({
        projectId: selectedProjectId,
        title: promptText,
        promptText,
        imageBase64,
        kind,
        isReadyTask
      });

      onBlockCreated?.(block);
      onClose();
    } catch (err) {
      console.error('Failed to save screen annotation to DeepScribe:', err);
      alert('Fout bij opslaan van annotatie: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col justify-between overflow-hidden bg-black/40 backdrop-blur-sm select-none"
    >
      {/* Drawing Canvas */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className="absolute inset-0 w-full h-full cursor-crosshair"
      />

      {/* Top Banner Hint */}
      <div className="relative z-10 flex justify-center pt-3 pointer-events-none">
        <div className="bg-[#12121A]/80 border border-[#2D2D3E] text-slate-300 text-xs px-3 py-1.5 rounded-full shadow-lg backdrop-blur-md">
          📸 DeepScribe Schermannotatie • Druk op <kbd className="bg-[#20202E] px-1.5 py-0.5 rounded text-[11px] font-mono">Esc</kbd> om te sluiten
        </div>
      </div>

      {/* Floating Bottom Toolbar */}
      <div className="relative z-10 pb-5 px-4 pointer-events-auto">
        <AnnotationToolbar
          projects={projects}
          selectedProjectId={selectedProjectId}
          onSelectProject={setSelectedProjectId}
          activeTool={activeTool}
          onSelectTool={setActiveTool}
          activeColor={activeColor}
          onSelectColor={setActiveColor}
          kind={kind}
          onChangeKind={setKind}
          isReadyTask={isReadyTask}
          onChangeIsReadyTask={setIsReadyTask}
          promptText={promptText}
          onChangePromptText={setPromptText}
          onUndo={handleUndo}
          onClear={handleClear}
          onSave={handleSave}
          onCancel={onClose}
          isSaving={isSaving}
        />
      </div>
    </div>
  );
};
