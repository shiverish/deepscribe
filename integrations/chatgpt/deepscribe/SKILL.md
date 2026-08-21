---
name: deepscribe
description: Use DeepScribe tools to find, read, capture, organize, format, and update projects, knowledge blocks, user-managed tasks, relations, and linked files. Use when the user mentions DeepScribe, DS, @DeepScribe, stored knowledge, a DeepScribe project or block, or asks to save, retrieve, connect, clean up, or revise information in DeepScribe. Do not use merely to change the DeepScribe application source code unless the request also concerns data stored in DeepScribe.
---

# DeepScribe

Use the connected DeepScribe tools as the only interface to the user's stored workspace. Never claim to have read or changed DeepScribe when those tools are unavailable.

## Connect

1. Locate the tools belonging to the DeepScribe MCP app or connector.
2. Call `status` before the first data operation when connectivity is uncertain.
3. If the tools are missing or offline, tell the user that this skill supplies the workflow but not the connection. Ask them to start DeepScribe and connect its MCP app. Do not invent data or IDs.

## Resolve context

1. Use `list_projects`, `search`, `list_blocks`, `list_tasks`, or `list_todos` to find candidate records.
2. Use `get_project` or `get_block` before changing an existing record.
3. Resolve titles to actual IDs. Never guess project IDs, block IDs, attachment IDs, or todo indexes.
4. Infer the target only when context is strong. If multiple records remain plausible, ask one concise question.

## Read and synthesize

- Prefer targeted searches and reads over loading entire projects.
- Preserve relevant project, hierarchy, tag, relation, attachment, and task context.
- Use `list_todos` with `completed: false` for open work.
- Use `list_tasks` and `get_task` for user-managed tasks. After creation, task bodies are read-only to agents.
- Distinguish facts stored in DeepScribe from conclusions or suggestions produced during the conversation.
- Use `list_attachments` before `read_attachment`. Read only files relevant to the request and state when a binary format cannot be interpreted reliably.

## Write safely

- Read the destination immediately before writing to it.
- Use `create_task` only for concrete future work, risks or ideas worth preserving. Search existing tasks first and reuse a stable request ID so retries do not create duplicates.
- Every agent-created task goes to Workspace Inbox as Inbox and Unassigned. Never attempt to choose its project, context, assignment or ordering.
- Never create a task as an administrative prelude to a change you can perform directly. Inline todos, checklist actions and planning placeholders remain user-managed.
- When the user asks you to write content, write it directly to the intended regular knowledge block. Do not create a task first.
- Use `update_task_status` only when reporting progress on an existing task. Never change its title, body, tags, links, dependencies, ordering, assignment, or location.
- Use `append_to_block` when adding information so existing content remains intact.
- Use `update_block` only when the user intends to revise the whole title, body, or tag set, or explicitly asks to reformat an existing block.
- Preserve meaning, facts, links, todos, headings, emphasis, and intentional ordering when reformatting. Do not silently summarize or rewrite content unless requested.
- Follow the language already used in the project; otherwise follow the user's language.
- After a write, report exactly what changed and identify the affected project or block.

## Format block content

Write readable Markdown that DeepScribe can convert into rich editor content.

- Separate paragraphs and sections with blank lines.
- Put each bullet or numbered item on its own line.
- Use descriptive headings when content has multiple topics.
- Do not introduce task syntax (`- [ ]` or `- [x]`); inline todos are user-managed.
- Keep prose as prose; do not turn every sentence into a bullet.
- Avoid a single dense text blob and avoid decorative over-formatting.

When cleaning up an existing block, first identify its structure, then re-express the same content in Markdown. Verify that no substantive item disappeared before calling `update_block`.

## Work with relations

DeepScribe relations are wiki links written as `[[Exact block title]]`.

1. Resolve and read the source and target blocks.
2. Confirm both blocks belong to the same project and the target title is unique.
3. Check that the exact relation is not already present.
4. Append a short contextual sentence containing `[[Target title]]` to the source block.

Do not create a relation when duplicate titles make it ambiguous. Explain that relations are title-based when renaming could affect them.

## Interpret common requests

- “Zet dit in DeepScribe”: find the strongest existing destination, prefer appending, and ask only when materially ambiguous.
- “Maak hier een actie van”: explain that DeepScribe tasks are user-managed and do not create one through the agent tools.
- “Koppel dit aan X”: create a verified wiki relation from the current or named source block to X.
- “Wat staat er over X?”: search, read the strongest matches, and synthesize without writing.
- “Formatteer dit blok”: preserve all meaning while replacing the full body with clean, structured Markdown.
