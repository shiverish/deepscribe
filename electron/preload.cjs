const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  addAttachments: payload => ipcRenderer.invoke('deepscribe:attachments:add', payload),
  openAttachment: filePath => ipcRenderer.invoke('deepscribe:attachments:open', filePath),
  showAttachmentsFolder: projectId => ipcRenderer.invoke('deepscribe:attachments:show', { projectId }),
  removeAttachment: filePath => ipcRenderer.invoke('deepscribe:attachments:remove', filePath),
  readAttachment: filePath => ipcRenderer.invoke('deepscribe:attachments:read', filePath),
  importAttachment: payload => ipcRenderer.invoke('deepscribe:attachments:import', payload),
  seeScribe: {
    capture: command => ipcRenderer.invoke('deepscribe:seescribe:capture', command),
    status: () => ipcRenderer.invoke('deepscribe:seescribe:status'),
    setPath: executablePath => ipcRenderer.invoke('deepscribe:seescribe:set-path', executablePath)
  },
  migrateLegacyAttachment: payload => ipcRenderer.invoke('deepscribe:attachments:migrate-legacy', payload),
  printBlockDocument: payload => ipcRenderer.invoke('deepscribe:print:block-document', payload),
  exportBlockDocumentPdf: payload => ipcRenderer.invoke('deepscribe:export:block-document-pdf', payload),
  exportHeadlessPdf: payload => ipcRenderer.invoke('deepscribe:export:headless-pdf', payload),
  writeExportFile: payload => ipcRenderer.invoke('deepscribe:export:write-file', payload),
  screenCapture: {
    triggerOverlay: () => ipcRenderer.invoke('deepscribe:screen:trigger-overlay'),
    closeOverlay: () => ipcRenderer.invoke('deepscribe:screen:close-overlay'),
    saveAndClose: payload => ipcRenderer.invoke('deepscribe:screen:save-and-close', payload),
    getOverlayData: () => ipcRenderer.invoke('deepscribe:screen:get-overlay-data'),
    onTriggerOverlay: handler => {
      const listener = (_event, data) => handler(data);
      ipcRenderer.on('deepscribe:screen:open-overlay', listener);
      return () => ipcRenderer.removeListener('deepscribe:screen:open-overlay', listener);
    },
    onBlockCreated: handler => {
      const listener = (_event, block) => handler(block);
      ipcRenderer.on('deepscribe:screen:block-created', listener);
      return () => ipcRenderer.removeListener('deepscribe:screen:block-created', listener);
    }
  },
  tray: {
    minimizeToTray: () => ipcRenderer.invoke('deepscribe:tray:minimize'),
    setTrayEnabled: enabled => ipcRenderer.invoke('deepscribe:tray:set-enabled', enabled),
    isTrayEnabled: () => ipcRenderer.invoke('deepscribe:tray:is-enabled')
  },
  workspace: {
    status: () => ipcRenderer.invoke('deepscribe:workspace:status'),
    load: () => ipcRenderer.invoke('deepscribe:workspace:load'),
    save: snapshot => ipcRenderer.invoke('deepscribe:workspace:save', snapshot),
    openFolder: () => ipcRenderer.invoke('deepscribe:workspace:open'),
    chooseAndMove: () => ipcRenderer.invoke('deepscribe:workspace:choose-and-move')
  },
  webhooks: {
    dispatch: payload => ipcRenderer.invoke('deepscribe:webhooks:dispatch', payload)
  },
  updater: {
    getState: () => ipcRenderer.invoke('deepscribe:updater:get-state'),
    check: () => ipcRenderer.invoke('deepscribe:updater:check'),
    download: () => ipcRenderer.invoke('deepscribe:updater:download'),
    install: () => ipcRenderer.invoke('deepscribe:updater:install'),
    onStatusChange: handler => {
      const listener = (_event, state) => handler(state);
      ipcRenderer.on('deepscribe:updater:status-changed', listener);
      return () => ipcRenderer.removeListener('deepscribe:updater:status-changed', listener);
    }
  },
  onWorkspaceFlushRequested: handler => {
    const listener = () => handler();
    ipcRenderer.on('deepscribe-workspace-flush', listener);
    return () => ipcRenderer.removeListener('deepscribe-workspace-flush', listener);
  },
  workspaceFlushed: () => ipcRenderer.send('deepscribe-workspace-flushed'),
  onNavigateToTarget: handler => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('deepscribe:navigate-to-target', listener);
    return () => ipcRenderer.removeListener('deepscribe:navigate-to-target', listener);
  }
});

contextBridge.exposeInMainWorld('deepScribeMcp', {
  onRequest: handler => {
    const listener = (_event, request) => handler(request);
    ipcRenderer.on('deepscribe-mcp-request', listener);
    return () => ipcRenderer.removeListener('deepscribe-mcp-request', listener);
  },
  respond: response => ipcRenderer.send('deepscribe-mcp-response', response),
  ready: () => ipcRenderer.send('deepscribe-mcp-ready')
});
