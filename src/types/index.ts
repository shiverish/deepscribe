export type ActiveView = 'columns' | 'tasks' | 'stats' | 'focus';
export type StartupViewMode = 'fixed' | 'last-used';

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

/**
 * Who created a block. Canonical on `Block.creator` for every block, tasks
 * included. The agent variant keeps its identity optional because a block can
 * arrive over MCP without the caller declaring who it is; `type` is what a
 * consumer should branch on.
 */
export type BlockCreator =
  | { type: 'user' }
  | {
      type: 'agent';
      agentTarget?: ClaimantAgentTarget;
      agentId?: string;
      customAgentName?: string;
    };

/**
 * @deprecated Superseded by `Block.creator`, which covers tasks too. Still
 * written by create_task because its `requestId` backs the idempotency lookup,
 * and still read as a fallback for task rows created before `Block.creator`.
 */
export type TaskCreator =
  | { type: 'user' }
  | {
      type: 'agent';
      agentTarget: ClaimantAgentTarget;
      agentId: string;
      requestId: string;
      customAgentName?: string;
    };

export interface TaskMetadata {
  status: TaskStatus;
  agentTarget: TaskAgentTarget;
  customAgentName?: string;
  position: number;
  taskNumber?: number;
  /** @deprecated Read `Block.creator`; kept for idempotency and legacy rows. */
  creator?: TaskCreator;
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
  /** Canonical creator for every block kind. Absent on rows predating the field. */
  creator?: BlockCreator;
  lastAgentEditAt?: number;
  lastSeenAgentEditAt?: number;
  createdAt: number;
  updatedAt: number;
}

export type BlockLinkType = 'relates-to' | 'supports' | 'contradicts' | 'derived-from' | 'source-of';

/**
 * An edge in the knowledge graph. Relations point at block ids rather than
 * titles, so they survive a rename and may cross project boundaries.
 */
export interface BlockLink {
  id: string;
  sourceBlockId: string;
  targetBlockId: string;
  type: BlockLinkType;
  createdBy: 'user' | 'agent';
  createdAt: number;
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
  /** Lowercase hex SHA-256 of the stored bytes; present on agent uploads. */
  sha256?: string;
  /** Provenance of an agent upload, and the key a repeated requestId matches on. */
  upload?: { agentId: string; requestId: string };
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
  links?: BlockLink[];
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

interface SearchResultBase {
  snippet: string;
  score: number;
  /** Heading the matching passage sits under, when it has one. */
  heading?: string;
}

export interface BlockSearchResult extends SearchResultBase {
  kind: 'block';
  block: Block;
  projectTitle: string;
  pathSegments: PathSegment[];
}

export interface ProjectSearchResult extends SearchResultBase {
  kind: 'project';
  project: Project;
}

export type SearchResultItem = BlockSearchResult | ProjectSearchResult;

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
  surfaceBgColor?: string;
  headerBgColor?: string;
  columnHeaderBgColor?: string;
  cardBgColor?: string;
  agentAlertColor?: string;
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
  customSurfaceBgColor?: string;
  customHeaderBgColor?: string;
  customColumnHeaderBgColor?: string;
  customCardBgColor?: string;
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
  minimizeToTray: boolean;
  closeToTray: boolean;
  /** Automatically launch DeepScribe when logging into Windows. */
  autoStartOnBoot: boolean;
  /** Launch minimized into the system tray when starting with Windows. */
  autoStartMinimized: boolean;
  /** Open a fixed view on startup, or the one that was open last. */
  startupViewMode: StartupViewMode;
  /** The view to open when startupViewMode is 'fixed'. */
  startupView: ActiveView;
  /** Follows the switcher, so 'last-used' has something to restore. */
  lastActiveView: ActiveView;
  webhooks: WebhookEndpoint[];
  lastSeenWhatsNewVersion?: string;
}

export type WebhookEventName = 'task.status_changed' | 'task.created' | 'block.created' | 'block.updated';
export type WebhookAuthMode = 'none' | 'bearer' | 'hmac';

export interface WebhookEndpoint {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  events: WebhookEventName[];
  authMode: WebhookAuthMode;
  secret: string;
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
  customSurfaceBgColor: '#1a1816',
  customHeaderBgColor: '#12100e',
  customColumnHeaderBgColor: '#161412',
  customCardBgColor: '#201d1a',
  customTextColor: '#faf6ee',
  enableGlassmorphism: true,
  enableGlow: true,
  fontSize: 16,
  fontFamily: 'sans',
  lineHeight: 1.6,
  contentWidth: 'standard',
  columnWidth: 320,
  spellcheck: true,
  allowOfflineAgentAccess: true,
  minimizeToTray: true,
  closeToTray: true,
  autoStartOnBoot: false,
  autoStartMinimized: true,
  startupViewMode: 'fixed',
  startupView: 'columns',
  lastActiveView: 'columns',
  webhooks: []
};
