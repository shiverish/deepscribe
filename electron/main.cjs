const { app, BrowserWindow, dialog, ipcMain, shell, Tray, Menu, globalShortcut, desktopCapturer, screen, nativeImage } = require('electron');
const { autoUpdater } = require('electron-updater');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const { WorkspaceStore } = require('./workspace.cjs');

let mainWindow;
let activePrintWindow;
let bridgeServer;
let bridgeInfoPath;
let workspaceStore;
let workspaceQuitReady = false;
let isInstallingUpdate = false;
let tray = null;
let isQuitting = false;
let isTrayEnabled = true;
let overlayWindow = null;
let pendingOverlayData = null;
const pendingBridgeRequests = new Map();
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
// Een bijlage reist als base64 door de bridge en groeit daarbij met ongeveer een derde.
// De grens moet daarom ruimer zijn dan de bijlagegrens zelf, anders wordt een toegestane
// bijlage alsnog onderweg afgekapt.
const MAX_BRIDGE_REQUEST_BYTES = 36 * 1024 * 1024;
const MAX_PRINT_DOCUMENT_BYTES = 50 * 1024 * 1024;

let updateState = {
  status: 'idle',
  currentVersion: app.getVersion(),
  availableVersion: null,
  releaseNotes: null,
  progress: null,
  error: null
};

function broadcastUpdateState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('deepscribe:updater:status-changed', updateState);
  }
}

const MIME_TYPES_BY_EXTENSION = {
  '.csv': 'text/csv',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.gif': 'image/gif',
  '.html': 'text/html',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.svg': 'image/svg+xml',
  '.tsv': 'text/tab-separated-values',
  '.txt': 'text/plain',
  '.webp': 'image/webp',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xml': 'application/xml',
  '.zip': 'application/zip'
};

function inferMimeType(fileName) {
  return MIME_TYPES_BY_EXTENSION[path.extname(fileName).toLowerCase()] || 'application/octet-stream';
}

function attachmentsRoot() {
  return getWorkspaceStore().attachmentsRoot();
}

function getWorkspaceStore() {
  if (!workspaceStore) workspaceStore = new WorkspaceStore({
    userDataPath: app.getPath('userData'),
    documentsPath: app.getPath('documents')
  });
  return workspaceStore;
}

function safeId(value, label) {
  if (typeof value !== 'string' || !/^[a-z0-9-]+$/i.test(value)) throw new Error(`Ongeldig ${label}.`);
  return value;
}

function projectFilesDirectory(projectId) {
  return path.join(attachmentsRoot(), safeId(projectId, 'project-id'));
}

function assertManagedAttachmentPath(filePath) {
  if (typeof filePath !== 'string' || !filePath) throw new Error('Invalid file path.');
  const root = path.resolve(attachmentsRoot()) + path.sep;
  const resolved = path.resolve(path.isAbsolute(filePath) ? filePath : path.join(getWorkspaceStore().status().path, filePath));
  if (!resolved.startsWith(root)) throw new Error('This file is not in a managed DeepScribe folder.');
  return resolved;
}

async function availableDestination(directory, fileName) {
  const extension = path.extname(fileName);
  const stem = path.basename(fileName, extension);
  for (let suffix = 0; suffix < 10_000; suffix += 1) {
    const candidate = path.join(directory, suffix === 0 ? fileName : `${stem} (${suffix})${extension}`);
    try {
      await fs.promises.access(candidate);
    } catch {
      return candidate;
    }
  }
  throw new Error('No available file names could be found.');
}

function registerAttachmentIpc() {
  ipcMain.handle('deepscribe:attachments:add', async (_event, payload) => {
    const projectId = safeId(payload?.projectId, 'project-id');
    safeId(payload?.blockId, 'block ID');
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Add Files to DeepScribe',
      properties: ['openFile', 'multiSelections']
    });
    if (result.canceled || result.filePaths.length === 0) return [];

    const sources = await Promise.all(result.filePaths.map(async sourcePath => {
      const stat = await fs.promises.stat(sourcePath);
      if (!stat.isFile()) throw new Error(`“${path.basename(sourcePath)}” is not a file.`);
      if (stat.size > MAX_ATTACHMENT_BYTES) throw new Error(`“${path.basename(sourcePath)}” is groter dan 25 MB.`);
      return { sourcePath, size: stat.size };
    }));

    const directory = projectFilesDirectory(projectId);
    await fs.promises.mkdir(directory, { recursive: true });
    const copied = [];
    try {
      for (const source of sources) {
        const destination = await availableDestination(directory, path.basename(source.sourcePath));
        await fs.promises.copyFile(source.sourcePath, destination, fs.constants.COPYFILE_EXCL);
        copied.push({
          fileName: path.basename(destination),
          fileSize: source.size,
          fileType: inferMimeType(destination),
          localPath: path.relative(getWorkspaceStore().status().path, destination)
        });
      }
      return copied;
    } catch (error) {
      await Promise.allSettled(copied.map(file => fs.promises.unlink(assertManagedAttachmentPath(file.localPath))));
      throw error;
    }
  });

  ipcMain.handle('deepscribe:attachments:open', async (_event, filePath) => {
    const error = await shell.openPath(assertManagedAttachmentPath(filePath));
    if (error) throw new Error(error);
  });

  ipcMain.handle('deepscribe:attachments:show', async (_event, payload) => {
    const directory = projectFilesDirectory(payload?.projectId);
    await fs.promises.mkdir(directory, { recursive: true });
    const error = await shell.openPath(directory);
    if (error) throw new Error(error);
  });

  ipcMain.handle('deepscribe:attachments:remove', async (_event, filePath) => {
    const managedPath = assertManagedAttachmentPath(filePath);
    try {
      await fs.promises.unlink(managedPath);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  });

  ipcMain.handle('deepscribe:attachments:read', async (_event, filePath) => {
    const managedPath = assertManagedAttachmentPath(filePath);
    const stat = await fs.promises.stat(managedPath);
    if (stat.size > MAX_ATTACHMENT_BYTES) throw new Error('This attachment is larger than 25 MB.');
    return (await fs.promises.readFile(managedPath)).toString('base64');
  });

  ipcMain.handle('deepscribe:attachments:import', async (_event, payload) => {
    const projectId = safeId(payload?.projectId, 'project-id');
    safeId(payload?.blockId, 'block ID');
    const fileName = path.basename(String(payload?.fileName || 'attachment'));
    const data = Buffer.from(String(payload?.base64 || ''), 'base64');
    if (data.length > MAX_ATTACHMENT_BYTES) throw new Error(`“${fileName}” is groter dan 25 MB.`);
    const directory = projectFilesDirectory(projectId);
    await fs.promises.mkdir(directory, { recursive: true });
    const destination = await availableDestination(directory, fileName);
    await fs.promises.writeFile(destination, data, { flag: 'wx' });
    return { localPath: path.relative(getWorkspaceStore().status().path, destination) };
  });

  ipcMain.handle('deepscribe:attachments:migrate-legacy', async (_event, payload) => {
    const projectId = safeId(payload?.projectId, 'project-id');
    safeId(payload?.blockId, 'block ID');
    const legacyRoot = path.resolve(path.join(app.getPath('documents'), 'DeepScribe', 'Projects')) + path.sep;
    const source = path.resolve(String(payload?.localPath || ''));
    if (!source.startsWith(legacyRoot)) throw new Error('Invalid existing attachment path.');
    const stat = await fs.promises.stat(source);
    if (!stat.isFile() || stat.size > MAX_ATTACHMENT_BYTES) throw new Error('The existing attachment is invalid or too large.');
    const directory = projectFilesDirectory(projectId);
    await fs.promises.mkdir(directory, { recursive: true });
    const destination = await availableDestination(directory, path.basename(source));
    await fs.promises.copyFile(source, destination, fs.constants.COPYFILE_EXCL);
    return { localPath: path.relative(getWorkspaceStore().status().path, destination) };
  });
}

function registerScreenCaptureIpc() {
  ipcMain.handle('deepscribe:seescribe:capture', async (_event, command) => {
    return launchSeeScribe(typeof command === 'string' ? command : 'capture');
  });

  ipcMain.handle('deepscribe:seescribe:status', async () => {
    return { executablePath: resolveSeeScribePath() };
  });

  ipcMain.handle('deepscribe:seescribe:set-path', async (_event, executablePath) => {
    if (typeof executablePath !== 'string' || !fs.existsSync(executablePath)) {
      throw new Error('Dit pad bestaat niet.');
    }
    setSeeScribePath(executablePath);
    return { executablePath };
  });

  ipcMain.handle('deepscribe:screen:trigger-overlay', async () => {
    await captureScreenAndOpenOverlay();
    return { ok: true };
  });

  ipcMain.handle('deepscribe:screen:get-overlay-data', async () => {
    return pendingOverlayData;
  });

  ipcMain.handle('deepscribe:screen:close-overlay', async () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.close();
      overlayWindow = null;
    }
    pendingOverlayData = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('deepscribe:screen:close-overlay');
    }
    return { ok: true };
  });

  ipcMain.handle('deepscribe:screen:save-and-close', async (_event, payload) => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.close();
      overlayWindow = null;
    }
    pendingOverlayData = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      if (payload?.block) {
        mainWindow.webContents.send('deepscribe:screen:block-created', payload.block);
      }
    }
    return { ok: true };
  });
}

function registerTrayIpc() {
  ipcMain.handle('deepscribe:tray:minimize', async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }
  });

  ipcMain.handle('deepscribe:tray:set-enabled', async (_event, enabled) => {
    isTrayEnabled = !!enabled;
    if (isTrayEnabled) {
      setupTray();
    } else {
      if (tray) {
        try { tray.destroy(); } catch {}
        tray = null;
      }
    }
    return isTrayEnabled;
  });

  ipcMain.handle('deepscribe:tray:is-enabled', async () => {
    return isTrayEnabled;
  });
}

function registerWorkspaceIpc() {
  ipcMain.handle('deepscribe:workspace:status', () => getWorkspaceStore().status());
  ipcMain.handle('deepscribe:workspace:load', () => getWorkspaceStore().loadSnapshot());
  ipcMain.handle('deepscribe:workspace:save', (_event, snapshot) => getWorkspaceStore().saveSnapshot(snapshot));
  ipcMain.handle('deepscribe:workspace:open', async () => {
    const error = await shell.openPath(getWorkspaceStore().status().path);
    if (error) throw new Error(error);
  });
  ipcMain.handle('deepscribe:workspace:choose-and-move', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose a New Parent Folder for DeepScribe',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const moved = getWorkspaceStore().move(result.filePaths[0]);
    return moved;
  });
}

function registerPrintIpc() {
  ipcMain.handle('deepscribe:print:block-document', async (event, payload) => {
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
      throw new Error('The print job did not originate from the active DeepScribe window.');
    }
    if (activePrintWindow && !activePrintWindow.isDestroyed()) {
      throw new Error('A print job is already active.');
    }
    if (!payload || typeof payload.html !== 'string' || !payload.html.trim()) {
      throw new Error('The print document is empty.');
    }
    if (Buffer.byteLength(payload.html, 'utf8') > MAX_PRINT_DOCUMENT_BYTES) {
      throw new Error('The print document is too large to process safely.');
    }

    const rawJobName = typeof payload.jobName === 'string' ? payload.jobName : 'DeepScribe';
    const pageSize = payload.pageSize === 'A5' ? 'A5' : 'A4';
    const jobName = Array.from(rawJobName, character => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? ' ' : character;
    }).join('').trim().slice(0, 200) || 'DeepScribe';
    const tempDirectory = await fs.promises.mkdtemp(path.join(app.getPath('temp'), 'deepscribe-print-'));
    const tempFile = path.join(tempDirectory, 'document.html');
    let printWindow;

    try {
      await fs.promises.writeFile(tempFile, payload.html, 'utf8');
      printWindow = new BrowserWindow({
        show: false,
        parent: mainWindow,
        title: jobName,
        backgroundColor: '#ffffff',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          javascript: false
        }
      });
      activePrintWindow = printWindow;
      printWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      printWindow.webContents.on('will-navigate', navigationEvent => navigationEvent.preventDefault());
      await printWindow.loadFile(tempFile);

      return await new Promise((resolve, reject) => {
        try {
          printWindow.webContents.print({
            silent: false,
            printBackground: true,
            landscape: false,
            pageSize,
            margins: { marginType: 'default' }
          }, (success, failureReason) => {
            if (success) {
              resolve({ status: 'printed' });
              return;
            }
            if ((failureReason || '').toLowerCase().includes('cancel')) {
              resolve({ status: 'cancelled' });
              return;
            }
            reject(new Error(failureReason || 'The print job failed.'));
          });
        } catch (error) {
          reject(error);
        }
      });
    } finally {
      if (activePrintWindow === printWindow) activePrintWindow = undefined;
      if (printWindow && !printWindow.isDestroyed()) printWindow.destroy();
      try { await fs.promises.unlink(tempFile); } catch { /* Tempbestand bestond niet of is al verwijderd. */ }
      try { await fs.promises.rmdir(tempDirectory); } catch { /* Tijdelijke map wordt later door het OS opgeruimd. */ }
    }
  });

  ipcMain.handle('deepscribe:export:block-document-pdf', async (event, payload) => {
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
      throw new Error('The PDF export did not originate from the active DeepScribe window.');
    }
    if (activePrintWindow && !activePrintWindow.isDestroyed()) {
      throw new Error('A print or PDF export job is already active.');
    }
    if (!payload || typeof payload.html !== 'string' || !payload.html.trim()) {
      throw new Error('The PDF document is empty.');
    }
    if (Buffer.byteLength(payload.html, 'utf8') > MAX_PRINT_DOCUMENT_BYTES) {
      throw new Error('The PDF document is too large to process safely.');
    }

    const rawJobName = typeof payload.jobName === 'string' ? payload.jobName : 'DeepScribe';
    const pageSize = payload.pageSize === 'A5' ? 'A5' : 'A4';
    const jobName = Array.from(rawJobName, character => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? ' ' : character;
    }).join('').trim().slice(0, 200) || 'DeepScribe';
    const defaultFileName = `${jobName.replace(/[\\/:*?"<>|]/g, '-').trim() || 'DeepScribe'}.pdf`;
    const saveResult = await dialog.showSaveDialog(mainWindow, {
      title: 'Export PDF',
      defaultPath: path.join(app.getPath('downloads'), defaultFileName),
      filters: [{ name: 'PDF files', extensions: ['pdf'] }]
    });
    if (saveResult.canceled || !saveResult.filePath) return { status: 'cancelled' };

    const tempDirectory = await fs.promises.mkdtemp(path.join(app.getPath('temp'), 'deepscribe-pdf-'));
    const tempFile = path.join(tempDirectory, 'document.html');
    let printWindow;

    try {
      await fs.promises.writeFile(tempFile, payload.html, 'utf8');
      printWindow = new BrowserWindow({
        show: false,
        parent: mainWindow,
        title: jobName,
        backgroundColor: '#ffffff',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          javascript: false
        }
      });
      activePrintWindow = printWindow;
      printWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      printWindow.webContents.on('will-navigate', navigationEvent => navigationEvent.preventDefault());
      await printWindow.loadFile(tempFile);
      const pdf = await printWindow.webContents.printToPDF({
        pageSize,
        printBackground: true,
        landscape: false,
        preferCSSPageSize: true
      });
      await fs.promises.writeFile(saveResult.filePath, pdf);
      return { status: 'exported', filePath: saveResult.filePath };
    } finally {
      if (activePrintWindow === printWindow) activePrintWindow = undefined;
      if (printWindow && !printWindow.isDestroyed()) printWindow.destroy();
      try { await fs.promises.unlink(tempFile); } catch { /* Temp file was not created or already removed. */ }
      try { await fs.promises.rmdir(tempDirectory); } catch { /* The OS will clear the temporary directory later. */ }
    }
  });

  ipcMain.handle('deepscribe:export:headless-pdf', async (event, payload) => {
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
      throw new Error('The PDF export did not originate from the active DeepScribe window.');
    }
    if (!payload || typeof payload.html !== 'string' || !payload.html.trim()) {
      throw new Error('The PDF document is empty.');
    }
    if (Buffer.byteLength(payload.html, 'utf8') > MAX_PRINT_DOCUMENT_BYTES) {
      throw new Error('The PDF document is too large to process safely.');
    }

    const rawJobName = typeof payload.jobName === 'string' ? payload.jobName : 'DeepScribe';
    const pageSize = payload.pageSize === 'A5' ? 'A5' : 'A4';
    const jobName = Array.from(rawJobName, character => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? ' ' : character;
    }).join('').trim().slice(0, 200) || 'DeepScribe';
    const defaultFileName = `${jobName.replace(/[\\/:*?"<>|]/g, '-').trim() || 'DeepScribe'}.pdf`;

    let targetFilePath = payload.outputPath;
    if (!targetFilePath || typeof targetFilePath !== 'string') {
      targetFilePath = path.join(app.getPath('downloads'), defaultFileName);
    } else {
      targetFilePath = path.resolve(targetFilePath);
    }

    const tempDirectory = await fs.promises.mkdtemp(path.join(app.getPath('temp'), 'deepscribe-headless-pdf-'));
    const tempFile = path.join(tempDirectory, 'document.html');
    let printWindow;

    try {
      await fs.promises.mkdir(path.dirname(targetFilePath), { recursive: true });
      await fs.promises.writeFile(tempFile, payload.html, 'utf8');
      printWindow = new BrowserWindow({
        show: false,
        title: jobName,
        backgroundColor: '#ffffff',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          javascript: false
        }
      });
      printWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      printWindow.webContents.on('will-navigate', navigationEvent => navigationEvent.preventDefault());
      await printWindow.loadFile(tempFile);
      const pdf = await printWindow.webContents.printToPDF({
        pageSize,
        printBackground: true,
        landscape: false,
        preferCSSPageSize: true
      });
      await fs.promises.writeFile(targetFilePath, pdf);
      return { status: 'exported', filePath: targetFilePath, sizeBytes: pdf.byteLength };
    } finally {
      if (printWindow && !printWindow.isDestroyed()) printWindow.destroy();
      try { await fs.promises.unlink(tempFile); } catch { /* Temp file was not created or already removed. */ }
      try { await fs.promises.rmdir(tempDirectory); } catch { /* The OS will clear the temporary directory later. */ }
    }
  });

  ipcMain.handle('deepscribe:export:write-file', async (event, payload) => {
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
      throw new Error('The file export did not originate from the active DeepScribe window.');
    }
    if (!payload || typeof payload.filePath !== 'string' || typeof payload.content !== 'string') {
      throw new Error('Invalid file export payload.');
    }
    const targetFilePath = path.resolve(payload.filePath);
    await fs.promises.mkdir(path.dirname(targetFilePath), { recursive: true });
    await fs.promises.writeFile(targetFilePath, payload.content, 'utf8');
    const stats = await fs.promises.stat(targetFilePath);
    return { status: 'exported', filePath: targetFilePath, sizeBytes: stats.size };
  });
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    updateState = { ...updateState, status: 'checking', error: null };
    broadcastUpdateState();
  });

  autoUpdater.on('update-available', info => {
    updateState = {
      ...updateState,
      status: 'available',
      availableVersion: info?.version || null,
      releaseNotes: typeof info?.releaseNotes === 'string' ? info.releaseNotes : null,
      error: null
    };
    broadcastUpdateState();
  });

  autoUpdater.on('update-not-available', () => {
    updateState = {
      ...updateState,
      status: 'not-available',
      error: null
    };
    broadcastUpdateState();
  });

  autoUpdater.on('error', err => {
    updateState = {
      ...updateState,
      status: 'error',
      error: err instanceof Error ? err.message : String(err)
    };
    broadcastUpdateState();
  });

  autoUpdater.on('download-progress', progressObj => {
    updateState = {
      ...updateState,
      status: 'downloading',
      progress: {
        percent: Math.round(progressObj.percent || 0),
        bytesPerSecond: Math.round(progressObj.bytesPerSecond || 0),
        transferred: progressObj.transferred || 0,
        total: progressObj.total || 0
      }
    };
    broadcastUpdateState();
  });

  autoUpdater.on('update-downloaded', info => {
    updateState = {
      ...updateState,
      status: 'downloaded',
      availableVersion: info?.version || updateState.availableVersion,
      error: null
    };
    broadcastUpdateState();
  });
}

function registerUpdaterIpc() {
  ipcMain.handle('deepscribe:updater:get-state', () => {
    return { ...updateState, currentVersion: app.getVersion() };
  });

  ipcMain.handle('deepscribe:updater:check', async () => {
    updateState = { ...updateState, status: 'checking', error: null };
    broadcastUpdateState();
    try {
      const result = await autoUpdater.checkForUpdates();
      return { ok: true, updateInfo: result?.updateInfo };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      updateState = { ...updateState, status: 'error', error: errorMsg };
      broadcastUpdateState();
      return { ok: false, error: errorMsg };
    }
  });

  ipcMain.handle('deepscribe:updater:download', async () => {
    updateState = { ...updateState, status: 'downloading', error: null };
    broadcastUpdateState();
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      updateState = { ...updateState, status: 'error', error: errorMsg };
      broadcastUpdateState();
      return { ok: false, error: errorMsg };
    }
  });

  ipcMain.handle('deepscribe:updater:install', async () => {
    isInstallingUpdate = true;
    isQuitting = true;
    workspaceQuitReady = true;

    if (mainWindow && !mainWindow.isDestroyed()) {
      await new Promise(resolve => {
        const timeout = setTimeout(resolve, 2000);
        ipcMain.once('deepscribe-workspace-flushed', () => {
          clearTimeout(timeout);
          resolve();
        });
        mainWindow.webContents.send('deepscribe-workspace-flush');
      });
    }

    globalShortcut.unregisterAll();
    askSeeScribeToQuit();
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      try { overlayWindow.destroy(); } catch {}
      overlayWindow = null;
    }
    if (tray) {
      try { tray.destroy(); } catch {}
      tray = null;
    }
    stopMcpBridge();
    workspaceStore?.close();

    autoUpdater.quitAndInstall(true, true);
    return { ok: true };
  });
}


function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(payload));
}

function requestRenderer(method, params) {
  return new Promise((resolve, reject) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      reject(new Error('Het DeepScribe-venster is niet beschikbaar.'));
      return;
    }

    const id = crypto.randomUUID();
    const timeout = setTimeout(() => {
      pendingBridgeRequests.delete(id);
      reject(new Error('DeepScribe reageerde niet op tijd.'));
    }, 15000);
    pendingBridgeRequests.set(id, { resolve, reject, timeout });
    mainWindow.webContents.send('deepscribe-mcp-request', { id, method, params });
  });
}

function startMcpBridge() {
  if (bridgeServer) return;
  const token = crypto.randomBytes(32).toString('hex');
  bridgeInfoPath = path.join(app.getPath('userData'), 'deepscribe-mcp-bridge.json');
  bridgeServer = http.createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      sendJson(response, 200, { ok: true, app: 'DeepScribe' });
      return;
    }
    if (request.method !== 'POST' || request.url !== '/rpc') {
      sendJson(response, 404, { ok: false, error: 'Niet gevonden.' });
      return;
    }
    if (request.headers.authorization !== `Bearer ${token}`) {
      sendJson(response, 401, { ok: false, error: 'Niet geautoriseerd.' });
      return;
    }

    let body = '';
    let aborted = false;
    request.setEncoding('utf8');
    request.on('data', chunk => {
      if (aborted) return;
      body += chunk;
      if (body.length > MAX_BRIDGE_REQUEST_BYTES) {
        // Antwoord met een leesbare fout in plaats van de verbinding te verbreken.
        // Een verbroken verbinding is aan de andere kant niet te onderscheiden van
        // een afgesloten DeepScribe, wat tot misleidende meldingen leidt.
        aborted = true;
        sendJson(response, 413, { ok: false, error: 'Dit verzoek is te groot voor de DeepScribe-bridge.' });
        request.destroy();
      }
    });
    request.on('end', async () => {
      if (aborted) return;
      try {
        const payload = JSON.parse(body);
        if (!payload || typeof payload.method !== 'string') throw new Error('Ongeldig bridge-verzoek.');
        const result = await requestRenderer(payload.method, payload.params);
        sendJson(response, 200, { ok: true, result });
      } catch (error) {
        sendJson(response, 400, { ok: false, error: error instanceof Error ? error.message : 'Unknown error.' });
      }
    });
  });

  bridgeServer.listen(0, '127.0.0.1', () => {
    const address = bridgeServer.address();
    if (!address || typeof address === 'string') return;
    fs.mkdirSync(path.dirname(bridgeInfoPath), { recursive: true });
    fs.writeFileSync(bridgeInfoPath, JSON.stringify({ port: address.port, token }), { encoding: 'utf8', mode: 0o600 });
  });
}

function stopMcpBridge() {
  for (const pending of pendingBridgeRequests.values()) {
    clearTimeout(pending.timeout);
    pending.reject(new Error('DeepScribe wordt afgesloten.'));
  }
  pendingBridgeRequests.clear();
  bridgeServer?.close();
  if (bridgeInfoPath) {
    try { fs.unlinkSync(bridgeInfoPath); } catch { /* Already removed. */ }
  }
}

ipcMain.on('deepscribe-mcp-response', (_event, response) => {
  const pending = response && pendingBridgeRequests.get(response.id);
  if (!pending) return;
  clearTimeout(pending.timeout);
  pendingBridgeRequests.delete(response.id);
  if (response.ok) pending.resolve(response.result);
  else pending.reject(new Error(response.error || 'DeepScribe kon het verzoek niet uitvoeren.'));
});

ipcMain.on('deepscribe-mcp-ready', startMcpBridge);
ipcMain.on('deepscribe-workspace-flushed', () => {
  workspaceQuitReady = true;
  if (!isInstallingUpdate) {
    app.quit();
  }
});

const SEESCRIBE_CONFIG_FILE = 'seescribe.json';

/**
 * Zoekt het uitvoerbare bestand van SeeScribe. Een expliciet ingesteld pad gaat voor;
 * daarna worden de plaatsen geprobeerd waar een lokale build terechtkomt.
 */
function resolveSeeScribePath() {
  const configPath = path.join(app.getPath('userData'), SEESCRIBE_CONFIG_FILE);
  try {
    const configured = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (typeof configured.executablePath === 'string' && fs.existsSync(configured.executablePath)) {
      return configured.executablePath;
    }
  } catch {
    // Geen instelling; val terug op de conventionele locaties.
  }

  // Geïnstalleerd reist SeeScribe mee als extra bron naast de app.
  // In ontwikkeling staat het naast de repository, gebouwd vanuit seescribe/.
  const repoRoot = app.isPackaged ? null : app.getAppPath();
  const candidates = [
    path.join(process.resourcesPath || '', 'seescribe', 'SeeScribe.App.exe'),
    repoRoot && path.join(repoRoot, 'seescribe', 'src', 'SeeScribe.App', 'bin', 'Release', 'net8.0-windows', 'SeeScribe.App.exe'),
    repoRoot && path.join(repoRoot, 'seescribe', 'src', 'SeeScribe.App', 'bin', 'Debug', 'net8.0-windows', 'SeeScribe.App.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'SeeScribe', 'SeeScribe.App.exe')
  ];

  return candidates.find(candidate => candidate && fs.existsSync(candidate)) || null;
}

function setSeeScribePath(executablePath) {
  const configPath = path.join(app.getPath('userData'), SEESCRIBE_CONFIG_FILE);
  fs.writeFileSync(configPath, JSON.stringify({ executablePath }), { encoding: 'utf8' });
}

/**
 * Start SeeScribe met een opdracht. SeeScribe laat maar één instantie toe: draait hij al,
 * dan geeft deze aanroep de opdracht door aan de draaiende instantie en sluit zichzelf.
 * Daardoor is starten en aansturen dezelfde handeling.
 */
function launchSeeScribe(command = 'capture') {
  const executablePath = resolveSeeScribePath();
  if (!executablePath) {
    return { ok: false, error: 'SeeScribe is niet gevonden. Stel het pad in bij de instellingen.' };
  }

  try {
    const child = spawn(executablePath, ['--' + command], { detached: true, stdio: 'ignore' });
    child.unref();
    return { ok: true, executablePath };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'SeeScribe kon niet worden gestart.' };
  }
}

/**
 * Vraagt een draaiende SeeScribe zichzelf af te sluiten. SeeScribe kan zonder DeepScribe
 * niets bewaren, dus achterblijven als los systeemvakicoon heeft geen zin.
 *
 * Er wordt rechtstreeks naar de named pipe van SeeScribe geschreven in plaats van een
 * proces te starten of af te breken: SeeScribe sluit dan zelf netjes af, en een
 * openstaande annotatie mag eerst worden afgemaakt.
 */
function askSeeScribeToQuit() {
  return new Promise(resolve => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    try {
      const client = net.connect({ path: '\\\\.\\pipe\\SeeScribe.Command' }, () => {
        client.end('quit', done);
      });
      // Draait SeeScribe niet, dan bestaat de pipe niet. Dat is geen fout.
      client.on('error', done);
      client.setTimeout(1500, () => {
        client.destroy();
        done();
      });
    } catch {
      done();
    }
  });
}

async function captureScreenAndOpenOverlay() {
  try {
    const cursorPoint = screen.getCursorScreenPoint();
    const currentDisplay = screen.getDisplayNearestPoint(cursorPoint);
    const { x, y, width, height } = currentDisplay.bounds;
    const scale = currentDisplay.scaleFactor || 1;

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: Math.round(width * scale), height: Math.round(height * scale) }
    });

    let source = sources.find(s => s.display_id === currentDisplay.id.toString()) || sources[0];
    if (!source && sources.length > 0) source = sources[0];

    if (!source || !source.thumbnail) {
      console.warn('No screen capture source available');
      return;
    }

    const screenshotDataUrl = source.thumbnail.toDataURL();
    pendingOverlayData = {
      screenshotDataUrl,
      width,
      height,
      scaleFactor: scale
    };

    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.setBounds({ x, y, width, height });
      overlayWindow.show();
      overlayWindow.focus();
      overlayWindow.webContents.send('deepscribe:screen:open-overlay', pendingOverlayData);
      return;
    }

    overlayWindow = new BrowserWindow({
      x,
      y,
      width,
      height,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      resizable: false,
      movable: false,
      fullscreenable: false,
      enableLargerThanScreen: true,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false
      }
    });

    overlayWindow.on('closed', () => {
      overlayWindow = null;
      pendingOverlayData = null;
    });

    overlayWindow.webContents.on('did-finish-load', () => {
      if (pendingOverlayData && overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send('deepscribe:screen:open-overlay', pendingOverlayData);
      }
    });

    const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
    if (isDev) {
      const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
      overlayWindow.loadURL(`${devUrl}?overlay=true`);
    } else {
      overlayWindow.loadFile(path.join(__dirname, '../dist/index.html'), { query: { overlay: 'true' } });
    }
  } catch (err) {
    console.error('Error capturing screen for DeepScribe overlay:', err);
  }
}

function getAppIconPath() {
  const iconCandidates = [
    path.join(__dirname, '../dist/icon.png'),
    path.join(__dirname, '../public/icon.png'),
    path.join(__dirname, '../dist/favicon.png'),
    path.join(__dirname, '../public/favicon.png'),
    path.join(__dirname, '../mcp/extension/icon.png'),
    path.join(__dirname, '../dist/favicon.svg'),
    path.join(__dirname, '../public/favicon.svg')
  ];
  for (const candidate of iconCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return path.join(__dirname, '../public/favicon.svg');
}

function showMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.setAlwaysOnTop(false);
    mainWindow.focus();
  }
}

/**
 * Start een vastlegging. SeeScribe heeft de voorkeur zodra het beschikbaar is;
 * de ingebouwde overlay blijft achter de hand tot SeeScribe die rol volledig overneemt.
 */
function startScreenAnnotation() {
  if (!resolveSeeScribePath()) {
    // SeeScribe is niet geïnstalleerd; de ingebouwde overlay blijft dan de terugval.
    captureScreenAndOpenOverlay();
    return;
  }

  const result = launchSeeScribe('capture');
  if (result.ok) return;

  // SeeScribe is er wel maar start niet. Dat moet zichtbaar zijn in plaats van
  // stilzwijgend de oude overlay openen, anders blijft de storing onopgemerkt.
  console.error('SeeScribe kon niet worden gestart:', result.error);
  dialog.showErrorBox('SeeScribe kon niet worden gestart', result.error);
}

function setupTray() {
  if (tray) return;
  const iconPath = getAppIconPath();
  try {
    const iconImage = nativeImage.createFromPath(iconPath);
    const trayIcon = !iconImage.isEmpty()
      ? (process.platform === 'win32' ? iconImage.resize({ width: 16, height: 16 }) : iconImage)
      : iconPath;

    tray = new Tray(trayIcon);
    const contextMenu = Menu.buildFromTemplate([
      {
        label: '📸 Scherm annoteren (Ctrl+Alt+S)',
        click: () => startScreenAnnotation()
      },
      { type: 'separator' },
      {
        label: '👁️ Open DeepScribe',
        click: () => {
          showMainWindow();
        }
      },
      { type: 'separator' },
      {
        label: '❌ Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setToolTip('DeepScribe');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
      showMainWindow();
    });

    tray.on('double-click', () => {
      showMainWindow();
    });
  } catch (e) {
    console.warn('Tray setup warning:', e);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'DeepScribe',
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    },
    autoHideMenuBar: true
  });

  const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
  if (isDev) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('close', event => {
    if (workspaceQuitReady) {
      return;
    }

    if (!isQuitting && isTrayEnabled) {
      event.preventDefault();
      mainWindow.hide();
      // Auto-flush workspace in background when hiding to tray
      mainWindow.webContents.send('deepscribe-workspace-flush');
      return;
    }

    if (!isQuitting) {
      event.preventDefault();
      isQuitting = true;
      app.quit();
      return;
    }
  });

  mainWindow.on('minimize', event => {
    if (isTrayEnabled) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // Open external HTTP/HTTPS links in user's default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
}

function handleDeepLinkUrl(url) {
  if (typeof url !== 'string') return;
  const match = url.match(/^deepscribe:\/\/(task|block)\/([^/?#]+)/i);
  if (!match) return;
  const targetType = match[1].toLowerCase();
  const targetId = decodeURIComponent(match[2]);
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('deepscribe:navigate-to-target', { type: targetType, targetId });
  }
}

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('deepscribe', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('deepscribe');
}

// Single instance lock to prevent duplicate app windows
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  registerAttachmentIpc();
  registerWorkspaceIpc();
  registerPrintIpc();
  registerUpdaterIpc();
  registerScreenCaptureIpc();
  registerTrayIpc();
  setupAutoUpdater();

  app.on('second-instance', (_event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
    const deepLinkArg = Array.isArray(commandLine) ? commandLine.find(arg => arg.startsWith('deepscribe://')) : null;
    if (deepLinkArg) {
      handleDeepLinkUrl(deepLinkArg);
    }
  });

  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleDeepLinkUrl(url);
  });

  app.whenReady().then(() => {
    createWindow();
    setupTray();

    const initialDeepLink = process.argv.find(arg => arg.startsWith('deepscribe://'));
    if (initialDeepLink) {
      mainWindow.webContents.once('did-finish-load', () => {
        handleDeepLinkUrl(initialDeepLink);
      });
    }

    // DeepScribe claimt Ctrl+Alt+S en stuurt hem door naar SeeScribe. Daardoor werkt de
    // sneltoets ook wanneer SeeScribe nog niet draait: dezelfde aanroep start hem.
    // Lukt registratie niet, dan heeft SeeScribe hem zelf al; ook dan komt de vastlegging goed terecht.
    try {
      const registered = globalShortcut.register('CommandOrControl+Alt+S', () => {
        startScreenAnnotation();
      });
      if (!registered) {
        console.info('Ctrl+Alt+S is al geclaimd, waarschijnlijk door SeeScribe zelf.');
      }
    } catch (e) {
      console.warn('Failed to register global hotkey CommandOrControl+Alt+S:', e);
    }

    // In production, perform an initial background check for updates after 5s
    const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
    if (!isDev && app.isPackaged) {
      setTimeout(() => {
        autoUpdater.checkForUpdates().catch(err => {
          console.warn('Auto-updater background check failed:', err);
        });
      }, 5000);
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !isTrayEnabled) {
    app.quit();
  }
});

app.on('before-quit', event => {
  isQuitting = true;
  globalShortcut.unregisterAll();
  askSeeScribeToQuit();
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    try { overlayWindow.destroy(); } catch {}
    overlayWindow = null;
  }
  if (tray) {
    try { tray.destroy(); } catch {}
    tray = null;
  }

  if (!workspaceQuitReady && mainWindow && !mainWindow.isDestroyed()) {
    event.preventDefault();
    mainWindow.webContents.send('deepscribe-workspace-flush');
    setTimeout(() => {
      workspaceQuitReady = true;
      app.quit();
    }, 5000).unref();
    return;
  }
  stopMcpBridge();
  workspaceStore?.close();
});
