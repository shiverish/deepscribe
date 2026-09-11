const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MCP_SERVER_NAME = 'deepscribe';

function resolveMcpRuntime({ isPackaged, resourcesPath, appPath, executablePath }) {
  return {
    launcherPath: executablePath,
    serverPath: isPackaged
      ? path.join(resourcesPath, 'mcp', 'server.mjs')
      : path.join(appPath, 'mcp', 'server.mjs')
  };
}

function resolveCodexConfigPath({ codexHome = process.env.CODEX_HOME, homeDirectory = os.homedir() } = {}) {
  return path.join(codexHome || path.join(homeDirectory, '.codex'), 'config.toml');
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

function buildCodexMcpRegistration({ launcherPath, serverPath }) {
  return [
    '# DeepScribe managed MCP connection',
    `[mcp_servers.${MCP_SERVER_NAME}]`,
    `command = ${tomlString(launcherPath)}`,
    `args = [${tomlString(serverPath)}]`,
    '',
    `[mcp_servers.${MCP_SERVER_NAME}.env]`,
    'ELECTRON_RUN_AS_NODE = "1"',
    '# End DeepScribe managed MCP connection'
  ].join('\n');
}

function withoutCodexRegistration(content) {
  const root = `mcp_servers.${MCP_SERVER_NAME}`;
  const output = [];
  let skipping = false;

  for (const line of String(content || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n')) {
    const table = /^\s*\[([^\]]+)]\s*(?:#.*)?$/.exec(line)?.[1]?.trim();
    if (table) skipping = table === root || table.startsWith(`${root}.`);
    if (skipping) continue;
    if (line.trim() === '# DeepScribe managed MCP connection' || line.trim() === '# End DeepScribe managed MCP connection') continue;
    output.push(line);
  }

  return output.join('\n').trimEnd();
}

function mergeCodexMcpRegistration(content, runtime) {
  const preserved = withoutCodexRegistration(content);
  return `${preserved ? `${preserved}\n\n` : ''}${buildCodexMcpRegistration(runtime)}\n`;
}

function resolveClaudeDesktopConfigPath({ appData = process.env.APPDATA } = {}) {
  const base = appData || (process.platform === 'win32' ? null : path.join(os.homedir(), 'Library', 'Application Support'));
  return base ? path.join(base, 'Claude', 'claude_desktop_config.json') : null;
}

function buildClaudeDesktopRegistration({ launcherPath, serverPath }) {
  return {
    command: launcherPath,
    args: [serverPath],
    env: { ELECTRON_RUN_AS_NODE: '1' }
  };
}

function normalizedPath(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  const normalized = path.normalize(value.trim());
  return process.platform === 'win32' ? normalized.toLocaleLowerCase() : normalized;
}

function registrationMatches(registration, runtime) {
  return Boolean(
    registration
    && normalizedPath(registration.command) === normalizedPath(runtime.launcherPath)
    && Array.isArray(registration.args)
    && registration.args.length === 1
    && normalizedPath(registration.args[0]) === normalizedPath(runtime.serverPath)
    && registration.env?.ELECTRON_RUN_AS_NODE === '1'
  );
}

function readClaudeDesktopConfig(configPath) {
  if (!configPath || !fs.existsSync(configPath)) return { config: {}, exists: false };
  const raw = fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, '');
  try {
    const config = JSON.parse(raw);
    if (!config || Array.isArray(config) || typeof config !== 'object') throw new Error('The root value must be a JSON object.');
    return { config, exists: true };
  } catch (error) {
    throw new Error(`Claude Desktop configuration is not valid JSON: ${error.message}`);
  }
}

function writeClaudeDesktopConfig(configPath, config, existed) {
  const directory = path.dirname(configPath);
  fs.mkdirSync(directory, { recursive: true });
  const suffix = crypto.randomUUID();
  const temporaryPath = `${configPath}.deepscribe-${suffix}.tmp`;
  const backupPath = existed ? `${configPath}.deepscribe-${suffix}.bak` : null;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

  try {
    if (backupPath) fs.renameSync(configPath, backupPath);
    fs.renameSync(temporaryPath, configPath);
    return backupPath;
  } catch (error) {
    try {
      if (backupPath && fs.existsSync(backupPath) && !fs.existsSync(configPath)) fs.renameSync(backupPath, configPath);
    } catch {}
    try { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath); } catch {}
    throw error;
  }
}

function writeTextConfig(configPath, content, existed) {
  const directory = path.dirname(configPath);
  fs.mkdirSync(directory, { recursive: true });
  const suffix = crypto.randomUUID();
  const temporaryPath = `${configPath}.deepscribe-${suffix}.tmp`;
  const backupPath = existed ? `${configPath}.deepscribe-${suffix}.bak` : null;
  fs.writeFileSync(temporaryPath, content, 'utf8');

  try {
    if (backupPath) fs.renameSync(configPath, backupPath);
    fs.renameSync(temporaryPath, configPath);
    return backupPath;
  } catch (error) {
    try {
      if (backupPath && fs.existsSync(backupPath) && !fs.existsSync(configPath)) fs.renameSync(backupPath, configPath);
    } catch {}
    try { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath); } catch {}
    throw error;
  }
}

async function installOrRepairClaudeDesktopConnection(runtime, options = {}) {
  const configPath = options.configPath || resolveClaudeDesktopConfigPath(options);
  if (!configPath) {
    return { ok: false, changed: false, message: 'Claude Desktop configuration could not be located on this computer.' };
  }
  if (!fs.existsSync(path.dirname(configPath))) {
    return { ok: false, changed: false, message: 'Claude Desktop was not detected. Install and open Claude Desktop once, then try again.', configPath };
  }

  try {
    const { config, exists } = readClaudeDesktopConfig(configPath);
    const current = config.mcpServers?.[MCP_SERVER_NAME];
    if (registrationMatches(current, runtime)) {
      return {
        ok: true,
        changed: false,
        message: 'Claude Desktop connection is already installed. Restart Claude Desktop if the tools are not visible.',
        configPath
      };
    }

    const next = {
      ...config,
      mcpServers: {
        ...(config.mcpServers && typeof config.mcpServers === 'object' && !Array.isArray(config.mcpServers) ? config.mcpServers : {}),
        [MCP_SERVER_NAME]: buildClaudeDesktopRegistration(runtime)
      }
    };
    const backupPath = writeClaudeDesktopConfig(configPath, next, exists);
    return {
      ok: true,
      changed: true,
      message: 'Claude Desktop connection installed. Completely quit and restart Claude Desktop, then run Check connection.',
      configPath,
      backupPath
    };
  } catch (error) {
    return { ok: false, changed: false, message: error.message, configPath };
  }
}

async function verifyClaudeDesktopConnection(runtime, options = {}) {
  const configPath = options.configPath || resolveClaudeDesktopConfigPath(options);
  let registration = { ok: false, registered: false, message: undefined };

  if (!configPath) {
    registration.message = 'Claude Desktop configuration could not be located on this computer.';
  } else if (!fs.existsSync(path.dirname(configPath))) {
    registration.message = 'Claude Desktop was not detected. Install and open Claude Desktop once, then try again.';
  } else {
    try {
      const { config, exists } = readClaudeDesktopConfig(configPath);
      const registered = exists && registrationMatches(config.mcpServers?.[MCP_SERVER_NAME], runtime);
      registration = {
        ok: true,
        registered,
        message: registered ? undefined : 'DeepScribe is not registered with the current installed app path in Claude Desktop.'
      };
    } catch (error) {
      registration = { ok: false, registered: false, message: error.message };
    }
  }

  const status = options.callStatus ? await options.callStatus(runtime) : await callStatusTool(runtime);
  return { ok: registration.registered && status.ok, registration, status, configPath };
}

async function installOrRepairCodexConnection(runtime, options = {}) {
  const configPath = options.configPath || resolveCodexConfigPath(options);
  try {
    const exists = fs.existsSync(configPath);
    const current = exists ? fs.readFileSync(configPath, 'utf8') : '';
    const next = mergeCodexMcpRegistration(current, runtime);
    if (current.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n') === next) {
      return {
        ok: true,
        changed: false,
        message: 'Codex desktop connection is already installed. Start a new Codex task if the tools are not visible.',
        configPath
      };
    }

    const backupPath = writeTextConfig(configPath, next, exists);
    return {
      ok: true,
      changed: true,
      message: 'Codex desktop connection installed. Completely quit and restart Codex, then start a new task and run Check connection.',
      configPath,
      backupPath
    };
  } catch (error) {
    return { ok: false, changed: false, message: `Codex desktop configuration could not be updated: ${error.message}`, configPath };
  }
}

async function verifyCodexConnection(runtime, options = {}) {
  const configPath = options.configPath || resolveCodexConfigPath(options);
  let registration = { ok: false, registered: false, message: undefined };
  try {
    const current = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
    const registered = current.replace(/\r\n/g, '\n').includes(buildCodexMcpRegistration(runtime));
    registration = {
      ok: true,
      registered,
      message: registered ? undefined : 'DeepScribe is not registered with the current installed app path in Codex desktop.'
    };
  } catch (error) {
    registration = { ok: false, registered: false, message: `Codex desktop configuration could not be read: ${error.message}` };
  }
  const status = options.callStatus ? await options.callStatus(runtime) : await callStatusTool(runtime);
  return { ok: registration.registered && status.ok, registration, status, configPath };
}

function callStatusTool(runtime) {
  return new Promise(resolve => {
    const child = spawn(runtime.launcherPath, [runtime.serverPath], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      windowsHide: true
    });
    let buffer = '';
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      resolve(result);
    };
    const timer = setTimeout(() => finish({ ok: false, message: 'DeepScribe status check timed out.' }), 15000);
    child.once('error', error => finish({ ok: false, message: error.message }));
    child.stderr?.on('data', chunk => { buffer += chunk; });
    child.stdout?.on('data', chunk => {
      for (const line of chunk.toString().split('\n')) {
        if (!line.trim()) continue;
        try {
          const message = JSON.parse(line);
          if (message.id === 1) {
            child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`);
            child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'status', arguments: {} } })}\n`);
          }
          if (message.id === 2) {
            const text = message.result?.content?.find(item => item.type === 'text')?.text;
            finish(message.result?.isError ? { ok: false, message: text || 'DeepScribe status failed.' } : { ok: true, status: text ? JSON.parse(text) : null });
          }
        } catch {
          // MCP transports may write diagnostics outside the JSON-RPC stream.
        }
      }
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'deepscribe-installer', version: '1.0.0' }
    } })}\n`);
  });
}

module.exports = {
  buildClaudeDesktopRegistration,
  buildCodexMcpRegistration,
  installOrRepairClaudeDesktopConnection,
  installOrRepairCodexConnection,
  mergeCodexMcpRegistration,
  registrationMatches,
  resolveClaudeDesktopConfigPath,
  resolveCodexConfigPath,
  resolveMcpRuntime,
  verifyClaudeDesktopConnection,
  verifyCodexConnection
};
