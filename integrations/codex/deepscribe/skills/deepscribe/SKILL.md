---
name: deepscribe
description: Use when the user asks Codex to read, save, organize, or turn concrete follow-up work into a task in a local DeepScribe workspace.
---

# DeepScribe for Codex

Use the installed DeepScribe MCP connection as the only interface to workspace data. Never invent project or block IDs.

## Connect

1. Run `status` before the first operation when connectivity is uncertain.
2. If DeepScribe is missing from the MCP tool list, open **DeepScribe → Settings → AI & Integrations → Codex connection** and choose **Install / repair Codex connection**. Then choose **Check connection**. This installs from the actual application location, not a development path.
3. Start a new Codex session after installation so its MCP tools are available.

## Read and write safely

- Locate targets with `list_projects`, `search`, `list_blocks`, or `list_tasks`; read a target before changing it.
- Preserve existing content. Use `append_to_block` for additive material and use `update_block` only for a deliberate replacement.
- Never guess IDs, modify task titles, assignments, dependencies, ordering, or location, and never create inline todos.

## Tasks

- “Maak hier een actie van” means: search for duplicates, then use `create_task` for a concrete future action, risk, or idea worth preserving.
- Reuse a stable `requestId` on retries so a task is not duplicated.
- Do not create a task as administration before doing a change you can perform directly.
- When explicitly assigned to a ready task, claim it before starting and close it with `transition_work_item` using a real summary.

## Verify

After a write, read the affected record or list the relevant result and report what changed.
