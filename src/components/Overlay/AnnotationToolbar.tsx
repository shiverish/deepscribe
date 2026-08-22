import React from 'react';
import {
  ArrowUpRight,
  Square,
  Circle,
  ListOrdered,
  Pen,
  Highlighter,
  Type,
  Undo,
  Trash2,
  Check,
  X,
  FolderOpen,
  CheckSquare,
  FileText
} from 'lucide-react';
import type { Project } from '../../types';

export type DrawingTool = 'arrow' | 'rect' | 'ellipse' | 'badge' | 'pen' | 'highlighter' | 'text';

export const COLOR_PALETTE = [
  '#EF4444', // Red
  '#3B82F6', // Blue
  '#10B981', // Green
  '#F59E0B', // Amber
  '#8B5CF6', // Purple
  '#EC4899', // Pink
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
  kind: 'task' | 'block';
  onChangeKind: (kind: 'task' | 'block') => void;
  isReadyTask: boolean;
  onChangeIsReadyTask: (ready: boolean) => void;
  promptText: string;
  onChangePromptText: (text: string) => void;
  onUndo: () => void;
  onClear: () => void;
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
  kind,
  onChangeKind,
  isReadyTask,
  onChangeIsReadyTask,
  promptText,
  onChangePromptText,
  onUndo,
  onClear,
  onSave,
  onCancel,
  isSaving
}) => {
  const tools: Array<{ id: DrawingTool; label: string; icon: React.ReactNode }> = [
    { id: 'arrow', label: 'Pijl', icon: <ArrowUpRight className="w-4 h-4" /> },
    { id: 'rect', label: 'Kader', icon: <Square className="w-4 h-4" /> },
    { id: 'ellipse', label: 'Cirkel', icon: <Circle className="w-4 h-4" /> },
    { id: 'badge', label: 'Stap 1-2-3', icon: <ListOrdered className="w-4 h-4" /> },
    { id: 'pen', label: 'Pen', icon: <Pen className="w-4 h-4" /> },
    { id: 'highlighter', label: 'Marker', icon: <Highlighter className="w-4 h-4" /> },
    { id: 'text', label: 'Tekst', icon: <Type className="w-4 h-4" /> }
  ];

  return (
    <div className="flex flex-col gap-2 p-3 bg-[#181822]/95 backdrop-blur-md border border-[#2D2D3E] rounded-2xl shadow-2xl text-slate-100 max-w-4xl w-full mx-auto animate-in fade-in slide-in-from-bottom-4 duration-200 select-none">
      {/* Top Row: Drawing Tools, Colors, Undo/Clear */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Drawing Tools */}
        <div className="flex items-center gap-1 bg-[#12121A] p-1 rounded-xl border border-[#2A2A38]">
          {tools.map(t => (
            <button
              key={t.id}
              type="button"
              title={t.label}
              onClick={() => onSelectTool(t.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeTool === t.id
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#20202E]'
              }`}
            >
              {t.icon}
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Color Palette */}
        <div className="flex items-center gap-1.5 bg-[#12121A] px-2 py-1.5 rounded-xl border border-[#2A2A38]">
          {COLOR_PALETTE.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => onSelectColor(c)}
              className={`w-5 h-5 rounded-full transition-transform ${
                activeColor === c ? 'scale-125 ring-2 ring-blue-400 ring-offset-2 ring-offset-[#12121A]' : 'opacity-80 hover:opacity-100'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        {/* Undo & Clear */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Ongedaan maken (Ctrl+Z)"
            onClick={onUndo}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-[#262636] rounded-lg transition-colors"
          >
            <Undo className="w-4 h-4" />
          </button>
          <button
            type="button"
            title="Alles wissen"
            onClick={onClear}
            className="p-2 text-slate-400 hover:text-red-400 hover:bg-[#262636] rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bottom Row: Project Picker, Mode, Prompt & Submit */}
      <div className="flex items-center gap-2 pt-1 border-t border-[#252533] flex-wrap sm:flex-nowrap">
        {/* Project Dropdown */}
        <div className="flex items-center gap-1.5 bg-[#12121A] px-2.5 py-1.5 rounded-xl border border-[#2A2A38] text-xs shrink-0">
          <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
          <select
            value={selectedProjectId}
            onChange={e => onSelectProject(e.target.value)}
            className="bg-transparent text-slate-200 font-medium focus:outline-none cursor-pointer max-w-[150px] truncate"
          >
            {projects.map(p => (
              <option key={p.id} value={p.id} className="bg-[#181822] text-slate-200">
                {p.title}
              </option>
            ))}
          </select>
        </div>

        {/* Kind Toggle (Task vs Block) */}
        <div className="flex items-center gap-1 bg-[#12121A] p-1 rounded-xl border border-[#2A2A38] shrink-0">
          <button
            type="button"
            onClick={() => onChangeKind('task')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
              kind === 'task' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>Taak</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeKind('block')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
              kind === 'block' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Blok</span>
          </button>
        </div>

        {/* Ready status toggle for tasks */}
        {kind === 'task' && (
          <label className="flex items-center gap-1.5 text-xs text-slate-300 font-medium cursor-pointer shrink-0 ml-1">
            <input
              type="checkbox"
              checked={isReadyTask}
              onChange={e => onChangeIsReadyTask(e.target.checked)}
              className="rounded bg-[#12121A] border-slate-600 text-blue-500 focus:ring-0"
            />
            <span className="text-[11px] text-slate-400">Direct uitvoerbaar (Ready)</span>
          </label>
        )}

        {/* Prompt Input */}
        <div className="flex-1 min-w-[160px]">
          <input
            type="text"
            placeholder={kind === 'task' ? 'Beschrijf taak of context...' : 'Titel of notitie...'}
            value={promptText}
            onChange={e => onChangePromptText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onSave();
              }
            }}
            className="w-full bg-[#12121A] border border-[#2A2A38] rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-[#262636] rounded-xl text-xs transition-colors"
            title="Annuleren (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={onSave}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold px-3.5 py-1.5 rounded-xl text-xs shadow-lg transition-all"
          >
            <Check className="w-4 h-4" />
            <span>{isSaving ? 'Opslaan...' : 'Opslaan'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
