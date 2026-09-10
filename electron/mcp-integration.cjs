const { spawn } = require('child_process');
const path = require('path');

const CODEX_SERVER_NAME = 'deepscribe';

function resolveMcpRuntime({ isPackaged, resourcesPath, appPath, executablePath }) {
  return {
    launcherPath: executablePath,
    serverPath: isPackaged
      ? path.join(resourcesPath, 'mcp', 'server.mjs')
      : path.join(appPath, 'mcp', 'server.mjs')
  };
}

function buildCodexMcpInstallPlan({ launcherPath, serverPath }) {
  return {
    command: 'codex',
    args: ['mcp', 'add', CODEX_SERVER_NAME, '--env', 'ELECTRON_RUN_AS_NODE=1', '--', launcherPath, serverPath],
    env: { ELECTRON_RUN_AS_NODE: '1' }
  };
}

function run(command, args, { timeout = 15000, env = process.env } = {}) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const child = spawn(command, args, {
      env,
      shell: process.platform === 'win32',
      windowsHide: true
    });
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish({ ok: false, code: null, stdout, stderr: `${stderr}\nTimed out after ${timeout} ms.`.trim() });
    }, timeout);
    child.stdout?.on('data', chunk => { stdout += chunk; });
    child.stderr?.on('data', chunk => { stderr += chunk; });
    child.once('error', error => finish({ ok: false, code: null, stdout, stderr: `${stderr}\n${error.message}`.trim() }));
    child.once('close', code => finish({ ok: code === 0, code, stdout, stderr }));
  });
}

async function installOrRepairCodexConnection(runtime) {
  // Ignore a missing prior registration; the add below is the authoritative result.
  await run('codex', ['mcp', 'remove', CODEX_SERVER_NAME]);
  const plan = buildCodexMcpInstallPlan(runtime);
  const result = await run(plan.command, plan.args);
  return {
    ok: result.ok,
    message: result.ok ? 'Codex connection installed.' : (result.stderr || result.stdout || 'Codex could not register DeepScribe.'),
    runtime,
    output: result.stdout
  };
}

async function verifyCodexConnection(runtime) {
  const codex = await run('codex', ['mcp', 'list']);
  const registered = codex.ok && new RegExp(`(^|\\s)${CODEX_SERVER_NAME}(\\s|$)`, 'mi').test(codex.stdout);
  const status = await callStatusTool(runtime);
  return {
    ok: registered && status.ok,
    codex: { ok: codex.ok, registered, message: codex.ok ? undefined : (codex.stderr || codex.stdout) },
    status
  };
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
  buildCodexMcpInstallPlan,
  installOrRepairCodexConnection,
  resolveMcpRuntime,
  verifyCodexConnection
};
