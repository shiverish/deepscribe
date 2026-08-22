import React from 'react';
import {
  ArrowUpRight,
  Square,
  Circle,
  ListOrdered,
  Pen,
  Highlighter,
  Type,
  Crop,
  Undo2,
  Trash2,
  Check,
  X,
  FolderOpen,
  CheckSquare,
  FileText,
  Copy
} from 'lucide-react';
import type { Project } from '../../types';

export type DrawingTool = 'arrow' | 'rect' | 'ellipse' | 'badge' | 'pen' | 'highlighter' | 'text' | 'crop';
export type StrokeWidthLevel = 'thin' | 'medium' | 'bold';

export const COLOR_PALETTE = [
  '#EF4444', // Crimson Red
  '#3B82F6', // Electric Blue
  '#10B981', // Emerald Green
  '#F59E0B', // Amber Gold
  '#8B5CF6', // Purple
  '#EC4899', // Hot Pink
  '#FFFFFF'  // White
];

interface AnnotationToolbarProps {
  projects: Project[];
  selectedProjectId: string;
  onSelectProject: (id: string) => void;
  activeTool: DrawingTool;
  onSelectTool: (tool: DrawingTool) => void;
  activeColor: string;
  onSelectColor: (color: string) => void;
  strokeWidth: StrokeWidthLevel;
  onChangeStrokeWidth: (width: StrokeWidthLevel) => void;
  kind: 'task' | 'block';
  onChangeKind: (kind: 'task' | 'block') => void;
  isReadyTask: boolean;
  onChangeIsReadyTask: (ready: boolean) => void;
  promptText: string;
  onChangePromptText: (text: string) => void;
  onUndo: () => void;
  onClear: () => void;
  onCopy?: () => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving?: boolean;
}

export const AnnotationToolbar: React.FC<AnnotationToolbarProps> = ({
  projects,
  selectedProjectId,
  onSelectProject,
  activeTool,
  onSelectTool,
  activeColor,
  onSelectColor,
  strokeWidth,
  onChangeStrokeWidth,
  kind,
  onChangeKind,
  isReadyTask,
  onChangeIsReadyTask,
  promptText,
  onChangePromptText,
  onUndo,
  onClear,
  onCopy,
  onSave,
  onCancel,
  isSaving
}) => {
  const tools: Array<{ id: DrawingTool; label: string; icon: React.ReactNode }> = [
    { id: 'arrow', label: 'Arrow', icon: <ArrowUpRight className="w-4 h-4" /> },
    { id: 'rect', label: 'Box', icon: <Square className="w-4 h-4" /> },
    { id: 'ellipse', label: 'Circle', icon: <Circle className="w-4 h-4" /> },
    { id: 'badge', label: 'Step (1-2-3)', icon: <ListOrdered className="w-4 h-4" /> },
    { id: 'pen', label: 'Pen', icon: <Pen className="w-4 h-4" /> },
    { id: 'highlighter', label: 'Highlighter', icon: <Highlighter className="w-4 h-4" /> },
    { id: 'text', label: 'Text', icon: <Type className="w-4 h-4" /> },
    { id: 'crop', label: 'Crop Region', icon: <Crop className="w-4 h-4" /> }
  ];

  return (
    <div className="flex flex-col gap-2.5 p-3.5 bg-[#14141e]/90 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] text-slate-100 max-w-4xl w-full mx-auto select-none transition-all">
      {/* Top Row: Drawing Tools, Stroke Sizes, Colors, Undo/Clear */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Drawing Tools */}
        <div className="flex items-center gap-0.5 bg-black/40 p-1 rounded-xl border border-white/5 shadow-inner">
          {tools.map(t => {
            const isActive = activeTool === t.id;
            return (
              <button
                key={t.id}
                type="button"
                title={t.label}
                onClick={() => onSelectTool(t.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
                }`}
              >
                {t.icon}
                <span className="hidden md:inline">{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Stroke Width Selector */}
        <div className="flex items-center gap-1 bg-black/40 px-2 py-1.5 rounded-xl border border-white/5">
          {(['thin', 'medium', 'bold'] as const).map(level => {
            const dotSize = level === 'thin' ? 'w-1.5 h-1.5' : level === 'medium' ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5';
            const isActive = strokeWidth === level;
            return (
              <button
                key={level}
                type="button"
                title={`Stroke: ${level}`}
                onClick={() => onChangeStrokeWidth(level)}
                className={`w-6 h-6 flex items-center justify-center rounded-lg transition-all ${
                  isActive ? 'bg-white/15 text-white' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <div className={`rounded-full bg-current ${dotSize}`} />
              </button>
            );
          })}
        </div>

        {/* Color Palette */}
        <div className="flex items-center gap-1.5 bg-black/40 px-2.5 py-1.5 rounded-xl border border-white/5">
          {COLOR_PALETTE.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => onSelectColor(c)}
              className={`w-5 h-5 rounded-full transition-all ${
                activeColor === c
                  ? 'scale-125 ring-2 ring-blue-400 ring-offset-2 ring-offset-[#14141e] shadow-md'
                  : 'opacity-80 hover:opacity-100 hover:scale-110'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        {/* Undo & Clear */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Undo (Ctrl+Z)"
            onClick={onUndo}
            className="p-2 text-slate-400 hover:text-slate-100 hover:bg-white/10 rounded-xl transition-all"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            title="Clear All"
            onClick={onClear}
            className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bottom Row: Project Picker, Mode, Prompt & Submit */}
      <div className="flex items-center gap-2.5 pt-2 border-t border-white/10 flex-wrap sm:flex-nowrap">
        {/* Project Dropdown */}
        <div className="flex items-center gap-1.5 bg-black/40 px-2.5 py-1.5 rounded-xl border border-white/5 text-xs shrink-0">
          <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
          <select
            value={selectedProjectId}
            onChange={e => onSelectProject(e.target.value)}
            className="bg-transparent text-slate-200 font-medium focus:outline-none cursor-pointer max-w-[140px] truncate"
          >
            {projects.map(p => (
              <option key={p.id} value={p.id} className="bg-[#14141e] text-slate-200">
                {p.title}
              </option>
            ))}
          </select>
        </div>

        {/* Kind Toggle (Task vs Block) */}
        <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/5 shrink-0">
          <button
            type="button"
            onClick={() => onChangeKind('task')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
              kind === 'task' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>Task</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeKind('block')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
              kind === 'block' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Block</span>
          </button>
        </div>

        {/* Ready status toggle for tasks */}
        {kind === 'task' && (
          <label className="flex items-center gap-1.5 text-xs text-slate-300 font-medium cursor-pointer shrink-0 ml-0.5">
            <input
              type="checkbox"
              checked={isReadyTask}
              onChange={e => onChangeIsReadyTask(e.target.checked)}
              className="rounded bg-black/40 border-white/20 text-blue-500 focus:ring-0 cursor-pointer"
            />
            <span className="text-[11px] text-slate-400">Ready</span>
          </label>
        )}

        {/* Prompt Input */}
        <div className="flex-1 min-w-[160px]">
          <input
            type="text"
            placeholder={kind === 'task' ? 'Describe task context...' : 'Note title or description...'}
            value={promptText}
            onChange={e => onChangePromptText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onSave();
              }
            }}
            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/50 transition-all"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onCopy && (
            <button
              type="button"
              onClick={onCopy}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-white/10 hover:bg-white/15 text-slate-200 rounded-xl text-xs font-medium transition-all"
              title="Copy to Clipboard (Ctrl+C)"
            >
              <Copy className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Copy</span>
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-white/10 rounded-xl text-xs transition-all"
            title="Cancel (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={onSave}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 active:scale-95 disabled:opacity-50 text-white font-semibold px-3.5 py-1.5 rounded-xl text-xs shadow-lg shadow-blue-500/30 transition-all cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>{isSaving ? 'Saving...' : 'Save to DeepScribe'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
