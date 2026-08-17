#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';
import { handleDirectStoreRequest } from './direct-store.mjs';

const server = new McpServer({
  name: 'deepscribe',
  version: '0.1.6'
}, {
  instructions: 'DeepScribe stores projects, nested knowledge blocks, concepts, ideas and todos. Prefer read tools before writes. Use tags such as todo, concept, idee, core-concept or agent-ready to make knowledge discoverable. Never replace a block when appending is sufficient. Format block content as readable Markdown: use blank lines between sections, headings for structure and one list item per line. Do not compress a list into a prose paragraph. Actionable work must include enough context for another person or agent to continue independently: use create_work_item with a goal, context and acceptance criteria instead of creating a title-only todo block or placeholder.'
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

async function callBridge(method, params = {}) {
  const bridge = await readBridgeInfo();
  if (!bridge) throw new Error('DeepScribe bridge is niet actief.');
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
      signal: AbortSignal.timeout(5000)
    });
  } catch (error) {
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
  } catch {
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
  description: 'Maak een algemeen hoofd- of kindblok aan. content ondersteunt veilige Markdown voor koppen, alinea’s, links, code en lijsten; zet ieder lijstitem op een eigen regel. Gebruik create_work_item voor todo’s en ander uitvoerbaar werk, zodat context en acceptatiecriteria niet ontbreken.',
  inputSchema: {
    projectId: z.string().min(1),
    parentId: z.string().nullable().optional(),
    title: z.string().min(1),
    content: z.string().optional(),
    tags: z.array(z.string()).max(20).optional(),
    dependsOn: z.array(z.string()).max(20).optional()
  },
  annotations: write
});

registerTool('create_work_item', {
  title: 'Werkitem met context aanmaken',
  description: 'Maak een todo- of agentwerkblok aan met een concreet doel, overdraagbare context, acceptatiecriteria en eventuele taakafhankelijkheden (dependsOn). Gebruik dit voor voorgenomen implementaties in plaats van een blok met alleen een titel.',
  inputSchema: {
    projectId: z.string().min(1),
    parentId: z.string().nullable().optional(),
    title: z.string().min(1),
    goal: z.string().min(10),
    context: z.string().min(20),
    acceptanceCriteria: z.array(z.string().min(3)).min(1).max(20),
    tags: z.array(z.string()).max(20).optional(),
    dependsOn: z.array(z.string()).max(20).optional()
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
  description: 'Werk titel, volledige inhoud, tags en/of afhankelijkheden van een blok bij. content ondersteunt veilige Markdown voor koppen, alinea’s, links, code en lijsten. Gebruik append_to_block wanneer bestaande inhoud behouden moet blijven.',
  inputSchema: {
    blockId: z.string().min(1),
    title: z.string().min(1).optional(),
    content: z.string().optional(),
    tags: z.array(z.string()).max(20).optional(),
    dependsOn: z.array(z.string()).max(20).optional()
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
  description: 'Voeg veilige Markdown toe zonder bestaande blokinhoud te vervangen. Gebruik blanke regels tussen secties en zet ieder lijstitem op een eigen regel.',
  inputSchema: { blockId: z.string().min(1), text: z.string().min(1) },
  annotations: write
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

registerTool('add_todo', {
  title: 'Todo toevoegen',
  description: 'Voeg een concrete actie toe aan een bestaand blok. Formuleer de tekst zo dat doel en relevante context uit het omliggende blok of de todo zelf duidelijk zijn.',
  inputSchema: {
    blockId: z.string().min(1),
    text: z.string().min(1),
    completed: z.boolean().optional()
  },
  annotations: write
});

registerTool('set_todo_status', {
  title: 'Todo-status wijzigen',
  description: 'Vink een todo aan of uit met blockId en de taskIndex uit list_todos.',
  inputSchema: {
    blockId: z.string().min(1),
    taskIndex: z.number().int().min(0),
    completed: z.boolean()
  },
  annotations: write
});

registerTool('get_or_create_daily_plan', {
  title: 'Dagplanning ophalen of aanmaken',
  description: 'Haal de dagplanning voor vandaag (of een opgegeven datum) op of maak deze automatisch gestructureerd aan met open taken en taakverdeling.',
  inputSchema: {
    date: z.string().optional(),
    focus: z.string().optional(),
    includeOpenTasks: z.boolean().optional()
  },
  annotations: write
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

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('DeepScribe MCP-server is actief via stdio.');
