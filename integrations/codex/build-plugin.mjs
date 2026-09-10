#!/usr/bin/env node
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const integrationDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(integrationDirectory, '..', '..');
const pluginDirectory = path.join(integrationDirectory, 'deepscribe');
const outputDirectory = path.join(rootDirectory, 'dist-plugins');
const rootPackage = JSON.parse(await readFile(path.join(rootDirectory, 'package.json'), 'utf8'));
const zip = new JSZip();

await addDirectory(zip.folder('deepscribe'), pluginDirectory);
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
const outputFile = path.join(outputDirectory, `DeepScribe-Codex-Plugin-${rootPackage.version}.zip`);
await writeFile(outputFile, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } }));
console.log(`Codex plugin ready: ${outputFile}`);

async function addDirectory(destination, source) {
  for (const entry of (await readdir(source, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const sourcePath = path.join(source, entry.name);
    if (entry.isDirectory()) await addDirectory(destination.folder(entry.name), sourcePath);
    else if (entry.isFile()) destination.file(entry.name, await readFile(sourcePath));
  }
}
