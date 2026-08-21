export type ActiveView = 'columns' | 'tasks' | 'graph' | 'stats';

export interface Project {
  id: string;
  title: string;
  description: string;
  color: string;
  order: number;
  tags: string[];
  icon?: string;
  scratchpad?: string;
  scratchpadUpdatedAt?: number;
  isTrash: boolean;
  trashedAt?: number;
  createdAt: number;
  updatedAt: number;
  systemKind?: 'task-inbox';
}

export interface ProjectContext {
  projectId: string;
  title: string;
  description: string;
  tags: string[];
  color: string;
  scratchpad: string;
  scratchpadUpdatedAt?: number;
  totalBlocks: number;
  openTaskCount: number;
  openTasks: Array<{ blockId: string; blockTitle: string; text: string; isBlocked?: boolean }>;
  recentActivities: Array<{ id: string; action: string; summary: string; createdAt: number; source: string }>;
  createdAt: number;
  updatedAt: number;
}

export type TaskStatus = 'inbox' | 'ready' | 'in-progress' | 'blocked' | 'review' | 'done';
export type TaskAgentTarget = 'none' | 'openai' | 'claude' | 'gemini' | 'custom' | 'any';
export type ClaimantAgentTarget = Exclude<TaskAgentTarget, 'none' | 'any'>;

export interface TaskClaim {
  ownerId: string;
  agentTarget: ClaimantAgentTarget;
  customAgentName?: string;
  token: string;
  requestId: string;
  claimedAt: number;
  heartbeatAt: number;
  expiresAt: number;
  attempt: number;
}

export interface TaskMetadata {
  status: TaskStatus;
  agentTarget: TaskAgentTarget;
  customAgentName?: string;
  position: number;
  readyAt?: number;
  claimAttempt?: number;
  claim?: TaskClaim;
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
  dependsOn?: string[];
  kind?: 'task';
  task?: TaskMetadata;
  lastAgentEditAt?: number;
  lastSeenAgentEditAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface BlockDependencyStatus {
  isBlocked: boolean;
  pendingDependencies: Block[];
  completedDependencies: Block[];
  missingDependencyIds: string[];
  blocking: Block[];
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

export interface WorkspaceStatus {
  state: 'ready' | 'migrating' | 'error';
  path: string;
  workspaceId: string;
  formatVersion: number;
  encrypted: false;
  counts: { projects: number; blocks: number; attachments: number };
  previousPath?: string;
}

export interface WorkspaceSnapshot {
  projects: Project[];
  blocks: Block[];
  attachments: Attachment[];
  settings: Array<{ key: string; value: unknown }>;
  activities: ActivityEntry[];
  templates: BlockTemplate[];
  revisions?: BlockRevision[];
}

export type ActivitySource = 'user' | 'agent' | 'system';
export type RevisionSource = 'user' | 'agent' | 'system' | 'restore';

export interface BlockRevision {
  id: string;
  blockId: string;
  projectId: string;
  title: string;
  content: string;
  plainText: string;
  tags: string[];
  kind?: 'task';
  task?: TaskMetadata;
  source: RevisionSource;
  summary?: string;
  createdAt: number;
}

export interface ActivityEntry {
  id: string;
  projectId?: string;
  blockId?: string;
  source: ActivitySource;
  action: string;
  summary: string;
  createdAt: number;
}

export interface BlockTemplate {
  id: string;
  name: string;
  title: string;
  content: string;
  plainText: string;
  tags: string[];
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

export interface SavedTheme {
  id: string;
  name: string;
  theme: ThemeMode;
  accentColor: string;
  atmosphereColor: string;
  selectedCardColor: string;
  backgroundColor: string;
  textColor: string;
  createdAt: number;
}

export interface UserSettings {
  theme: ThemeMode;
  preset: ThemePreset;
  accentColor: string;
  atmosphereColor: string;
  selectedCardColor: string;
  agentAlertColor: string;
  savedThemes: SavedTheme[];
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
  allowOfflineAgentAccess: boolean;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  theme: 'dark',
  preset: 'vanilla',
  accentColor: '#3b82f6',
  atmosphereColor: '#EBDEC3',
  selectedCardColor: '#322C25',
  agentAlertColor: '#38BDF8',
  savedThemes: [],
  customBgColor: '#141312',
  customTextColor: '#faf6ee',
  enableGlassmorphism: true,
  enableGlow: true,
  fontSize: 16,
  fontFamily: 'sans',
  lineHeight: 1.6,
  contentWidth: 'standard',
  columnWidth: 320,
  spellcheck: true,
  allowOfflineAgentAccess: true
};
