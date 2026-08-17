const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { WorkspaceStore } = require('./workspace.cjs');

let mainWindow;
let bridgeServer;
let bridgeInfoPath;
let workspaceStore;
let workspaceQuitReady = false;
const pendingBridgeRequests = new Map();
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

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
  if (typeof filePath !== 'string' || !filePath) throw new Error('Ongeldig bestandspad.');
  const root = path.resolve(attachmentsRoot()) + path.sep;
  const resolved = path.resolve(path.isAbsolute(filePath) ? filePath : path.join(getWorkspaceStore().status().path, filePath));
  if (!resolved.startsWith(root)) throw new Error('Dit bestand staat niet in een beheerde DeepScribe-map.');
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
  throw new Error('Er konden geen vrije bestandsnamen worden gevonden.');
}

function registerAttachmentIpc() {
  ipcMain.handle('deepscribe:attachments:add', async (_event, payload) => {
    const projectId = safeId(payload?.projectId, 'project-id');
    safeId(payload?.blockId, 'blok-id');
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Bestanden aan DeepScribe toevoegen',
      properties: ['openFile', 'multiSelections']
    });
    if (result.canceled || result.filePaths.length === 0) return [];

    const sources = await Promise.all(result.filePaths.map(async sourcePath => {
      const stat = await fs.promises.stat(sourcePath);
      if (!stat.isFile()) throw new Error(`“${path.basename(sourcePath)}” is geen bestand.`);
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
    if (stat.size > MAX_ATTACHMENT_BYTES) throw new Error('Deze bijlage is groter dan 25 MB.');
    return (await fs.promises.readFile(managedPath)).toString('base64');
  });

  ipcMain.handle('deepscribe:attachments:import', async (_event, payload) => {
    const projectId = safeId(payload?.projectId, 'project-id');
    safeId(payload?.blockId, 'blok-id');
    const fileName = path.basename(String(payload?.fileName || 'bijlage'));
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
    safeId(payload?.blockId, 'blok-id');
    const legacyRoot = path.resolve(path.join(app.getPath('documents'), 'DeepScribe', 'Projects')) + path.sep;
    const source = path.resolve(String(payload?.localPath || ''));
    if (!source.startsWith(legacyRoot)) throw new Error('Ongeldig bestaand bijlagepad.');
    const stat = await fs.promises.stat(source);
    if (!stat.isFile() || stat.size > MAX_ATTACHMENT_BYTES) throw new Error('Bestaande bijlage is ongeldig of te groot.');
    const directory = projectFilesDirectory(projectId);
    await fs.promises.mkdir(directory, { recursive: true });
    const destination = await availableDestination(directory, path.basename(source));
    await fs.promises.copyFile(source, destination, fs.constants.COPYFILE_EXCL);
    return { localPath: path.relative(getWorkspaceStore().status().path, destination) };
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
      title: 'Kies een nieuwe bovenliggende map voor DeepScribe',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const moved = getWorkspaceStore().move(result.filePaths[0]);
    return moved;
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
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('deepscribe-workspace-flush');
      await new Promise(resolve => setTimeout(resolve, 800));
    }
    stopMcpBridge();
    workspaceStore?.close();
    setImmediate(() => {
      autoUpdater.quitAndInstall(false, true);
    });
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
    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) request.destroy();
    });
    request.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        if (!payload || typeof payload.method !== 'string') throw new Error('Ongeldig bridge-verzoek.');
        const result = await requestRenderer(payload.method, payload.params);
        sendJson(response, 200, { ok: true, result });
      } catch (error) {
        sendJson(response, 400, { ok: false, error: error instanceof Error ? error.message : 'Onbekende fout.' });
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
  app.quit();
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'DeepScribe',
    icon: path.join(__dirname, '../public/favicon.svg'),
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

  // Open external HTTP/HTTPS links in user's default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
}

// Single instance lock to prevent duplicate app windows
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  registerAttachmentIpc();
  registerWorkspaceIpc();
  registerUpdaterIpc();
  setupAutoUpdater();

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();

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
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', event => {
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
