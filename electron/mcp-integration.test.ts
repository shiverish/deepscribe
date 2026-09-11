import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  buildClaudeDesktopRegistration,
  buildCodexMcpInstallPlan,
  installOrRepairClaudeDesktopConnection,
  resolveMcpRuntime,
  verifyClaudeDesktopConnection
} = require('./mcp-integration.cjs') as {
  buildClaudeDesktopRegistration: (runtime: { launcherPath: string; serverPath: string }) => { command: string; args: string[]; env: Record<string, string> };
  buildCodexMcpInstallPlan: (runtime: { launcherPath: string; serverPath: string }) => { command: string; args: string[]; env: Record<string, string> };
  installOrRepairClaudeDesktopConnection: (runtime: { launcherPath: string; serverPath: string }, options: { configPath: string }) => Promise<{ ok: boolean; changed: boolean; message: string; backupPath?: string }>;
  resolveMcpRuntime: (input: { isPackaged: boolean; resourcesPath: string; appPath: string; executablePath: string }) => { launcherPath: string; serverPath: string };
  verifyClaudeDesktopConnection: (runtime: { launcherPath: string; serverPath: string }, options: { configPath: string; callStatus: () => Promise<{ ok: boolean; status: unknown }> }) => Promise<{ ok: boolean; registration: { registered: boolean }; status: { ok: boolean } }>;
};
import fs from 'node:fs';
import os from 'node:os';

describe('DeepScribe Codex MCP integration', () => {
  it('uses the installed app resources rather than a developer workspace path', () => {
    const runtime = resolveMcpRuntime({
      isPackaged: true,
      resourcesPath: 'C:/Program Files/DeepScribe/resources',
      appPath: 'C:/Program Files/DeepScribe/resources/app.asar',
      executablePath: 'C:/Program Files/DeepScribe/DeepScribe.exe'
    });

    expect(runtime).toEqual({
      launcherPath: 'C:/Program Files/DeepScribe/DeepScribe.exe',
      serverPath: path.join('C:/Program Files/DeepScribe/resources', 'mcp', 'server.mjs')
    });
  });

  it('creates a Codex install plan that launches Electron as Node', () => {
    const plan = buildCodexMcpInstallPlan({
      launcherPath: 'C:/Program Files/DeepScribe/DeepScribe.exe',
      serverPath: 'C:/Program Files/DeepScribe/resources/mcp/server.mjs'
    });

    expect(plan.command).toBe('codex');
    expect(plan.env).toEqual({ ELECTRON_RUN_AS_NODE: '1' });
    expect(plan.args).toEqual([
      'mcp', 'add', 'deepscribe', '--env', 'ELECTRON_RUN_AS_NODE=1', '--',
      'C:/Program Files/DeepScribe/DeepScribe.exe',
      'C:/Program Files/DeepScribe/resources/mcp/server.mjs'
    ]);
  });

  it('creates a portable Claude Desktop registration without requiring Node', () => {
    expect(buildClaudeDesktopRegistration({
      launcherPath: 'C:/Program Files/DeepScribe/DeepScribe.exe',
      serverPath: 'C:/Program Files/DeepScribe/resources/mcp/server.mjs'
    })).toEqual({
      command: 'C:/Program Files/DeepScribe/DeepScribe.exe',
      args: ['C:/Program Files/DeepScribe/resources/mcp/server.mjs'],
      env: { ELECTRON_RUN_AS_NODE: '1' }
    });
  });

  it('merges the Claude registration, preserves other servers and creates a backup', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'deepscribe-claude-'));
    const configPath = path.join(directory, 'claude_desktop_config.json');
    const runtime = {
      launcherPath: 'C:/Program Files/DeepScribe/DeepScribe.exe',
      serverPath: 'C:/Program Files/DeepScribe/resources/mcp/server.mjs'
    };
    fs.writeFileSync(configPath, JSON.stringify({ theme: 'dark', mcpServers: { existing: { command: 'existing.exe' } } }));

    try {
      const result = await installOrRepairClaudeDesktopConnection(runtime, { configPath });
      expect(result).toMatchObject({ ok: true, changed: true });
      expect(result.backupPath && fs.existsSync(result.backupPath)).toBe(true);
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      expect(config.theme).toBe('dark');
      expect(config.mcpServers.existing).toEqual({ command: 'existing.exe' });
      expect(config.mcpServers.deepscribe).toEqual(buildClaudeDesktopRegistration(runtime));
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('is idempotent and refuses to overwrite invalid Claude JSON', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'deepscribe-claude-'));
    const configPath = path.join(directory, 'claude_desktop_config.json');
    const runtime = { launcherPath: 'DeepScribe.exe', serverPath: 'server.mjs' };

    try {
      const first = await installOrRepairClaudeDesktopConnection(runtime, { configPath });
      const second = await installOrRepairClaudeDesktopConnection(runtime, { configPath });
      expect(first).toMatchObject({ ok: true, changed: true });
      expect(second).toMatchObject({ ok: true, changed: false });

      fs.writeFileSync(configPath, '{ invalid');
      const invalid = await installOrRepairClaudeDesktopConnection(runtime, { configPath });
      expect(invalid).toMatchObject({ ok: false, changed: false });
      expect(fs.readFileSync(configPath, 'utf8')).toBe('{ invalid');
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('verifies both Claude registration and the DeepScribe status tool', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'deepscribe-claude-'));
    const configPath = path.join(directory, 'claude_desktop_config.json');
    const runtime = { launcherPath: 'DeepScribe.exe', serverPath: 'server.mjs' };

    try {
      await installOrRepairClaudeDesktopConnection(runtime, { configPath });
      const verified = await verifyClaudeDesktopConnection(runtime, {
        configPath,
        callStatus: async () => ({ ok: true, status: { workspace: 'ready' } })
      });
      expect(verified).toMatchObject({ ok: true, registration: { registered: true }, status: { ok: true } });
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
