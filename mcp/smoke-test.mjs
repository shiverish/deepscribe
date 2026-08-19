#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ResourceUpdatedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';

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
  const expectedTools = ['status', 'list_projects', 'get_block', 'list_attachments', 'read_attachment', 'search', 'create_block', 'move_block', 'create_work_item', 'create_task_block', 'update_task_block', 'convert_block_to_task', 'list_claimable_work_items', 'claim_next_work_item', 'renew_work_item_claim', 'transition_work_item', 'list_todos', 'add_todo', 'set_todo_status', 'get_or_create_daily_plan'];
  for (const name of expectedTools) {
    if (!tools.tools.some(tool => tool.name === name)) throw new Error(`MCP-tool ontbreekt: ${name}`);
  }
  const status = await client.callTool({ name: 'status', arguments: {} });
  const projects = await client.callTool({ name: 'list_projects', arguments: {} });
  const templates = await client.listResourceTemplates();
  if (!templates.resourceTemplates.some(template => template.uriTemplate === 'deepscribe://attachment/{attachmentId}')) {
    throw new Error('MCP-resourcetemplate voor bijlagen ontbreekt.');
  }
  if (!templates.resourceTemplates.some(template => template.uriTemplate === 'deepscribe://agent-inbox/{projectId}')) {
    throw new Error('MCP-resourcetemplate voor Agent Inbox ontbreekt.');
  }
  const report = { toolCount: tools.tools.length, status: parsed(status), projects: parsed(projects) };
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
      arguments: { projectId: project.id, title: 'Agent concept', content: 'Eerste concept via MCP.', tags: ['concept', 'agent-ready'] }
    }));
    const inboxUri = `deepscribe://agent-inbox/${project.id}`;
    let resolveInboxUpdate;
    const inboxUpdated = new Promise(resolve => { resolveInboxUpdate = resolve; });
    client.setNotificationHandler(ResourceUpdatedNotificationSchema, notification => {
      if (notification.params.uri === inboxUri) resolveInboxUpdate(notification.params.uri);
    });
    await client.subscribeResource({ uri: inboxUri });
    const typedTask = parsed(await client.callTool({
      name: 'create_task_block',
      arguments: {
        projectId: project.id,
        parentId: block.id,
        title: 'Pickup smoke-taak',
        goal: 'Controleer de claimlaag',
        context: 'Deze taak valideert de MCP claimtools end-to-end.',
        acceptanceCriteria: ['De taak kan atomair worden geclaimd'],
        agentTarget: 'openai',
        ready: true
      }
    }));
    const notifiedUri = await Promise.race([
      inboxUpdated,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Geen resources/updated voor Agent Inbox ontvangen.')), 5000))
    ]);
    if (notifiedUri !== inboxUri) throw new Error('Agent Inbox-notificatie verwees naar een onverwachte resource.');
    await client.unsubscribeResource({ uri: inboxUri });
    const claim = parsed(await client.callTool({
      name: 'claim_next_work_item',
      arguments: { projectId: project.id, agentId: 'smoke-agent', agentTarget: 'openai', requestId: 'smoke-request', leaseSeconds: 60 }
    }));
    if (claim.block.id !== typedTask.id || claim.block.task.claim.token !== '[redacted]') throw new Error('Claimresultaat is ongeldig of lekt de token.');
    parsed(await client.callTool({
      name: 'transition_work_item',
      arguments: { blockId: typedTask.id, agentId: 'smoke-agent', claimToken: claim.claimToken, status: 'review' }
    }));
    parsed(await client.callTool({ name: 'append_to_block', arguments: { blockId: block.id, text: 'Aanvullende context blijft behouden.' } }));
    parsed(await client.callTool({ name: 'add_todo', arguments: { blockId: block.id, text: 'Werk dit concept uit' } }));
    const openTodos = parsed(await client.callTool({ name: 'list_todos', arguments: { blockId: block.id, completed: false } }));
    parsed(await client.callTool({ name: 'set_todo_status', arguments: { blockId: block.id, taskIndex: openTodos[0].taskIndex, completed: true } }));
    report.writeTest = {
      projectId: project.id,
      blockId: block.id,
      block: parsed(await client.callTool({ name: 'get_block', arguments: { blockId: block.id } })),
      todos: parsed(await client.callTool({ name: 'list_todos', arguments: { blockId: block.id } }))
    };
  }

  console.log(JSON.stringify(report, null, 2));
} finally {
  await client.close();
}
