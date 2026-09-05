#!/usr/bin/env node
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const serverPath = process.env.DEEPSCRIBE_MCP_SERVER || path.join(directory, 'server.mjs');
const client = new Client({ name: 'deepscribe-smoke-test', version: '0.1.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
  env: { ...process.env }
});

function parsed(result) {
  if (result.isError) throw new Error(result.content?.[0]?.text || 'MCP-tool mislukte.');
  return JSON.parse(result.content?.[0]?.text || 'null');
}

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const expectedTools = ['list_captures', 'get_capture', 'claim_next_capture', 'renew_capture_claim', 'propose_capture', 'complete_capture', 'status', 'list_projects', 'get_block', 'create_task', 'list_tasks', 'get_task', 'update_task_status', 'list_attachments', 'read_attachment', 'upload_attachment', 'search', 'create_block', 'move_block', 'list_claimable_work_items', 'claim_next_work_item', 'claim_work_item', 'renew_work_item_claim', 'transition_work_item', 'list_todos'];
  for (const name of expectedTools) {
    if (!tools.tools.some(tool => tool.name === name)) throw new Error(`MCP-tool ontbreekt: ${name}`);
  }
  const removedTools = ['create_work_item', 'create_task_block', 'update_task_block', 'convert_block_to_task', 'add_todo', 'set_todo_status', 'get_or_create_daily_plan'];
  for (const name of removedTools) {
    if (tools.tools.some(tool => tool.name === name)) throw new Error(`Verwijderde taaktool is nog publiek: ${name}`);
  }
  const status = await client.callTool({ name: 'status', arguments: {} });
  const projects = await client.callTool({ name: 'list_projects', arguments: {} });
  const visibleProjects = parsed(projects);
  if (visibleProjects.some(project => project.systemKind || project.id === 'proj-system-task-inbox')) {
    throw new Error('Verborgen Workspace Inbox lekt via list_projects.');
  }
  const templates = await client.listResourceTemplates();
  if (!templates.resourceTemplates.some(template => template.uriTemplate === 'deepscribe://attachment/{attachmentId}')) {
    throw new Error('MCP-resourcetemplate voor bijlagen ontbreekt.');
  }
  if (!templates.resourceTemplates.some(template => template.uriTemplate === 'deepscribe://agent-inbox/{projectId}')) {
    throw new Error('MCP-resourcetemplate voor Agent Inbox ontbreekt.');
  }
  const report = { toolCount: tools.tools.length, status: parsed(status), projects: visibleProjects };
  if (process.env.DEEPSCRIBE_MCP_RESOURCE_TEST === '1') {
    report.resourceCount = (await client.listResources()).resources.length;
  }

  if (process.env.DEEPSCRIBE_MCP_WRITE_TEST === '1') {
    const project = parsed(await client.callTool({
      name: 'create_project',
      arguments: { title: 'MCP Smoke Test', description: 'Tijdelijke geïsoleerde testdata.' }
    }));
    const block = parsed(await client.callTool({
      name: 'create_block',
      arguments: { projectId: project.id, title: 'Agent concept', content: 'Eerste concept via MCP.', tags: ['concept'] }
    }));
    parsed(await client.callTool({ name: 'append_to_block', arguments: { blockId: block.id, text: 'Aanvullende context blijft behouden.' } }));
    const task = parsed(await client.callTool({
      name: 'create_task',
      arguments: { title: 'MCP smoke follow-up', content: 'Concrete follow-up created by the MCP smoke test.', agentId: 'mcp-smoke', agentTarget: 'openai', requestId: `smoke-${project.id}` }
    }));
    // Een echte upload-, lijst- en terugleesronde met een minimale PNG.
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const uploadRequestId = `smoke-upload-${project.id}`;
    const uploadArguments = {
      blockId: block.id,
      data: pngBase64,
      fileName: 'smoke pixel ünï.png',
      agentId: 'mcp-smoke',
      requestId: uploadRequestId
    };
    const uploaded = parsed(await client.callTool({ name: 'upload_attachment', arguments: uploadArguments }));
    const replayed = parsed(await client.callTool({ name: 'upload_attachment', arguments: uploadArguments }));
    if (uploaded.id !== replayed.id) throw new Error('Dezelfde requestId maakte een tweede bijlage.');
    if (!replayed.replayed) throw new Error('Een herhaalde upload werd niet als replay herkend.');

    const conflict = await client.callTool({
      name: 'upload_attachment',
      arguments: { ...uploadArguments, data: Buffer.from('andere inhoud').toString('base64') }
    });
    if (!conflict.isError) throw new Error('Een conflicterende payload bij dezelfde requestId werd geaccepteerd.');

    const listed = parsed(await client.callTool({ name: 'list_attachments', arguments: { blockId: block.id } }));
    if (!listed.some(attachment => attachment.id === uploaded.id)) throw new Error('De upload verschijnt niet in list_attachments.');

    const readBack = await client.callTool({ name: 'read_attachment', arguments: { attachmentId: uploaded.id } });
    const blob = readBack.content?.[0]?.resource?.blob;
    if (blob !== pngBase64) throw new Error('read_attachment gaf andere bytes terug dan geüpload.');
    const digest = createHash('sha256').update(Buffer.from(pngBase64, 'base64')).digest('hex');
    if (uploaded.sha256 !== digest) throw new Error('De SHA-256 van de bijlage klopt niet.');

    report.writeTest = {
      projectId: project.id,
      blockId: block.id,
      block: parsed(await client.callTool({ name: 'get_block', arguments: { blockId: block.id } })),
      task,
      tasks: parsed(await client.callTool({ name: 'list_tasks', arguments: { status: 'inbox' } })),
      attachment: uploaded
    };
  }

  console.log(JSON.stringify(report, null, 2));
} finally {
  await client.close();
}
