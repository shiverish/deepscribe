#!/usr/bin/env node
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const integrationDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(integrationDirectory, '..', '..');
const skillDirectory = path.join(integrationDirectory, 'deepscribe');
const outputDirectory = path.join(rootDirectory, 'dist-skills');
const rootPackage = JSON.parse(await readFile(path.join(rootDirectory, 'package.json'), 'utf8'));
const outputFile = path.join(outputDirectory, `DeepScribe-Skill-${rootPackage.version}.zip`);
const zip = new JSZip();

await addDirectory(zip.folder('deepscribe'), skillDirectory);
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await writeFile(outputFile, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } }));

console.log(`ChatGPT-skill gereed: ${outputFile}`);

async function addDirectory(destination, source) {
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const sourcePath = path.join(source, entry.name);
    if (entry.isDirectory()) {
      await addDirectory(destination.folder(entry.name), sourcePath);
    } else if (entry.isFile()) {
      destination.file(entry.name, await readFile(sourcePath));
    }
  }
}
