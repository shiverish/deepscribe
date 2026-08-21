const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const FORMAT_VERSION = 1;

function directorySize(directory) {
  if (!fs.existsSync(directory)) return 0;
  return fs.readdirSync(directory, { withFileTypes: true }).reduce((total, entry) => {
    const entryPath = path.join(directory, entry.name);
    return total + (entry.isDirectory() ? directorySize(entryPath) : fs.statSync(entryPath).size);
  }, 0);
}

function copyDirectory(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) copyDirectory(sourcePath, destinationPath);
    else fs.copyFileSync(sourcePath, destinationPath, fs.constants.COPYFILE_EXCL);
  }
}

function hashDirectory(directory) {
  const hashes = new Map();
  const visit = (current, relative = '') => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const relativePath = path.join(relative, entry.name);
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) visit(fullPath, relativePath);
      else if (!entry.name.endsWith('-wal') && !entry.name.endsWith('-shm')) {
        hashes.set(relativePath, crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex'));
      }
    }
  };
  visit(directory);
  return hashes;
}

class WorkspaceStore {
  constructor({ userDataPath, documentsPath }) {
    this.userDataPath = userDataPath;
    this.documentsPath = documentsPath;
    this.bootstrapPath = path.join(userDataPath, 'workspace-bootstrap.json');
    this.database = null;
    this.workspacePath = null;
    this.manifest = null;
  }

  configuredPath() {
    try {
      const bootstrap = JSON.parse(fs.readFileSync(this.bootstrapPath, 'utf8'));
      if (typeof bootstrap.workspacePath === 'string' && bootstrap.workspacePath) return bootstrap.workspacePath;
    } catch { /* Use default. */ }
    return path.join(this.documentsPath, 'DeepScribe', 'Workspace');
  }

  open() {
    if (this.database) return;
    this.workspacePath = path.resolve(this.configuredPath());
    fs.mkdirSync(this.workspacePath, { recursive: true });
    const manifestPath = path.join(this.workspacePath, 'workspace.json');
    try {
      this.manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (this.manifest.formatVersion !== FORMAT_VERSION || typeof this.manifest.workspaceId !== 'string') {
        throw new Error('This workspace folder has an unsupported format.');
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      this.manifest = { workspaceId: `workspace-${crypto.randomUUID()}`, formatVersion: FORMAT_VERSION, encrypted: false };
      fs.writeFileSync(manifestPath, JSON.stringify(this.manifest, null, 2), 'utf8');
    }
    fs.mkdirSync(path.join(this.workspacePath, 'attachments'), { recursive: true });
    this.database = new DatabaseSync(path.join(this.workspacePath, 'workspace.sqlite'));
    this.database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS blocks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        parent_id TEXT REFERENCES blocks(id) DEFERRABLE INITIALLY DEFERRED,
        json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        block_id TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
        json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS activities (id TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS templates (id TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS revisions (
        id TEXT PRIMARY KEY,
        block_id TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
        json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS blocks_project_id ON blocks(project_id);
      CREATE INDEX IF NOT EXISTS blocks_parent_id ON blocks(parent_id);
      CREATE INDEX IF NOT EXISTS attachments_block_id ON attachments(block_id);
      CREATE INDEX IF NOT EXISTS revisions_block_id ON revisions(block_id);
    `);
  }

  status() {
    this.open();
    const count = table => Number(this.database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
    return {
      state: 'ready',
      path: this.workspacePath,
      workspaceId: this.manifest.workspaceId,
      formatVersion: this.manifest.formatVersion,
      encrypted: false,
      counts: {
        projects: Number(this.database.prepare("SELECT COUNT(*) AS count FROM projects WHERE json_extract(json, '$.systemKind') IS NULL").get().count),
        blocks: count('blocks'),
        attachments: count('attachments')
      }
    };
  }

  loadSnapshot() {
    this.open();
    const read = table => this.database.prepare(`SELECT json FROM ${table}`).all().map(row => JSON.parse(row.json));
    return {
      projects: read('projects'), blocks: read('blocks'), attachments: read('attachments'),
      settings: read('settings'), activities: read('activities'), templates: read('templates'),
      revisions: read('revisions')
    };
  }

  saveSnapshot(snapshot) {
    this.open();
    const tables = ['revisions', 'attachments', 'activities', 'templates', 'settings', 'blocks', 'projects'];
    const insertProject = this.database.prepare('INSERT INTO projects (id, json) VALUES (?, ?)');
    const insertBlock = this.database.prepare('INSERT INTO blocks (id, project_id, parent_id, json) VALUES (?, ?, ?, ?)');
    const insertAttachment = this.database.prepare('INSERT INTO attachments (id, block_id, json) VALUES (?, ?, ?)');
    const insertRevision = this.database.prepare('INSERT INTO revisions (id, block_id, json) VALUES (?, ?, ?)');
    const insertSimple = Object.fromEntries(['settings', 'activities', 'templates'].map(table => [
      table, this.database.prepare(`INSERT INTO ${table} (id, json) VALUES (?, ?)`)
    ]));
    this.database.exec('BEGIN IMMEDIATE; PRAGMA defer_foreign_keys = ON;');
    try {
      for (const table of tables) this.database.exec(`DELETE FROM ${table};`);
      for (const item of snapshot.projects ?? []) insertProject.run(item.id, JSON.stringify(item));
      for (const item of snapshot.blocks ?? []) insertBlock.run(item.id, item.projectId, item.parentId ?? null, JSON.stringify(item));
      for (const item of snapshot.attachments ?? []) insertAttachment.run(item.id, item.blockId, JSON.stringify(item));
      for (const item of snapshot.revisions ?? []) insertRevision.run(item.id, item.blockId, JSON.stringify(item));
      for (const table of ['settings', 'activities', 'templates']) {
        for (const item of snapshot[table] ?? []) insertSimple[table].run(item.id ?? item.key, JSON.stringify(item));
      }
      this.database.exec('COMMIT;');
    } catch (error) {
      this.database.exec('ROLLBACK;');
      throw error;
    }
  }

  attachmentsRoot() {
    this.open();
    return path.join(this.workspacePath, 'attachments');
  }

  close() {
    if (!this.database) return;
    this.database.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    this.database.close();
    this.database = null;
  }

  move(destinationParent) {
    this.open();
    fs.mkdirSync(destinationParent, { recursive: true });
    const source = this.workspacePath;
    const destination = path.resolve(destinationParent, 'DeepScribe Workspace');
    if (destination === source) return this.status();
    if (destination.startsWith(`${source}${path.sep}`)) {
      throw new Error('The new workspace cannot be placed inside the current workspace folder.');
    }
    if (fs.existsSync(destination) && fs.readdirSync(destination).length > 0) {
      throw new Error('The selected destination folder already contains files. Choose an empty folder.');
    }
    if (fs.existsSync(destination)) fs.rmdirSync(destination);
    const sourceBytes = directorySize(source);
    const destinationStats = fs.statfsSync(path.dirname(destination));
    const available = destinationStats.bavail * destinationStats.bsize;
    if (available < sourceBytes * 1.1) throw new Error('Not enough free disk space to copy the workspace safely.');

    this.close();
    const staging = `${destination}.staging-${crypto.randomUUID()}`;
    try {
      copyDirectory(source, staging);
      const sourceHashes = hashDirectory(source);
      const destinationHashes = hashDirectory(staging);
      if (sourceHashes.size !== destinationHashes.size
        || [...sourceHashes].some(([file, hash]) => destinationHashes.get(file) !== hash)) {
        throw new Error('De gekopieerde workspace kon niet worden geverifieerd.');
      }
      fs.renameSync(staging, destination);
      fs.mkdirSync(this.userDataPath, { recursive: true });
      fs.writeFileSync(this.bootstrapPath, JSON.stringify({ workspacePath: destination }, null, 2), 'utf8');
      this.workspacePath = destination;
      this.open();
      return { ...this.status(), previousPath: source };
    } catch (error) {
      try { fs.rmSync(staging, { recursive: true, force: true }); } catch { /* Best effort. */ }
      this.workspacePath = source;
      this.open();
      throw error;
    }
  }
}

module.exports = { WorkspaceStore, FORMAT_VERSION, hashDirectory };
