import type { WebhookEndpoint, WorkspaceSnapshot, WorkspaceStatus } from './types';
import type { WebhookPayload } from './utils/webhooks';

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
      printBlockDocument: (payload: { html: string; jobName: string; pageSize: 'A4' | 'A5' }) => Promise<{ status: 'printed' | 'cancelled' }>;
      exportBlockDocumentPdf: (payload: { html: string; jobName: string; pageSize: 'A4' | 'A5' }) => Promise<{ status: 'exported' | 'cancelled'; filePath?: string }>;
      exportHeadlessPdf: (payload: { html: string; jobName: string; pageSize: 'A4' | 'A5'; outputPath?: string }) => Promise<{ status: 'exported'; filePath: string; sizeBytes: number }>;
      writeExportFile: (payload: { filePath: string; content: string }) => Promise<{ status: 'exported'; filePath: string; sizeBytes: number }>;
      seeScribe?: {
        capture: (command?: 'capture' | 'record' | 'show') => Promise<{ ok: boolean; executablePath?: string; error?: string }>;
        status: () => Promise<{ executablePath: string | null }>;
        setPath: (executablePath: string) => Promise<{ executablePath: string }>;
      };
      screenCapture?: {
        triggerOverlay: () => Promise<{ ok: boolean; screenshotDataUrl?: string }>;
        closeOverlay: () => Promise<{ ok: boolean }>;
        saveAndClose: (payload: { block?: unknown }) => Promise<{ ok: boolean }>;
        getOverlayData: () => Promise<{ screenshotDataUrl: string; width: number; height: number; scaleFactor?: number } | null>;
        onTriggerOverlay: (handler: (data: { screenshotDataUrl: string; width: number; height: number; scaleFactor?: number }) => void) => () => void;
        onBlockCreated: (handler: (block: unknown) => void) => () => void;
      };
      quickCapture?: {
        acknowledge: (result: { requestId: string; ok: boolean; error?: string }) => void;
        open: () => Promise<{ ok: boolean }>;
        close: () => Promise<{ ok: boolean }>;
        save: (payload: { text: string; projectHintName?: string; requestId: string }) => Promise<{ ok: boolean }>;
        onSaveRequest: (handler: (payload: { text: string; projectHintName?: string; requestId: string }) => void) => () => void;
      };
      tray?: {
        minimizeToTray: () => Promise<void>;
        setTrayBehavior: (behavior: { minimizeToTray: boolean; closeToTray: boolean }) => Promise<{ minimizeToTray: boolean; closeToTray: boolean }>;
        getTrayBehavior: () => Promise<{ minimizeToTray: boolean; closeToTray: boolean }>;
      };
      autoStart?: {
        getStatus: () => Promise<{ openAtLogin: boolean; openAsHidden: boolean }>;
        setSettings: (settings: { openAtLogin: boolean; openAsHidden: boolean }) => Promise<{ openAtLogin: boolean; openAsHidden: boolean }>;
      };
      workspace: {
        status: () => Promise<WorkspaceStatus>;
        load: () => Promise<WorkspaceSnapshot>;
        save: (snapshot: WorkspaceSnapshot) => Promise<void>;
        openFolder: () => Promise<void>;
        chooseAndMove: () => Promise<WorkspaceStatus | null>;
      };
      webhooks?: {
        dispatch: (input: { endpoints: WebhookEndpoint[]; payload: WebhookPayload }) => Promise<Array<{
          endpointId: string;
          ok: boolean;
          status?: number;
          error?: string;
        }>>;
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
      onNavigateToTarget?: (handler: (payload: { type: 'task' | 'block'; targetId: string }) => void) => () => void;
    };
    deepScribeMcp?: {
      onRequest: (handler: (request: { id: string; method: string; params?: unknown }) => void) => () => void;
      respond: (response: { id: string; ok: boolean; result?: unknown; error?: string }) => void;
      ready: () => void;
    };
  }
}
