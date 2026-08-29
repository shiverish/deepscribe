#!/usr/bin/env node
import { copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const mcpDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.dirname(mcpDirectory);
const templateDirectory = path.join(mcpDirectory, 'extension');
const outputDirectory = path.join(rootDirectory, 'dist-mcpb');
const bundleDirectory = path.join(outputDirectory, 'stage', 'deepscribe');
const serverDirectory = path.join(bundleDirectory, 'server');
const npmCli = process.env.npm_execpath;
const mcpbCli = path.join(rootDirectory, 'node_modules', '@anthropic-ai', 'mcpb', 'dist', 'cli', 'cli.js');

if (!npmCli) throw new Error('Start deze build via npm run mcpb:build.');

const rootPackage = JSON.parse(await readFile(path.join(rootDirectory, 'package.json'), 'utf8'));
const manifest = JSON.parse(await readFile(path.join(templateDirectory, 'manifest.json'), 'utf8'));
const runtimePackage = JSON.parse(await readFile(path.join(templateDirectory, 'package.json'), 'utf8'));
manifest.version = rootPackage.version;
runtimePackage.version = rootPackage.version;

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(serverDirectory, { recursive: true });
await copyFile(path.join(mcpDirectory, 'server.mjs'), path.join(serverDirectory, 'server.mjs'));
await copyFile(path.join(mcpDirectory, 'direct-store.mjs'), path.join(serverDirectory, 'direct-store.mjs'));
// The shared domain core the server imports at runtime; tests stay out of the bundle.
await cp(path.join(mcpDirectory, 'core'), path.join(serverDirectory, 'core'), {
  recursive: true,
  filter: source => !source.endsWith('.test.ts')
});
await copyFile(path.join(templateDirectory, 'README.md'), path.join(bundleDirectory, 'README.md'));
await copyFile(path.join(templateDirectory, 'icon.png'), path.join(bundleDirectory, 'icon.png'));
await writeFile(path.join(bundleDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(path.join(bundleDirectory, 'package.json'), `${JSON.stringify(runtimePackage, null, 2)}\n`);

run(process.execPath, [npmCli, 'install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], bundleDirectory);

const outputFile = path.join(outputDirectory, `DeepScribe-${rootPackage.version}.mcpb`);
run(process.execPath, [mcpbCli, 'validate', bundleDirectory], rootDirectory);
run(process.execPath, [mcpbCli, 'pack', bundleDirectory, outputFile], rootDirectory);
run(process.execPath, [mcpbCli, 'info', outputFile], rootDirectory);

console.log(`\nMCP Bundle gereed: ${outputFile}`);

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
