#!/usr/bin/env node
import path from 'node:path';
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
  const expectedTools = ['status', 'list_projects', 'get_block', 'create_task', 'list_tasks', 'get_task', 'update_task_status', 'list_attachments', 'read_attachment', 'search', 'create_block', 'move_block', 'list_claimable_work_items', 'claim_next_work_item', 'renew_work_item_claim', 'transition_work_item', 'list_todos'];
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
    report.writeTest = {
      projectId: project.id,
      blockId: block.id,
      block: parsed(await client.callTool({ name: 'get_block', arguments: { blockId: block.id } })),
      task,
      tasks: parsed(await client.callTool({ name: 'list_tasks', arguments: { status: 'inbox' } }))
    };
  }

  console.log(JSON.stringify(report, null, 2));
} finally {
  await client.close();
}
