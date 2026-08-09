const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  addAttachments: payload => ipcRenderer.invoke('deepscribe:attachments:add', payload),
  openAttachment: filePath => ipcRenderer.invoke('deepscribe:attachments:open', filePath),
  showAttachmentsFolder: projectId => ipcRenderer.invoke('deepscribe:attachments:show', { projectId }),
  removeAttachment: filePath => ipcRenderer.invoke('deepscribe:attachments:remove', filePath),
  readAttachment: filePath => ipcRenderer.invoke('deepscribe:attachments:read', filePath)
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
