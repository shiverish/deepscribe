const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');

let mainWindow;
let bridgeServer;
let bridgeInfoPath;
const pendingBridgeRequests = new Map();
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

function attachmentsRoot() {
  return path.join(app.getPath('documents'), 'DeepScribe', 'Projects');
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
  const resolved = path.resolve(filePath);
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
          fileType: 'application/octet-stream',
          localPath: destination
        });
      }
      return copied;
    } catch (error) {
      await Promise.allSettled(copied.map(file => fs.promises.unlink(file.localPath)));
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
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();

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

app.on('before-quit', stopMcpBridge);
