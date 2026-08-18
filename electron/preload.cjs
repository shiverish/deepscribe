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
  migrateLegacyAttachment: payload => ipcRenderer.invoke('deepscribe:attachments:migrate-legacy', payload),
  printBlockDocument: payload => ipcRenderer.invoke('deepscribe:print:block-document', payload),
  workspace: {
    status: () => ipcRenderer.invoke('deepscribe:workspace:status'),
    load: () => ipcRenderer.invoke('deepscribe:workspace:load'),
    save: snapshot => ipcRenderer.invoke('deepscribe:workspace:save', snapshot),
    openFolder: () => ipcRenderer.invoke('deepscribe:workspace:open'),
    chooseAndMove: () => ipcRenderer.invoke('deepscribe:workspace:choose-and-move')
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
  workspaceFlushed: () => ipcRenderer.send('deepscribe-workspace-flushed')
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
