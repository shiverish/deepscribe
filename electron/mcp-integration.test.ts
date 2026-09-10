import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { buildCodexMcpInstallPlan, resolveMcpRuntime } = require('./mcp-integration.cjs') as {
  buildCodexMcpInstallPlan: (runtime: { launcherPath: string; serverPath: string }) => { command: string; args: string[]; env: Record<string, string> };
  resolveMcpRuntime: (input: { isPackaged: boolean; resourcesPath: string; appPath: string; executablePath: string }) => { launcherPath: string; serverPath: string };
};

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
});
