#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SubscribeRequestSchema, UnsubscribeRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod/v4';
import { handleDirectStoreRequest } from './direct-store.mjs';
import { formatBytes, MAX_ATTACHMENT_BYTES } from './core/attachments.mjs';

const server = new McpServer({
  name: 'deepscribe',
  version: '0.2.7'
}, {
  instructions: 'DeepScribe stores projects, nested knowledge blocks and user-managed tasks. Read before writing and preserve existing content. Agents may use create_task to capture concrete future work, risks or ideas after checking for duplicates; tasks can be attached directly to a project via projectId or placed into Workspace Inbox when omitted, and start in Inbox status assigned to Any agent (or a specified assigneeTarget). Never create an administrative task before performing a directly requested change. Agents must not move, organize, assign, delete or restore tasks or create inline todos. Use list_tasks/get_task to read tasks. When the user asks you to work on a specific task, claim it with claim_work_item before you start: that is the only way a task reaches In progress, and it takes the lease that keeps other agents off it. Renew the lease on long work and finish with transition_work_item to review, done or blocked, including a real summary. Report progress on an unclaimed task with update_task_status. Drive these status changes yourself; do not ask the user for permission to move a task you were told to work on. A task still in Inbox cannot be claimed, so say so and let the user set it to Ready. Agents may write a task body with append_to_block (preferred, it preserves what is already there) or update_block, for example to leave a delivery report; a task title, its dependencies, its assignment, its position and its status stay user-owned. While another agent holds an active claim on a task, writing to it requires the agentId and claimToken of that claim. Attach files with upload_attachment rather than leaving a local path in the text: pass sourcePath for a file on disk or data with base64 content and a fileName, one file per call, at most 25 MB, and reuse the same requestId when you retry an upload whose result you did not see. Read them back with list_attachments and read_attachment. Format block content as readable Markdown with blank lines between sections and one list item per line.'
});

function bridgeFileCandidates() {
  if (process.env.DEEPSCRIBE_BRIDGE_FILE) return [process.env.DEEPSCRIBE_BRIDGE_FILE];
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return [
    path.join(appData, 'deepscribe', 'deepscribe-mcp-bridge.json'),
    path.join(appData, 'DeepScribe', 'deepscribe-mcp-bridge.json')
  ];
}

async function readBridgeInfo() {
  for (const candidate of bridgeFileCandidates()) {
    try {
      const parsed = JSON.parse(await fs.readFile(candidate, 'utf8'));
      if (Number.isInteger(parsed.port) && typeof parsed.token === 'string') return parsed;
    } catch {
      // Try the next conventional Electron user-data directory.
    }
  }
  return null;
}

class BridgeUnavailableError extends Error {}

async function callBridge(method, params = {}) {
  const bridge = await readBridgeInfo();
  if (!bridge) throw new BridgeUnavailableError('DeepScribe bridge is niet actief.');
  const { port, token } = bridge;
  let response;
  try {
    response = await fetch(`http://127.0.0.1:${port}/rpc`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ method, params }),
      // Een bijlage van tientallen megabytes moet nog over de bridge en naar schijf.
      signal: AbortSignal.timeout(method === 'upload_attachment' ? 60000 : 5000)
    });
  } catch (error) {
    const code = error?.cause?.code;
    if (code === 'ECONNREFUSED') throw new BridgeUnavailableError('DeepScribe bridge weigert de verbinding.');
    throw new Error(`Geen verbinding met DeepScribe bridge: ${error instanceof Error ? error.message : 'onbekende fout'}`);
  }
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.error || `DeepScribe gaf HTTP ${response.status}.`);
  return payload.result;
}

async function executeMcpMethod(method, params = {}) {
  // 1. Probeer de live bridge als DeepScribe geopend is
  try {
    return await callBridge(method, params);
  } catch (error) {
    if (!(error instanceof BridgeUnavailableError)) throw error;
    // 2. Schakel naadloos over naar directe SQLite als de app gesloten of offline is
    return await handleDirectStoreRequest(method, params);
  }
}

function toolResult(value) {
  const attachments = Array.isArray(value) ? value : Array.isArray(value?.attachments) ? value.attachments : [];
  const links = attachments.filter(attachment => attachment?.uri && attachment?.fileName).map(attachment => ({
    type: 'resource_link',
    uri: attachment.uri,
    name: attachment.fileName,
    description: `Bijlage van DeepScribe-blok ${attachment.blockId}`,
    mimeType: attachment.fileType,
    size: attachment.fileSize
  }));
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }, ...links] };
}

function attachmentContents(attachment) {
  const contents = {
    uri: attachment.uri,
    mimeType: attachment.fileType || 'application/octet-stream'
  };
  const isText = contents.mimeType.startsWith('text/') || ['application/json', 'application/xml', 'image/svg+xml'].includes(contents.mimeType);
  if (isText) contents.text = Buffer.from(attachment.dataBase64, 'base64').toString('utf8');
  else contents.blob = attachment.dataBase64;
  return contents;
}

function registerTool(name, config, method = name) {
  server.registerTool(name, config, async params => {
    try {
      return toolResult(await executeMcpMethod(method, params));
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: error instanceof Error ? error.message : 'Onbekende DeepScribe-fout.' }]
      };
    }
  });
}

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true };
const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: false };

registerTool('status', {
  title: 'DeepScribe-status',
  description: 'Controleer of DeepScribe bereikbaar is (live of via directe SQLite) en tel projecten en blokken.',
  inputSchema: {},
  annotations: readOnly
});

registerTool('list_projects', {
  title: 'Projecten tonen',
  description: 'Toon actieve DeepScribe-projecten met aantallen blokken en openstaande taken.',
  inputSchema: {},
  annotations: readOnly
});

registerTool('get_project', {
  title: 'Project lezen',
  description: 'Lees één DeepScribe-project en de bijbehorende totalen.',
  inputSchema: { projectId: z.string().min(1) },
  annotations: readOnly
});

registerTool('list_blocks', {
  title: 'Blokken tonen',
  description: 'Toon blokken binnen een project. Zonder parentId worden hoofdblokken getoond; recursive=true toont alle niveaus.',
  inputSchema: {
    projectId: z.string().min(1),
    parentId: z.string().nullable().optional(),
    recursive: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).optional()
  },
  annotations: readOnly
});

registerTool('get_block', {
  title: 'Blok lezen',
  description: 'Lees de volledige inhoud, tags, taakstatus en hiërarchische route van één blok.',
  inputSchema: { blockId: z.string().min(1) },
  annotations: readOnly
});

registerTool('list_attachments', {
  title: 'Gekoppelde bestanden tonen',
  description: 'Toon bijlagen die agents als MCP-resource kunnen openen. Filter bij voorkeur op blockId of projectId; lokale bestandspaden worden nooit gedeeld.',
  inputSchema: {
    blockId: z.string().optional(),
    projectId: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional()
  },
  annotations: readOnly
});

server.registerTool('read_attachment', {
  title: 'Gekoppeld bestand lezen',
  description: 'Lees een DeepScribe-bijlage op attachmentId. Tekst wordt als tekst aangeboden en andere bestanden als binaire MCP-resource.',
  inputSchema: { attachmentId: z.string().min(1) },
  annotations: readOnly
}, async params => {
  try {
    const attachment = await executeMcpMethod('read_attachment', params);
    return { content: [{ type: 'resource', resource: attachmentContents(attachment) }] };
  } catch (error) {
    return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : 'Onbekende DeepScribe-fout.' }] };
  }
});

/**
 * Leest een lokaal bestand voor upload_attachment.
 *
 * Alleen deze stdio-server, die door de client van de agent zelf wordt gestart en
 * onder dezelfde gebruiker draait, raakt het bestandssysteem aan. De DeepScribe-app
 * en de SQLite-route krijgen uitsluitend base64 te zien en kennen sourcePath niet,
 * zodat er geen pad uit de opslag van DeepScribe kan lekken of in kan sluipen.
 */
async function readUploadSource(sourcePath) {
  const resolved = path.resolve(sourcePath);
  let stats;
  try {
    stats = await fs.stat(resolved);
  } catch {
    throw new Error(`Bestand niet gevonden: ${path.basename(resolved)}`);
  }
  if (!stats.isFile()) throw new Error(`“${path.basename(resolved)}” is geen bestand.`);
  if (stats.size === 0) throw new Error(`“${path.basename(resolved)}” is leeg.`);
  if (stats.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`“${path.basename(resolved)}” is ${formatBytes(stats.size)} en daarmee groter dan de ${formatBytes(MAX_ATTACHMENT_BYTES)} die een bijlage mag zijn.`);
  }
  return {
    data: (await fs.readFile(resolved)).toString('base64'),
    fileName: path.basename(resolved)
  };
}

server.registerTool('upload_attachment', {
  title: 'Bestand uploaden als bijlage',
  description: 'Upload een bestand en koppel het duurzaam als bijlage aan een bestaand kennis- of taakblok. Geef sourcePath voor een bestand op schijf (aanbevolen; de server leest het zelf) of data met de inhoud als base64. Maximaal 25 MB per bestand, in één keer; er is geen upload in delen. requestId maakt herhalen veilig: dezelfde requestId met dezelfde inhoud geeft de bestaande bijlage terug, met andere inhoud een fout. Geef bij een taak met een actieve claim de agentId en claimToken van die claim mee.',
  inputSchema: {
    blockId: z.string().min(1),
    sourcePath: z.string().min(1).optional(),
    data: z.string().min(1).optional(),
    fileName: z.string().min(1).optional(),
    mimeType: z.string().min(1).optional(),
    agentId: z.string().min(1),
    requestId: z.string().min(1),
    claimToken: z.string().min(1).optional()
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }
}, async params => {
  try {
    const { sourcePath, ...rest } = params;
    if (!sourcePath && !rest.data) throw new Error('Geef sourcePath of data mee.');
    if (sourcePath && rest.data) throw new Error('Geef sourcePath of data mee, niet allebei.');
    const source = sourcePath ? await readUploadSource(sourcePath) : { data: rest.data, fileName: rest.fileName };
    if (!source.fileName) throw new Error('fileName is verplicht wanneer je data meestuurt.');
    return toolResult(await executeMcpMethod('upload_attachment', { ...rest, data: source.data, fileName: rest.fileName || source.fileName }));
  } catch (error) {
    return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : 'Onbekende DeepScribe-fout.' }] };
  }
});

server.registerResource('deepscribe-attachment', new ResourceTemplate('deepscribe://attachment/{attachmentId}', {
  list: async () => {
    const attachments = await executeMcpMethod('list_attachments', { limit: 100 });
    return {
      resources: attachments.map(attachment => ({
        uri: attachment.uri,
        name: attachment.fileName,
        title: attachment.fileName,
        description: `Bijlage van DeepScribe-blok ${attachment.blockId}`,
        mimeType: attachment.fileType,
        size: attachment.fileSize
      }))
    };
  }
}), {
  title: 'DeepScribe-bijlage',
  description: 'Een bestand dat aan een DeepScribe-kennisblok is gekoppeld.'
}, async (uri, variables) => {
  const attachment = await executeMcpMethod('read_attachment', { attachmentId: String(variables.attachmentId) });
  return { contents: [{ ...attachmentContents(attachment), uri: uri.href }] };
});

server.registerResource('deepscribe-agent-inbox', new ResourceTemplate('deepscribe://agent-inbox/{projectId}', {
  list: async () => {
    const projects = await executeMcpMethod('list_projects');
    return {
      resources: projects.map(project => ({
        uri: `deepscribe://agent-inbox/${encodeURIComponent(project.id)}`,
        name: `${project.title} agent inbox`,
        title: `Agent Inbox — ${project.title}`,
        description: 'Klaargezette en momenteel geclaimde getypeerde taken.',
        mimeType: 'application/json'
      }))
    };
  }
}), {
  title: 'DeepScribe Agent Inbox',
  description: 'Een observeerbare projectqueue voor Auto Task Pickup.'
}, async (uri, variables) => {
  const snapshot = await executeMcpMethod('get_agent_inbox_snapshot', { projectId: String(variables.projectId) });
  return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(snapshot, null, 2) }] };
});

const inboxSubscriptions = new Map();
server.server.registerCapabilities({ resources: { subscribe: true, listChanged: true } });
server.server.setRequestHandler(SubscribeRequestSchema, async request => {
  const uri = request.params.uri;
  const match = /^deepscribe:\/\/agent-inbox\/([^/?#]+)$/.exec(uri);
  if (!match) return {};
  const projectId = decodeURIComponent(match[1]);
  const snapshot = await executeMcpMethod('get_agent_inbox_snapshot', { projectId });
  inboxSubscriptions.set(uri, { projectId, fingerprint: JSON.stringify(snapshot) });
  return {};
});
server.server.setRequestHandler(UnsubscribeRequestSchema, async request => {
  inboxSubscriptions.delete(request.params.uri);
  return {};
});

const inboxMonitor = setInterval(async () => {
  for (const [uri, subscription] of inboxSubscriptions) {
    try {
      const snapshot = await executeMcpMethod('get_agent_inbox_snapshot', { projectId: subscription.projectId });
      const fingerprint = JSON.stringify(snapshot);
      if (fingerprint !== subscription.fingerprint) {
        subscription.fingerprint = fingerprint;
        await server.server.sendResourceUpdated({ uri });
      }
    } catch (error) {
      console.error(`Agent Inbox-monitor voor ${uri}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}, 2000);
inboxMonitor.unref();

registerTool('search', {
  title: 'DeepScribe doorzoeken',
  description: 'Zoek in titels en inhoud, optioneel beperkt tot een project en/of tags.',
  inputSchema: {
    query: z.string().optional(),
    projectId: z.string().optional(),
    tags: z.array(z.string()).max(20).optional(),
    limit: z.number().int().min(1).max(100).optional()
  },
  annotations: readOnly
});

registerTool('create_project', {
  title: 'Project aanmaken',
  description: 'Maak een nieuw DeepScribe-project aan.',
  inputSchema: {
    title: z.string().min(1),
    description: z.string().optional(),
    color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
    tags: z.array(z.string()).max(20).optional(),
    scratchpad: z.string().optional()
  },
  annotations: write
});

registerTool('get_project_context', {
  title: 'Projectcontext & scratchpad ophalen',
  description: 'Haal in één aanroep de volledige context van een project op: het actuele agent-scratchpad (architectuurkeuzes, tussenconclusies en status), openstaande taken, blokstatistieken en recente projectactiviteit.',
  inputSchema: {
    projectId: z.string().min(1)
  },
  annotations: readOnly
});

registerTool('update_project_scratchpad', {
  title: 'Project-scratchpad bijwerken',
  description: 'Werk het centrale context- en geheugenveld (scratchpad) van een project bij. Gebruik dit om tussenconclusies, architectuurkeuzes en samenvattingen vast te leggen voor volgende agent-sessies of de ontwikkelaar.',
  inputSchema: {
    projectId: z.string().min(1),
    content: z.string().min(1),
    append: z.boolean().optional()
  },
  annotations: write
});

registerTool('create_block', {
  title: 'Blok aanmaken',
  description: 'Maak een algemeen hoofd- of kindblok aan. Gebruik dit alleen voor gevraagde kennis of schrijfcontent, nooit voor een taak, todo, werkitem of voorbereidend planningsblok. content ondersteunt veilige Markdown voor koppen, alinea’s, links, code en lijsten.',
  inputSchema: {
    projectId: z.string().min(1),
    parentId: z.string().nullable().optional(),
    title: z.string().min(1),
    content: z.string().optional(),
    tags: z.array(z.string()).max(20).optional(),
    dependsOn: z.array(z.string()).max(20).optional(),
    agentId: z.string().min(1).optional().describe('Caller agent identity ID'),
    agentTarget: z.enum(['openai', 'claude', 'gemini', 'custom']).optional().describe('Caller provider identity'),
    customAgentName: z.string().min(1).optional().describe('Caller custom agent name if agentTarget is custom')
  },
  annotations: write
});

registerTool('create_task', {
  title: 'Create task',
  description: 'Idempotently capture a concrete follow-up, risk or idea directly in a project or in Workspace Inbox. Check list_tasks for duplicates first. If projectId is omitted, it is placed in Workspace Inbox. The task starts in Inbox status assigned to Any agent by default, or to a specified assigneeTarget. Only the user can edit it after creation. Never use this as an administrative step before a directly requested change.',
  inputSchema: {
    projectId: z.string().min(1).optional().describe('Target project ID, or omit for Workspace Inbox'),
    parentId: z.string().nullable().optional().describe('Parent block ID within the project'),
    title: z.string().min(1).describe('Task title'),
    content: z.string().optional().describe('Task body in Markdown'),
    agentId: z.string().min(1).describe('Caller agent identity ID (creator)'),
    agentTarget: z.enum(['openai', 'claude', 'gemini', 'custom']).describe('Caller provider identity (creator provenance)'),
    customAgentName: z.string().min(1).optional().describe('Caller custom agent name if agentTarget is custom'),
    assigneeTarget: z.enum(['none', 'openai', 'claude', 'gemini', 'custom', 'any']).optional().describe('Target agent assignee for this task (default: any)'),
    assigneeCustomAgentName: z.string().min(1).optional().describe('Custom agent name if assigneeTarget is custom'),
    requestId: z.string().min(1).describe('Unique request ID for idempotency')
  },
  annotations: write
});

registerTool('move_block', {
  title: 'Blok veilig verplaatsen',
  description: 'Herorganiseer een blok binnen hetzelfde project ten opzichte van een ander blok. above en below plaatsen het blok naast het doel; inside maakt het onderaan kind van het doel. De volledige onderliggende boom verhuist mee. Verplaatsingen naar het blok zelf, een eigen afstammeling, een verwijderd blok of een ander project worden geweigerd.',
  inputSchema: {
    blockId: z.string().min(1),
    targetBlockId: z.string().min(1),
    position: z.enum(['above', 'below', 'inside'])
  },
  annotations: write
});

registerTool('update_task_status', {
  title: 'Taakstatus bijwerken',
  description: 'Wijzig uitsluitend de voortgangsstatus van een bestaande gebruikerstaak. Taakinhoud, ordening en toewijzing blijven alleen door de gebruiker beheerbaar.',
  inputSchema: {
    blockId: z.string().min(1),
    status: z.enum(['inbox', 'ready', 'blocked', 'review', 'done'])
  },
  annotations: write
});

registerTool('list_tasks', {
  title: 'Taken lezen',
  description: 'Lees gebruikerstaakblokken zonder ze te wijzigen. Filter optioneel op project, status of claimbaarheid.',
  inputSchema: {
    projectId: z.string().optional(),
    status: z.enum(['inbox', 'ready', 'in-progress', 'blocked', 'review', 'done']).optional(),
    claimable: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).optional()
  },
  annotations: readOnly
});

registerTool('get_task', {
  title: 'Taak lezen',
  description: 'Lees één bestaande gebruikerstaak met vrije inhoud en taakmetadata.',
  inputSchema: { taskId: z.string().min(1) },
  annotations: readOnly
});

const claimantSchema = {
  agentId: z.string().min(1),
  agentTarget: z.enum(['openai', 'claude', 'gemini', 'custom']),
  customAgentName: z.string().min(1).optional(),
  projectId: z.string().min(1).optional()
};

registerTool('list_claimable_work_items', {
  title: 'Claimbare taken tonen',
  description: 'Toon getypeerde, klaargezette taken die bij deze provider passen, waarvan afhankelijkheden gereed zijn. Verlopen claims worden opnieuw beschikbaar.',
  inputSchema: { ...claimantSchema, limit: z.number().int().min(1).max(100).optional() },
  annotations: readOnly
});

registerTool('claim_next_work_item', {
  title: 'Volgende taak atomair claimen',
  description: 'Claim de oudste passende taak met een lease. requestId maakt herhalen veilig en retourneert bij replay dezelfde claimtoken.',
  inputSchema: { ...claimantSchema, requestId: z.string().min(1), leaseSeconds: z.number().int().min(60).max(3600).optional() },
  annotations: write
});

registerTool('claim_work_item', {
  title: 'Claim a specific task atomically',
  description: 'Claim a specific available task with a lease. Use this after identifying the task to work on; it is the only way to set that task to In progress. requestId makes retries safe and returns the same claim token.',
  inputSchema: { blockId: z.string().min(1), ...claimantSchema, requestId: z.string().min(1), leaseSeconds: z.number().int().min(60).max(3600).optional() },
  annotations: write
});

registerTool('renew_work_item_claim', {
  title: 'Taakclaim verlengen',
  description: 'Verleng een nog geldige taakclaim met eigenaar en geheime claimtoken.',
  inputSchema: {
    blockId: z.string().min(1),
    agentId: z.string().min(1),
    claimToken: z.string().min(1),
    leaseSeconds: z.number().int().min(60).max(3600).optional()
  },
  annotations: write
});

registerTool('transition_work_item', {
  title: 'Geclaimde taak overdragen',
  description: 'Zet een eigen, geldige claim op ready, blocked, review of done. De vrije taakinhoud wordt niet gewijzigd.',
  inputSchema: {
    blockId: z.string().min(1),
    agentId: z.string().min(1),
    claimToken: z.string().min(1),
    status: z.enum(['ready', 'blocked', 'review', 'done']),
    summary: z.string().min(1).optional()
  },
  annotations: write
});

registerTool('update_project', {
  title: 'Project bijwerken',
  description: 'Werk titel, omschrijving, kleur, scratchpad en/of tags van een bestaand project bij.',
  inputSchema: {
    projectId: z.string().min(1),
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
    tags: z.array(z.string()).max(20).optional(),
    scratchpad: z.string().optional()
  },
  annotations: write
});

registerTool('update_block', {
  title: 'Blok bijwerken',
  description: 'Werk titel, volledige inhoud, tags en/of afhankelijkheden van een blok bij. content ondersteunt veilige Markdown voor koppen, alinea’s, links, code en lijsten. Gebruik twee lege regels om bewust één zichtbare lege alinea in de editor te behouden. Gebruik append_to_block wanneer bestaande inhoud behouden moet blijven. Op een taak mag je inhoud en tags bijwerken, maar niet de titel, afhankelijkheden, toewijzing, positie of status; gebruik daarvoor update_task_status of de claimtools. Draagt de taak een actieve claim, geef dan je eigen agentId en claimToken mee.',
  inputSchema: {
    blockId: z.string().min(1),
    title: z.string().min(1).optional(),
    content: z.string().optional(),
    tags: z.array(z.string()).max(20).optional(),
    dependsOn: z.array(z.string()).max(20).optional(),
    agentId: z.string().min(1).optional(),
    claimToken: z.string().min(1).optional()
  },
  annotations: write
});

registerTool('get_block_dependencies', {
  title: 'Blokafhankelijkheden tonen',
  description: 'Toon de afhankelijkheids- en blokkadestatus van een blok, inclusief openstaande voorwaarden en blokken die op dit blok wachten.',
  inputSchema: {
    blockId: z.string().min(1)
  },
  annotations: readOnly
});

registerTool('append_to_block', {
  title: 'Tekst aan blok toevoegen',
  description: 'Voeg veilige Markdown toe zonder bestaande blokinhoud te vervangen. Gebruik één lege regel voor een normale alineascheiding en twee lege regels voor één zichtbare lege alinea. Zet ieder lijstitem op een eigen regel. Dit is ook het aanbevolen pad om een verslag of resultaat onder een taak te zetten. Draagt de taak een actieve claim, geef dan je eigen agentId en claimToken mee.',
  inputSchema: {
    blockId: z.string().min(1),
    text: z.string().min(1),
    agentId: z.string().min(1).optional(),
    claimToken: z.string().min(1).optional()
  },
  annotations: write
});

registerTool('link_blocks', {
  title: 'Twee blokken aan elkaar relateren',
  description: 'Leg een relatie vast tussen twee blokken, ook over projectgrenzen heen. Relaties wijzen naar blok-id, dus ze blijven intact als een blok wordt hernoemd. Herhalen met dezelfde bron, doel en type maakt geen tweede relatie aan.',
  inputSchema: {
    sourceBlockId: z.string().min(1),
    targetBlockId: z.string().min(1),
    type: z.enum(['relates-to', 'supports', 'contradicts', 'derived-from', 'source-of']).optional()
  },
  annotations: write
});

registerTool('get_related', {
  title: 'Verwante blokken ophalen',
  description: 'Loop vanaf een blok door de kennisgraaf in plaats van opnieuw te zoeken. Zowel uitgaande links als backlinks tellen als stap. Ieder resultaat meldt richting, relatietype, afstand en of het in een ander project ligt.',
  inputSchema: {
    blockId: z.string().min(1),
    depth: z.number().int().min(1).max(5).optional(),
    types: z.array(z.enum(['relates-to', 'supports', 'contradicts', 'derived-from', 'source-of'])).max(5).optional(),
    limit: z.number().int().min(1).max(100).optional()
  },
  annotations: readOnly
});

registerTool('list_todos', {
  title: 'Todo’s tonen',
  description: 'Toon todo-items uit één blok, één project of heel DeepScribe. taskIndex identificeert een todo binnen zijn blok.',
  inputSchema: {
    projectId: z.string().optional(),
    blockId: z.string().optional(),
    completed: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).optional()
  },
  annotations: readOnly
});

registerTool('list_block_revisions', {
  title: 'Blokrevisies tonen',
  description: 'Toon de versiehistorie en snapshots van een kennisblok, gesorteerd van nieuw naar oud.',
  inputSchema: {
    blockId: z.string().min(1),
    limit: z.number().int().min(1).max(50).optional()
  },
  annotations: readOnly
});

registerTool('get_block_revision', {
  title: 'Blokrevisie lezen',
  description: 'Haal de volledige inhoud en metadata van een specifieke historische blokversie op.',
  inputSchema: { revisionId: z.string().min(1) },
  annotations: readOnly
});

registerTool('restore_block_revision', {
  title: 'Blokrevisie herstellen',
  description: 'Herstel een kennisblok naar een eerdere historische versie. Maakt automatisch een backup van de huidige staat.',
  inputSchema: { revisionId: z.string().min(1) },
  annotations: write
});

registerTool('list_activities', {
  title: 'Activiteitenstream opvragen',
  description: 'Haal recente activiteitslogs en audit events op (bijv. aanpassingen door agents of gebruiker), optioneel gefilterd op projectId, blockId, bron (user, agent, system) of sinds een specifieke timestamp.',
  inputSchema: {
    projectId: z.string().optional(),
    blockId: z.string().optional(),
    source: z.enum(['user', 'agent', 'system']).optional(),
    since: z.number().int().optional(),
    limit: z.number().int().min(1).max(100).optional()
  },
  annotations: readOnly
});

registerTool('record_activity', {
  title: 'Activiteit of voortgang loggen',
  description: 'Log een voortgangsupdates, mijlpaal of agent-actie in de centrale activiteitsstream van DeepScribe.',
  inputSchema: {
    action: z.string().min(1),
    summary: z.string().min(1),
    projectId: z.string().optional(),
    blockId: z.string().optional(),
    source: z.enum(['user', 'agent', 'system']).optional()
  },
  annotations: write
});

registerTool('get_export_settings', {
  title: 'Export-instellingen ophalen',
  description: 'Read the active default PDF/document export settings and available presets (a4Document, a5Book, largeText).',
  inputSchema: {},
  annotations: readOnly
});

registerTool('update_export_settings', {
  title: 'Export-instellingen aanpassen',
  description: 'Update the workspace default export settings for PDF and document generation. Supports presets (a4Document, a5Book, largeText) and custom overrides (pageSize, font, fontSize, margin, pageBreakPerBlock, pageNumbers, pageNumberPlacement, pageNumberAlignment, headerStyle, headerAlignment, headerDivider).',
  inputSchema: {
    preset: z.enum(['a4Document', 'a5Book', 'largeText']).optional(),
    pageSize: z.enum(['A4', 'A5']).optional(),
    font: z.enum(['serif', 'sans']).optional(),
    fontSize: z.number().int().min(10).max(14).optional(),
    margin: z.enum(['compact', 'normal', 'wide']).optional(),
    pageBreakPerBlock: z.boolean().optional(),
    pageNumbers: z.boolean().optional(),
    pageNumberPlacement: z.enum(['top', 'bottom']).optional(),
    pageNumberAlignment: z.enum(['left', 'center', 'right']).optional(),
    headerStyle: z.enum(['full', 'compact', 'title', 'none']).optional(),
    headerAlignment: z.enum(['left', 'center']).optional(),
    headerDivider: z.boolean().optional()
  },
  annotations: write
});

registerTool('export_block', {
  title: 'Export block or document',
  description: 'Export a block (and optionally its nested child blocks) to PDF, Markdown, HTML, or plain text. If outputPath is omitted for PDF, it saves to Downloads. Use format="pdf" (default) for PDF exports. Settings default to the workspace export settings.',
  inputSchema: {
    blockId: z.string().min(1),
    format: z.enum(['pdf', 'markdown', 'html', 'text']).optional(),
    includeChildren: z.boolean().optional(),
    outputPath: z.string().optional(),
    pageSize: z.enum(['A4', 'A5']).optional(),
    font: z.enum(['serif', 'sans']).optional(),
    fontSize: z.number().int().min(10).max(14).optional(),
    margin: z.enum(['compact', 'normal', 'wide']).optional(),
    pageBreakPerBlock: z.boolean().optional(),
    pageNumbers: z.boolean().optional(),
    pageNumberPlacement: z.enum(['top', 'bottom']).optional(),
    pageNumberAlignment: z.enum(['left', 'center', 'right']).optional(),
    headerStyle: z.enum(['full', 'compact', 'title', 'none']).optional(),
    headerAlignment: z.enum(['left', 'center']).optional(),
    headerDivider: z.boolean().optional()
  },
  annotations: write
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('DeepScribe MCP-server is actief via stdio.');
