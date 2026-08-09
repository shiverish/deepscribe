#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';

const server = new McpServer({
  name: 'deepscribe',
  version: '0.1.0'
}, {
  instructions: 'DeepScribe stores projects, nested knowledge blocks, concepts, ideas and todos. Prefer read tools before writes. Use tags such as todo, concept, idee, core-concept or agent-ready to make knowledge discoverable. Never replace a block when appending is sufficient.'
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
  throw new Error('DeepScribe is niet bereikbaar. Start of herstart de desktop-app zodat de MCP-bridge actief wordt.');
}

async function callBridge(method, params = {}) {
  const { port, token } = await readBridgeInfo();
  let response;
  try {
    response = await fetch(`http://127.0.0.1:${port}/rpc`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ method, params }),
      signal: AbortSignal.timeout(20000)
    });
  } catch (error) {
    throw new Error(`Geen verbinding met DeepScribe: ${error instanceof Error ? error.message : 'onbekende fout'}`);
  }
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.error || `DeepScribe gaf HTTP ${response.status}.`);
  return payload.result;
}

function toolResult(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function registerTool(name, config, method = name) {
  server.registerTool(name, config, async params => {
    try {
      return toolResult(await callBridge(method, params));
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
  description: 'Controleer of de geopende DeepScribe-app bereikbaar is en tel projecten en blokken.',
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
    tags: z.array(z.string()).max(20).optional()
  },
  annotations: write
});

registerTool('create_block', {
  title: 'Blok aanmaken',
  description: 'Maak een hoofd- of kindblok met gewone tekst en tags aan in een project.',
  inputSchema: {
    projectId: z.string().min(1),
    parentId: z.string().nullable().optional(),
    title: z.string().min(1),
    content: z.string().optional(),
    tags: z.array(z.string()).max(20).optional()
  },
  annotations: write
});

registerTool('update_project', {
  title: 'Project bijwerken',
  description: 'Werk titel, omschrijving, kleur en/of tags van een bestaand project bij.',
  inputSchema: {
    projectId: z.string().min(1),
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
    tags: z.array(z.string()).max(20).optional()
  },
  annotations: write
});

registerTool('update_block', {
  title: 'Blok bijwerken',
  description: 'Werk titel, volledige gewone tekst en/of tags van een blok bij. Gebruik append_to_block wanneer bestaande inhoud behouden moet blijven.',
  inputSchema: {
    blockId: z.string().min(1),
    title: z.string().min(1).optional(),
    content: z.string().optional(),
    tags: z.array(z.string()).max(20).optional()
  },
  annotations: write
});

registerTool('append_to_block', {
  title: 'Tekst aan blok toevoegen',
  description: 'Voeg een nieuwe alinea toe zonder bestaande blokinhoud te vervangen.',
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
  description: 'Voeg een todo toe aan een bestaand blok.',
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

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('DeepScribe MCP-server is actief via stdio.');
