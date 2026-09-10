# DeepScribe

DeepScribe is a local-first writing and knowledge app with hierarchical Miller column navigation. The desktop app stores a portable SQLite workspace locally on the computer; the browser development mode uses IndexedDB through Dexie.

## Getting Started

```bash
npm install
npm run dev
```

## Standalone Desktop App (Electron)

- **Quick start (development mode):** Double-click `start-deepscribe.bat` or run `npm run app:dev`.
- **Build the standalone Windows installer:** Run `npm run app:build`. This creates the installer and update metadata in `dist-electron`.
- **Automatic Updates:** The app checks for updates in the background at startup. You can also check manually through **Settings → General → Version & Updates**. Once an update has been downloaded, it can be installed with one click after automatically backing up and flushing active changes.
- **PWA (Progressive Web App):** The web app includes a Web App Manifest (`public/manifest.json`), allowing you to install it directly from Chrome or Edge using "Install app."

## Local Data and Backups

- By default, the desktop app stores `workspace.json`, `workspace.sqlite`, and all attachments under `Documents\DeepScribe\Workspace`.
- Through **Settings → General → Data Storage**, you can open the workspace folder or safely copy it to another location and switch to that copy.
- The workspace is not yet encrypted. Protect the selected folder with appropriate Windows and disk permissions.
- On the first desktop launch, existing IndexedDB data is migrated to the workspace after confirmation; the old storage is retained as a safety copy.
- Regularly create a `.deepscribe` archive of every important project through **Export & Import**.
- Importing never overwrites an existing project: project, block, and attachment IDs are regenerated.
- An import is rolled back completely if validation or a database operation fails.
- Images inserted directly into the editor are limited to 5 MB per file.
- Images can be inserted at the desired text position using the upload button or drag and drop.
- Regular block attachments are stored under `attachments\<project-id>` in the active workspace and are limited to 25 MB per file.
- In browser development mode, DeepScribe requests persistent browser storage; only clear browser data when you have a recent export.

## DeepScribe MCP for Agents

The desktop app includes a local bridge that allows Codex and other MCP clients to read and update projects, blocks, ideas, concepts, and todos in a structured way. The bridge listens only on `127.0.0.1`, uses a random access token for each app session, and is available only while the Electron app is running.

Available actions include listing projects and blocks, searching by text or tags, creating or appending to regular knowledge blocks, reading user-managed task blocks, updating task status, and reading linked files. Agents can create tasks with `create_task`; these tasks enter Inbox with the creating agent recorded as their origin. Agents can also update a task's content and tags, preferably with `append_to_block`, for example to add a delivery report. A task's title, dependencies, assignment, position, and status remain user-controlled and are changed only through `update_task_status` and the claim tools. While another agent holds a valid claim on a task, write operations are refused unless that agent's `agentId` and `claimToken` are provided. Agents cannot create or complete inline todos. Markdown supplied by agents is safely converted into real headings, paragraphs, links, code, and lists in the editor; meaningful line breaks remain visible where appropriate. Attachments are exposed as `deepscribe://attachment/<id>` MCP resources; local file paths are never shared. Text files are returned as text, while other formats are returned as base64-encoded binary resources. Write operations do not delete content, and tool descriptions instruct agents to read first and preserve existing content wherever possible.

## Search for Agents

The MCP tool `search` scores individual passages rather than entire documents, allowing a relevant paragraph inside a long block to be found. Each result includes a snippet, score, the heading containing the match, and the reason for the match.

Projects are searched alongside blocks, including their title, description, and scratchpad. Project matches have `resultType: 'project'`; block matches have `resultType: 'block'`. The `projectId` and `tags` filters apply to both.

The in-app search window currently still uses the older block-level ranking and does not show project matches; this limitation applies only to the in-app search, not the MCP search tool.

## Relations Between Blocks

Blocks can be related to one another, including across project boundaries. Relations are stored as references to block IDs rather than titles, so renaming a block does not break them.

- In the editor, write a reference as `[[Block title]]`. When the block is saved, the reference is resolved once and converted into a relation. A title that does not exist, or that belongs to multiple blocks, deliberately remains unresolved instead of linking to the wrong block.
- In addition to the neutral `relates-to` type, DeepScribe supports `supports`, `contradicts`, `derived-from`, and `source-of`. A deliberately created typed relation is not removed when the text changes.
- The references panel shows outgoing references and backlinks, including their relation type and an indicator when the other block belongs to a different project.
- Agents use `link_blocks` to create a relation and `get_related` to traverse the graph from a block. Both outgoing links and backlinks count as a step; each result reports its direction, type, distance, and whether it crosses a project boundary.
- Permanently deleting a block or project also removes its associated relations.

## Outgoing Webhooks

DeepScribe can send task and block events as JSON to external automations such as n8n, Discord, or Home Assistant. Endpoints are managed under **Settings → Agents → Outgoing Webhooks**.

- For each endpoint, choose which events are sent: `task.status_changed`, `task.created`, `block.created`, and `block.updated`.
- The payload includes `event`, `timestamp`, `projectId`, `blockId`, `taskId`, `oldStatus`, `newStatus`, `title`, `tags`, and `metadata`.
- Delivery is asynchronous and does not block the interface; a slow or unreachable endpoint does not delay saving.
- Authentication is optional: use either an `Authorization: Bearer` header or an `X-DeepScribe-Signature` containing an HMAC-SHA256 signature of the request body.
- Only `http` and `https` URLs are accepted, with a five-second timeout. Failed deliveries are logged and do not affect other endpoints.
- Blocks in the trash do not emit events.

Blocks created or modified by an agent through MCP receive a **New from agent** badge until the block has been opened and visible for a short time. Unread changes propagate upward as a counter through all parent blocks to the project. The border, badge, and optional glow use a separate global agent alert color that can be customized under **Settings → Appearance**.

Install Codex from **Settings → AI & Integrations → Codex connection**. **Install / repair Codex connection** registers the packaged MCP server with Codex using the exact active installation path, so it works outside a development checkout. **Check connection** verifies both `codex mcp list` and the DeepScribe `status` tool. Start a new Codex session afterwards so the tools are loaded.

The source repository also contains a portable Codex plugin under `integrations/codex/deepscribe` (build it with `npm run codex:plugin:build`). It bundles the DeepScribe skill; the app’s repair button performs the machine-specific MCP registration because an installed app path cannot be safely hardcoded into a portable plugin.

### Claude Desktop Extension

Build the installable MCP Bundle with:

```powershell
npm run mcpb:build
```

This creates `dist-mcpb/DeepScribe-<version>.mcpb`. Install that file in Claude Desktop through **Settings → Extensions → Advanced settings → Install Extension**. The bundle contains the MCP server and all Node dependencies; a separate Node installation or reference to this project directory is not required. DeepScribe itself must still be running when Claude uses the tools.

### ChatGPT Skill

The reusable Agent Skill is located at `integrations/chatgpt/deepscribe`. Build an uploadable archive with:

```powershell
npm run skill:build
```

Upload `dist-skills/DeepScribe-Skill-<version>.zip` through **Plugins → Skills → Create → Upload**. The skill teaches ChatGPT how to read, update, and format DeepScribe data safely, but it does not provide a network connection to the local app. The DeepScribe tools must be made available separately as a supported MCP app.

## Checks

```bash
npm run lint
npm test
npm run build
```

The tests cover cyclic tree structures, moving records, restoring projects and blocks, permanent deletion, archive validation, and other behavior.

## License

DeepScribe is licensed under the [GNU General Public License v3.0 (GPLv3)](LICENSE).

