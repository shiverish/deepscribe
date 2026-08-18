import type { WorkspaceSnapshot, WorkspaceStatus } from './types';

export {};

declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      platform: string;
      addAttachments: (payload: { projectId: string; blockId: string }) => Promise<Array<{
        fileName: string;
        fileSize: number;
        fileType: string;
        localPath: string;
      }>>;
      openAttachment: (localPath: string) => Promise<void>;
      showAttachmentsFolder: (projectId: string) => Promise<void>;
      removeAttachment: (localPath: string) => Promise<void>;
      readAttachment: (localPath: string) => Promise<string>;
      importAttachment: (payload: { projectId: string; blockId: string; fileName: string; base64: string }) => Promise<{ localPath: string }>;
      migrateLegacyAttachment: (payload: { projectId: string; blockId: string; localPath: string }) => Promise<{ localPath: string }>;
      printBlockDocument: (payload: { html: string; jobName: string }) => Promise<{ status: 'printed' | 'cancelled' }>;
      workspace: {
        status: () => Promise<WorkspaceStatus>;
        load: () => Promise<WorkspaceSnapshot>;
        save: (snapshot: WorkspaceSnapshot) => Promise<void>;
        openFolder: () => Promise<void>;
        chooseAndMove: () => Promise<WorkspaceStatus | null>;
      };
      updater?: {
        getState: () => Promise<{
          status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
          currentVersion: string;
          availableVersion?: string | null;
          releaseNotes?: string | null;
          progress?: {
            percent: number;
            bytesPerSecond: number;
            transferred: number;
            total: number;
          } | null;
          error?: string | null;
        }>;
        check: () => Promise<{ ok: boolean; updateInfo?: unknown; error?: string }>;
        download: () => Promise<{ ok: boolean; error?: string }>;
        install: () => Promise<{ ok: boolean }>;
        onStatusChange: (handler: (state: {
          status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
          currentVersion: string;
          availableVersion?: string | null;
          releaseNotes?: string | null;
          progress?: {
            percent: number;
            bytesPerSecond: number;
            transferred: number;
            total: number;
          } | null;
          error?: string | null;
        }) => void) => () => void;
      };
      onWorkspaceFlushRequested: (handler: () => void) => () => void;
      workspaceFlushed: () => void;
    };
    deepScribeMcp?: {
      onRequest: (handler: (request: { id: string; method: string; params?: unknown }) => void) => () => void;
      respond: (response: { id: string; ok: boolean; result?: unknown; error?: string }) => void;
      ready: () => void;
    };
  }
}
