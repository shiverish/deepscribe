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
    };
    deepScribeMcp?: {
      onRequest: (handler: (request: { id: string; method: string; params?: unknown }) => void) => () => void;
      respond: (response: { id: string; ok: boolean; result?: unknown; error?: string }) => void;
      ready: () => void;
    };
  }
}
