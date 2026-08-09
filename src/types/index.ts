export interface Project {
  id: string;
  title: string;
  description: string;
  color: string;
  order: number;
  tags: string[];
  icon?: string;
  isTrash: boolean;
  trashedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface Block {
  id: string;
  projectId: string;
  parentId: string | null;
  title: string;
  content: string; // HTML content from TipTap
  plainText: string; // Extracted plain text for fast indexing
  order: number;
  childCount: number;
  taskCount: number;
  completedTaskCount: number;
  attachmentCount: number;
  isTrash: boolean;
  trashedAt?: number;
  trashedWithProject?: boolean;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Attachment {
  id: string;
  blockId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  dataUrl?: string; // Kept for archive compatibility with imported projects.
  localPath?: string;
  createdAt: number;
}

export interface PathSegment {
  id: string;
  title: string;
  type: 'project' | 'block';
  parentId?: string | null;
}

export interface SearchResultItem {
  block: Block;
  projectTitle: string;
  pathSegments: PathSegment[];
  snippet: string;
}

export type DropPosition = 'above' | 'below' | 'inside';

export interface DragTarget {
  itemId: string;
  position: DropPosition;
}

export interface SaveStatus {
  state: 'saved' | 'saving' | 'error';
  lastSavedAt?: number;
}

export type ThemeMode = 'dark' | 'light' | 'system';
export type ThemePreset = 'vanilla' | 'cyberpunk' | 'nord' | 'dracula' | 'sepia' | 'obsidian' | 'custom';
export type FontFamily = 'sans' | 'serif' | 'mono';
export type ContentWidth = 'narrow' | 'standard' | 'full';

export interface UserSettings {
  theme: ThemeMode;
  preset: ThemePreset;
  accentColor: string;
  atmosphereColor: string;
  customBgColor?: string;
  customTextColor?: string;
  enableGlassmorphism: boolean;
  enableGlow: boolean;
  fontSize: number;
  fontFamily: FontFamily;
  lineHeight: number;
  contentWidth: ContentWidth;
  columnWidth: number;
  spellcheck: boolean;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  theme: 'dark',
  preset: 'vanilla',
  accentColor: '#3b82f6',
  atmosphereColor: '#EBDEC3',
  customBgColor: '#141312',
  customTextColor: '#faf6ee',
  enableGlassmorphism: true,
  enableGlow: true,
  fontSize: 16,
  fontFamily: 'sans',
  lineHeight: 1.6,
  contentWidth: 'standard',
  columnWidth: 320,
  spellcheck: true
};
