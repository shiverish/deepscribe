import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { AnnotationToolbar, type DrawingTool, type StrokeWidthLevel } from './AnnotationToolbar';
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

interface CropRegion {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface ScreenAnnotationOverlayProps {
  screenshotDataUrl?: string;
  isStandaloneOverlay?: boolean;
  onClose: () => void;
  onBlockCreated?: (block: Block) => void;
}

export const ScreenAnnotationOverlay: React.FC<ScreenAnnotationOverlayProps> = ({
  screenshotDataUrl: initialScreenshotDataUrl,
  isStandaloneOverlay = false,
  onClose,
  onBlockCreated
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);

  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string>(initialScreenshotDataUrl || '');
  const [activeTool, setActiveTool] = useState<DrawingTool>('arrow');
  const [activeColor, setActiveColor] = useState<string>('#EF4444');
  const [strokeWidthLevel, setStrokeWidthLevel] = useState<StrokeWidthLevel>('medium');
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentShape, setCurrentShape] = useState<Shape | null>(null);
  const [badgeCounter, setBadgeCounter] = useState(1);
  const [cropRegion, setCropRegion] = useState<CropRegion | null>(null);

  // Inline text editing state
  const [inlineTextInput, setInlineTextInput] = useState<{ x: number; y: number; screenX: number; screenY: number; text: string } | null>(null);
  const inlineInputRef = useRef<HTMLInputElement | null>(null);

  const [kind, setKind] = useState<'task' | 'block'>('task');
  const [isReadyTask, setIsReadyTask] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>(TASK_INBOX_PROJECT_ID);
  const [isSaving, setIsSaving] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);

  // Standalone overlay mode body styling
  useEffect(() => {
    if (isStandaloneOverlay) {
      document.body.classList.add('overlay-mode');
      return () => {
        document.body.classList.remove('overlay-mode');
      };
    }
  }, [isStandaloneOverlay]);

  // If no screenshot passed in props, query electron for pending overlay data
  useEffect(() => {
    if (!screenshotDataUrl && window.electronAPI?.screenCapture?.getOverlayData) {
      window.electronAPI.screenCapture.getOverlayData().then(data => {
        if (data?.screenshotDataUrl) {
          setScreenshotDataUrl(data.screenshotDataUrl);
        }
      }).catch(err => {
        console.warn('Failed to retrieve overlay data:', err);
      });
    }

    if (window.electronAPI?.screenCapture?.onTriggerOverlay) {
      return window.electronAPI.screenCapture.onTriggerOverlay(data => {
        if (data?.screenshotDataUrl) {
          setScreenshotDataUrl(data.screenshotDataUrl);
        }
      });
    }
  }, [screenshotDataUrl]);

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
    if (!screenshotDataUrl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = screenshotDataUrl;
    img.onload = () => {
      bgImageRef.current = img;
      renderCanvas();
    };
  }, [screenshotDataUrl]);

  // Handle Resize & Canvas DPI Setup
  const updateCanvasDimensions = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    renderCanvas();
  }, []);

  useEffect(() => {
    window.addEventListener('resize', updateCanvasDimensions);
    updateCanvasDimensions();
    return () => window.removeEventListener('resize', updateCanvasDimensions);
  }, [updateCanvasDimensions]);

  const getStrokeWidthPixels = useCallback(() => {
    const dpr = window.devicePixelRatio || 1;
    switch (strokeWidthLevel) {
      case 'thin': return 2.5 * dpr;
      case 'bold': return 7.5 * dpr;
      default: return 4.5 * dpr;
    }
  }, [strokeWidthLevel]);

  const drawShape = useCallback((ctx: CanvasRenderingContext2D, shape: Shape) => {
    const dpr = window.devicePixelRatio || 1;
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
        ctx.lineWidth = 22 * dpr;
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

        // Subtle shaded inner fill
        ctx.save();
        ctx.fillStyle = shape.color;
        ctx.globalAlpha = 0.12;
        ctx.fillRect(x, y, w, h);
        ctx.restore();

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
        const headlen = Math.max(14 * dpr, shape.lineWidth * 3.5);
        const angle = Math.atan2(endY - startY, endX - startX);

        // Main line
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Arrowhead
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
        const radius = 15 * dpr;

        // Shadow
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 8 * dpr;
        ctx.shadowOffsetY = 2 * dpr;

        ctx.beginPath();
        ctx.arc(shape.startX, shape.startY, radius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.restore();

        // White border
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2 * dpr;
        ctx.stroke();

        // White numeral
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold ${Math.round(14 * dpr)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(shape.badgeNumber || 1), shape.startX, shape.startY);
        break;
      }
      case 'text': {
        if (shape.startX === undefined || shape.startY === undefined || !shape.text) return;
        const fontSize = Math.round(16 * dpr);
        ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;

        const metrics = ctx.measureText(shape.text);
        const padX = 8 * dpr;
        const padY = 5 * dpr;
        const textH = fontSize;
        const boxX = shape.startX - padX;
        const boxY = shape.startY - textH - padY;
        const boxW = metrics.width + padX * 2;
        const boxH = textH + padY * 2;

        // Background pill
        ctx.save();
        ctx.fillStyle = 'rgba(15, 15, 22, 0.85)';
        ctx.strokeStyle = shape.color;
        ctx.lineWidth = 1.5 * dpr;
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxW, boxH, 6 * dpr);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Text
        ctx.fillStyle = shape.color;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
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
    const dpr = window.devicePixelRatio || 1;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw freeze-frame screenshot background
    if (bgImageRef.current) {
      ctx.drawImage(bgImageRef.current, 0, 0, canvas.width, canvas.height);
    }

    // 2. Draw committed shapes
    shapes.forEach(shape => drawShape(ctx, shape));

    // 3. Draw active drawing shape
    if (currentShape) {
      drawShape(ctx, currentShape);
    }

    // 4. Draw Crop Overlay if active
    if (cropRegion) {
      const minX = Math.min(cropRegion.startX, cropRegion.endX);
      const minY = Math.min(cropRegion.startY, cropRegion.endY);
      const w = Math.abs(cropRegion.endX - cropRegion.startX);
      const h = Math.abs(cropRegion.endY - cropRegion.startY);

      // Darken outside crop region
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      // Top
      ctx.fillRect(0, 0, canvas.width, minY);
      // Bottom
      ctx.fillRect(0, minY + h, canvas.width, canvas.height - (minY + h));
      // Left
      ctx.fillRect(0, minY, minX, h);
      // Right
      ctx.fillRect(minX + w, minY, canvas.width - (minX + w), h);

      // Crop border
      ctx.strokeStyle = '#3B82F6';
      ctx.lineWidth = 2 * dpr;
      ctx.setLineDash([6 * dpr, 4 * dpr]);
      ctx.strokeRect(minX, minY, w, h);

      // Dimensions badge
      if (w > 40 && h > 20) {
        const text = `${Math.round(w / dpr)} × ${Math.round(h / dpr)}`;
        ctx.font = `bold ${Math.round(12 * dpr)}px sans-serif`;
        ctx.fillStyle = 'rgba(20, 20, 30, 0.9)';
        ctx.fillRect(minX + 8 * dpr, minY + 8 * dpr, 90 * dpr, 22 * dpr);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(text, minX + 14 * dpr, minY + 24 * dpr);
      }
      ctx.restore();
    }
  }, [shapes, currentShape, cropRegion, drawShape]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Coordinate helper
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (!rect) return { x: 0, y: 0, screenX: 0, screenY: 0 };
    return {
      x: (e.clientX - rect.left) * dpr,
      y: (e.clientY - rect.top) * dpr,
      screenX: e.clientX,
      screenY: e.clientY
    };
  };

  // Mouse Interactions
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // If inline text is open, commit it first
    if (inlineTextInput) {
      commitInlineText();
      return;
    }

    const { x, y, screenX, screenY } = getCanvasCoords(e);
    const lineWidth = getStrokeWidthPixels();

    if (activeTool === 'badge') {
      const newShape: Shape = {
        type: 'badge',
        color: activeColor,
        lineWidth,
        startX: x,
        startY: y,
        badgeNumber: badgeCounter
      };
      setShapes(prev => [...prev, newShape]);
      setBadgeCounter(prev => prev + 1);
      return;
    }

    if (activeTool === 'text') {
      setInlineTextInput({ x, y, screenX, screenY, text: '' });
      setTimeout(() => inlineInputRef.current?.focus(), 50);
      return;
    }

    if (activeTool === 'crop') {
      setIsDrawing(true);
      setCropRegion({ startX: x, startY: y, endX: x, endY: y });
      return;
    }

    setIsDrawing(true);
    const initialShape: Shape = {
      type: activeTool,
      color: activeColor,
      lineWidth,
      startX: x,
      startY: y,
      endX: x,
      endY: y,
      points: [{ x, y }]
    };
    setCurrentShape(initialShape);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const { x, y } = getCanvasCoords(e);

    if (activeTool === 'crop') {
      setCropRegion(prev => prev ? { ...prev, endX: x, endY: y } : null);
      return;
    }

    if (!currentShape) return;

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
    if (isDrawing) {
      if (currentShape) {
        setShapes(prev => [...prev, currentShape]);
        setCurrentShape(null);
      }
      setIsDrawing(false);
    }
  };

  const commitInlineText = () => {
    if (inlineTextInput && inlineTextInput.text.trim()) {
      const lineWidth = getStrokeWidthPixels();
      setShapes(prev => [
        ...prev,
        {
          type: 'text',
          color: activeColor,
          lineWidth,
          startX: inlineTextInput.x,
          startY: inlineTextInput.y,
          text: inlineTextInput.text.trim()
        }
      ]);
    }
    setInlineTextInput(null);
  };

  const handleUndo = useCallback(() => {
    if (cropRegion) {
      setCropRegion(null);
      return;
    }
    setShapes(prev => prev.slice(0, -1));
  }, [cropRegion]);

  const handleClear = () => {
    setShapes([]);
    setCropRegion(null);
    setBadgeCounter(1);
  };

  // Export helper: returns base64 image representation (full or cropped)
  const getExportedImageData = useCallback((): { dataUrl: string; base64: string } => {
    const canvas = canvasRef.current;
    if (!canvas) return { dataUrl: '', base64: '' };

    if (cropRegion) {
      const minX = Math.min(cropRegion.startX, cropRegion.endX);
      const minY = Math.min(cropRegion.startY, cropRegion.endY);
      const w = Math.abs(cropRegion.endX - cropRegion.startX);
      const h = Math.abs(cropRegion.endY - cropRegion.startY);

      if (w > 5 && h > 5) {
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = w;
        cropCanvas.height = h;
        const cropCtx = cropCanvas.getContext('2d');
        if (cropCtx) {
          cropCtx.drawImage(canvas, minX, minY, w, h, 0, 0, w, h);
          const dataUrl = cropCanvas.toDataURL('image/png');
          return { dataUrl, base64: dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl };
        }
      }
    }

    const dataUrl = canvas.toDataURL('image/png');
    return { dataUrl, base64: dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl };
  }, [cropRegion]);

  // Copy to clipboard
  const handleCopy = useCallback(async () => {
    try {
      const { dataUrl } = getExportedImageData();
      if (!dataUrl) return;
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch (err) {
      console.error('Failed to copy screenshot to clipboard:', err);
    }
  }, [getExportedImageData]);

  // Close / Dismiss
  const handleClose = useCallback(() => {
    if (window.electronAPI?.screenCapture?.closeOverlay) {
      window.electronAPI.screenCapture.closeOverlay();
    }
    onClose();
  }, [onClose]);

  // Save to DeepScribe
  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);

    try {
      const { base64: imageBase64 } = getExportedImageData();

      const { block } = await createAnnotationBlock({
        projectId: selectedProjectId,
        title: promptText,
        promptText,
        imageBase64,
        kind,
        isReadyTask
      });

      if (window.electronAPI?.screenCapture?.saveAndClose) {
        await window.electronAPI.screenCapture.saveAndClose({ block });
      }

      onBlockCreated?.(block);
      onClose();
    } catch (err) {
      console.error('Failed to save screen annotation to DeepScribe:', err);
      alert('Error saving screen annotation: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSaving(false);
    }
  };

  // Keyboard Shortcuts (Esc to close, Ctrl+Z to undo, Ctrl+C to copy)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      } else if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      } else if (e.ctrlKey && e.key.toLowerCase() === 'c' && !inlineTextInput) {
        e.preventDefault();
        handleCopy();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClose, handleUndo, handleCopy, inlineTextInput]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col justify-between overflow-hidden bg-transparent select-none"
      style={{ width: '100vw', height: '100vh', margin: 0, padding: 0 }}
    >
      {/* Drawing Canvas */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className="absolute inset-0 cursor-crosshair"
      />

      {/* Floating Inline Text Editor */}
      {inlineTextInput && (
        <div
          className="absolute z-20"
          style={{
            left: `${inlineTextInput.screenX}px`,
            top: `${inlineTextInput.screenY - 24}px`
          }}
        >
          <input
            ref={inlineInputRef}
            type="text"
            value={inlineTextInput.text}
            placeholder="Type text..."
            onChange={e => setInlineTextInput(prev => prev ? { ...prev, text: e.target.value } : null)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitInlineText();
              } else if (e.key === 'Escape') {
                setInlineTextInput(null);
              }
            }}
            onBlur={commitInlineText}
            className="bg-[#12121A]/95 text-white font-semibold text-sm px-3 py-1.5 rounded-lg border border-blue-500 shadow-2xl focus:outline-none focus:ring-2 focus:ring-blue-400"
            style={{ color: activeColor }}
          />
        </div>
      )}

      {/* Top Banner Hint & Copy Feedback */}
      <div className="relative z-10 flex justify-center pt-3 pointer-events-none">
        <div className="bg-[#12121A]/85 border border-white/10 text-slate-300 text-xs px-3.5 py-1.5 rounded-full shadow-2xl backdrop-blur-xl transition-all">
          {copyFeedback ? (
            <span className="text-emerald-400 font-semibold">✓ Copied image to clipboard</span>
          ) : (
            <span>
              📸 <strong className="text-white">DeepScribe Screen Annotation</strong> • Press <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-[11px] font-mono text-slate-200">Esc</kbd> to exit
            </span>
          )}
        </div>
      </div>

      {/* Floating Bottom Toolbar */}
      <div className="relative z-10 pb-6 px-4 pointer-events-auto">
        <AnnotationToolbar
          projects={projects}
          selectedProjectId={selectedProjectId}
          onSelectProject={setSelectedProjectId}
          activeTool={activeTool}
          onSelectTool={setActiveTool}
          activeColor={activeColor}
          onSelectColor={setActiveColor}
          strokeWidth={strokeWidthLevel}
          onChangeStrokeWidth={setStrokeWidthLevel}
          kind={kind}
          onChangeKind={setKind}
          isReadyTask={isReadyTask}
          onChangeIsReadyTask={setIsReadyTask}
          promptText={promptText}
          onChangePromptText={setPromptText}
          onUndo={handleUndo}
          onClear={handleClear}
          onCopy={handleCopy}
          onSave={handleSave}
          onCancel={handleClose}
          isSaving={isSaving}
        />
      </div>
    </div>
  );
};
