export type ChangelogCategory = 'feature' | 'improvement' | 'fix';

export interface ChangelogItem {
  type: ChangelogCategory;
  text: string;
  detail?: string;
}

export interface ReleaseEntry {
  version: string;
  date: string;
  title: string;
  summary?: string;
  items: ChangelogItem[];
}

export const CURRENT_APP_VERSION = '0.2.32';

export const CHANGELOG_ENTRIES: ReleaseEntry[] = [
  {
    version: '0.2.32',
    date: 'August 2026',
    title: 'Graph Keeps Its Hands Off The Writing Panel',
    items: [
      {
        type: 'fix',
        text: 'Writing Panel Stays Put In Graph View',
        detail: 'Opening the loose ends panel widened the graph view and shoved the writing panel off its right edge. The graph view now claims the space left over beside the writing panel and stays shrinkable, and the loose ends panel gives way before the canvas does instead of forcing the whole view wider.'
      }
    ]
  },
  {
    version: '0.2.31',
    date: 'August 2026',
    title: 'A Graph You Can Enter Cold',
    summary: 'The graph now opens on the workspace instead of on whichever block happened to be open, so it answers what is in here before it answers what hangs off this one block.',
    items: [
      {
        type: 'feature',
        text: 'Workspace And Project Levels',
        detail: 'Three levels of zoom: projects and how strongly they are tied together, then the best connected blocks inside one project, then the neighbourhood of a single block that was already there. A breadcrumb walks back up. Edge thickness on the workspace level is the number of relations running between two projects. Nodes are ranked so the cap drops the quietest, never an arbitrary slice.'
      },
      {
        type: 'feature',
        text: 'Loose Ends',
        detail: 'A panel listing what the graph cannot reach: blocks nothing links to, and references pointing at a title that does not exist or that more than one block carries. Scoped to the whole workspace or to the project you are looking at.'
      },
      {
        type: 'improvement',
        text: 'Depth And Filters Where They Apply',
        detail: 'The depth selector and relation type filters now appear only at block level, where they actually change the picture. A chip jumps straight to the block open elsewhere in the app.'
      }
    ]
  },
  {
    version: '0.2.30',
    date: 'August 2026',
    title: 'Clean Webhook Creator & Assignment Metadata',
    summary: 'Webhook payloads now carry createdBy as a stable slug, createdByType as the branch axis, and assignedTo as the assignment — not a mix of types, names and claim ids.',
    items: [
      {
        type: 'improvement',
        text: 'Clean Webhook Assignment & Creator Metadata',
        detail: 'Task and block webhook payloads now include createdBy (a stable slug: user, openai, claude, gemini, or a custom agent name), createdByType (user or agent), and assignedTo (the assigned provider slug, or null when unassigned). Claim owner ids stay in metadata. Every block now records its creator; rows without one default to the user.'
      }
    ]
  },
  {
    version: '0.2.28',
    date: 'August 2026',
    title: 'Graph View & Search That Matches The Agents',
    summary: 'A new graph view shows what the block you are reading hangs together with, and the search window finally ranks passages the way agents already did.',
    items: [
      {
        type: 'feature',
        text: 'Graph View',
        detail: 'A fourth view (Ctrl + 4) draws the neighbourhood around the block you have open: which blocks it connects to, in which direction and through which kind of relation. Depth 1 to 3, filters per relation type, and dependencies drawn as their own dashed edge. Deliberately a readable neighbourhood rather than a cloud of the whole workspace.'
      },
      {
        type: 'feature',
        text: 'Cross-Project Connections Stand Out',
        detail: 'Nodes from another project carry that project name and colour, and their edges are highlighted — those are exactly the connections the column view cannot show.'
      },
      {
        type: 'improvement',
        text: 'Search Window Matches The Agent Search',
        detail: 'The search window now scores passages instead of whole documents, shows the heading a match sits under, and lists project hits alongside block hits. It uses the same ranking and snippets as the agent tools, so both find the same thing.'
      },
      {
        type: 'fix',
        text: 'Search No Longer Hangs On A Circular Parent Chain',
        detail: 'Building a result breadcrumb walked parents without cycle protection; a looping chain could lock the window.'
      }
    ]
  },
  {
    version: '0.2.27',
    date: 'August 2026',
    title: 'Knowledge Graph & Findable Scratchpads',
    summary: 'Block references became real relations that survive renames and cross projects, and the decisions recorded in project scratchpads are finally searchable.',
    items: [
      {
        type: 'feature',
        text: 'Typed, Cross-Project Relations',
        detail: 'References are stored as relations pointing at blocks rather than matched by title, so renaming a block no longer breaks them and a reference can point into another project. Alongside the neutral relation you can express supports, contradicts, derived-from and source-of.'
      },
      {
        type: 'feature',
        text: 'Agents Can Traverse The Graph',
        detail: 'New link_blocks and get_related tools let an agent walk outward from a block instead of searching again. Backlinks count as a step, and every result reports direction, relation type, distance and whether it crosses a project.'
      },
      {
        type: 'feature',
        text: 'Project Scratchpads Are Searchable',
        detail: 'Search now covers project titles, descriptions and scratchpads, so the decisions recorded there can actually be found. Project hits carry the same snippet, score and heading as block hits.'
      },
      {
        type: 'improvement',
        text: 'References Panel Shows Relation Type And Origin',
        detail: 'Outgoing references and backlinks now show what kind of relation they are and mark the ones that live in another project.'
      },
      {
        type: 'improvement',
        text: 'Ambiguous References Stay Honest',
        detail: 'A reference to a title that does not exist, or that two blocks share, is left unresolved instead of being pointed at the wrong block.'
      }
    ]
  },
  {
    version: '0.2.26',
    date: 'August 2026',
    title: 'Outgoing Webhooks & Sharper Agent Search',
    summary: 'DeepScribe now pushes task and block events to external automations, agents can leave their results on a task, and search finds the passage instead of the document.',
    items: [
      {
        type: 'feature',
        text: 'Outgoing Webhooks',
        detail: 'Configure webhook endpoints under Settings → Agents and pick which events they receive. Task status changes, new tasks and block edits are posted as JSON to n8n, Discord, Home Assistant or any HTTP endpoint, with optional bearer or HMAC signing and a five-second timeout.'
      },
      {
        type: 'feature',
        text: 'Passage-Level Search',
        detail: 'Search now scores individual passages instead of whole documents, so a single relevant paragraph inside a long chapter surfaces. Results carry a snippet, a score, the heading the match sits under, and why it matched.'
      },
      {
        type: 'feature',
        text: 'Agents Can Report Back On Tasks',
        detail: 'Agents may now write a delivery report into a task instead of only changing its status. Title, dependencies, assignment, position and status stay user-owned, and a task claimed by another agent is protected from being overwritten.'
      },
      {
        type: 'improvement',
        text: 'Agent HTML Is Accepted And Sanitised',
        detail: 'Content sent as HTML is stored as real headings and paragraphs rather than visible escaped tags, reduced to the tags the editor supports so scripts, event handlers and unsafe links cannot get in.'
      },
      {
        type: 'improvement',
        text: 'One Rule Set For Online And Offline Agents',
        detail: 'The live bridge and the standalone MCP server now share a single domain core, so agent behaviour no longer depends on whether DeepScribe is running.'
      },
      {
        type: 'fix',
        text: 'Task Pickup Corrections',
        detail: 'Tasks assigned to nobody, and tasks whose dependency was deleted or moved to the trash, are no longer handed out to offline agents.'
      }
    ]
  },
  {
    version: '0.2.25',
    date: 'August 2026',
    title: 'Custom Theme Colors Table & Contrast Overhaul',
    summary: 'Redesigned theme custom colors into a categorized table list, expanded UI element color controls, and perfected contrast across all themes.',
    items: [
      {
        type: 'feature',
        text: 'Categorized Custom Colors Table',
        detail: 'Replaced cramped color picker row with a structured list organized by Surfaces, Headers, Text, and Accents with instant swatch picking and HEX badges.'
      },
      {
        type: 'feature',
        text: 'Extended UI Layer Color Controls',
        detail: 'Individually customize App Background, Surface Panels, Card Backgrounds, Selected Card Highlight, Modal/App Headers, and Column Headers.'
      },
      {
        type: 'improvement',
        text: 'Master Reset to Preset',
        detail: 'Quickly restore custom theme overrides back to the active preset palette with one click.'
      },
      {
        type: 'fix',
        text: 'Theme Contrast & Legibility Fixes',
        detail: 'Replaced hardcoded dark styling in modal headers, Miller column headers, tag filter bars, and editor toolbars so Sepia and custom light themes render cleanly.'
      }
    ]
  },
  {
    version: '0.2.24',
    date: 'August 2026',
    title: 'Universal Task Stage Drag & Drop',
    summary: 'Freely drag and drop tasks into any board stage, including empty columns, collapsed lanes, and cross-project stages.',
    items: [
      {
        type: 'feature',
        text: 'Drop onto Any Stage Column',
        detail: 'Tasks can now be dropped anywhere onto a stage column, even when that stage has no tasks for that project yet.'
      },
      {
        type: 'feature',
        text: 'Multi-Task Drag Support',
        detail: 'Moving any selected task now moves all selected tasks together into the target stage.'
      },
      {
        type: 'improvement',
        text: 'Precise Positioning & Collapsed Lane Dropping',
        detail: 'Drop on the top or bottom half of cards for relative ordering, or drop onto collapsed columns like Done.'
      }
    ]
  },
  {
    version: '0.2.23',
    date: 'August 2026',
    title: 'Agent Task Assignment Target',
    summary: 'Allow AI agents to specify an explicit target assignee when creating tasks via MCP.',
    items: [
      {
        type: 'feature',
        text: 'Assignee Target in create_task',
        detail: 'Agents can now specify an assigneeTarget (such as Claude, Gemini, OpenAI, or custom) during task creation.'
      },
      {
        type: 'improvement',
        text: 'Clear MCP Tool Schema',
        detail: 'Clarified distinction between creator provenance identity (agentTarget) and task assignee target (assigneeTarget).'
      }
    ]
  },
  {
    version: '0.2.22',
    date: 'August 2026',
    title: 'Task Stage Quick Progression',
    summary: 'Instantly advance task workflow stages with one-click quick action buttons on task cards and in the editor.',
    items: [
      {
        type: 'feature',
        text: 'Inbox → Ready Quick Action',
        detail: 'Triage newly created tasks in the Workspace Inbox directly into the Ready queue with a single click on the card.'
      },
      {
        type: 'feature',
        text: 'Review → Done Quick Action',
        detail: 'Approve agent and teammate deliverables in the Review stage and complete them immediately.'
      },
      {
        type: 'improvement',
        text: 'Task Inspector Quick Actions',
        detail: 'Stage progression shortcuts are now directly accessible within the task inspector in the writing panel.'
      }
    ]
  },
  {
    version: '0.2.21',
    date: 'August 2026',
    title: 'Visual Screen Annotation & Release Changelog',
    summary: 'Capture visual annotations directly from Windows and stay up-to-date with new features through the in-app release notes.',
    items: [
      {
        type: 'feature',
        text: 'Visual Screen Annotation Overlay',
        detail: 'Press Ctrl+Alt+S from anywhere in Windows to freeze the screen, draw arrows, boxes, or badges, and turn captured visual context directly into tasks or documentation blocks.'
      },
      {
        type: 'feature',
        text: "What's New & Release Changelog",
        detail: 'View release notes and update summaries directly within the app, accessible via Settings → General or automatically after an update.'
      },
      {
        type: 'improvement',
        text: 'System Tray & Background Daemon',
        detail: 'Keep DeepScribe running silently in the Windows system tray so global shortcuts remain responsive without keeping the main window open.'
      },
      {
        type: 'improvement',
        text: 'Polished Agent Alert Badges',
        detail: 'Unseen agent-authored content badges now cleanly propagate up through parent blocks to project columns with customizable alert colors.'
      },
      {
        type: 'fix',
        text: 'SQLite Workspace Sync Resilience',
        detail: 'Eliminated potential race conditions when rapid concurrent agent writes occur during background sync.'
      }
    ]
  },
  {
    version: '0.2.19',
    date: 'July 2026',
    title: 'Offline MCP Bridge & Multi-Agent Support',
    summary: 'Connect AI agents and LLM tools to your local knowledge base safely and securely.',
    items: [
      {
        type: 'feature',
        text: 'Model Context Protocol (MCP) Desktop Bridge',
        detail: 'Integrated local MCP bridge enabling Codex, Claude Desktop, and ChatGPT to read and contribute to your projects and task items.'
      },
      {
        type: 'improvement',
        text: 'Safe Markdown Ingestion',
        detail: 'Agent-provided Markdown is securely transformed into native editor blocks without breaking existing structure or user formatting.'
      },
      {
        type: 'improvement',
        text: 'Per-Session Security Tokens',
        detail: 'All bridge communications are constrained to local loopback (127.0.0.1) with randomized runtime authentication tokens.'
      },
      {
        type: 'fix',
        text: 'Attachment Resource Resolution',
        detail: 'Fixed deepscribe:// attachment resource URI resolution when streaming large binary files through MCP.'
      }
    ]
  },
  {
    version: '0.2.18',
    date: 'June 2026',
    title: 'Block Version History & Line Diffs',
    summary: 'Track document revisions, inspect visual diffs, and restore earlier states with confidence.',
    items: [
      {
        type: 'feature',
        text: 'Block Revision History Timeline',
        detail: 'Inspect the full change history of any block with author attribution (Developer vs AI-Agent) and timestamps.'
      },
      {
        type: 'feature',
        text: 'Visual Line-by-Line Diffs',
        detail: 'Compare any revision against the current live version or previous snapshot with highlighted additions and deletions.'
      },
      {
        type: 'improvement',
        text: 'One-Click Version Restore',
        detail: 'Revert content, titles, and tags back to any historical snapshot safely without losing previous revision logs.'
      }
    ]
  },
  {
    version: '0.2.17',
    date: 'May 2026',
    title: 'Tasks Board & Workspace Statistics',
    summary: 'Organize project action items and visualize your knowledge base metrics.',
    items: [
      {
        type: 'feature',
        text: 'Dedicated Tasks Kanban Board',
        detail: 'Manage tasks across projects with status pipelines (Inbox, Ready, In Progress, Blocked, Review, Done) and agent claim tracking.'
      },
      {
        type: 'feature',
        text: 'Workspace Statistics View',
        detail: 'Analyze word counts, block hierarchy depths, tag distribution, and recent activity trends across your workspace.'
      },
      {
        type: 'improvement',
        text: 'Global Navigation Hotkeys',
        detail: 'Quickly switch between Columns (Ctrl+1), Tasks (Ctrl+2), and Stats (Ctrl+3).'
      }
    ]
  },
  {
    version: '0.1.0',
    date: 'March 2026',
    title: 'Initial Release of DeepScribe',
    summary: 'Local-first hierarchical writing and knowledge application with Miller columns.',
    items: [
      {
        type: 'feature',
        text: 'Miller Columns Navigation',
        detail: 'Navigate infinite hierarchical trees smoothly with horizontal column panning and keyboard navigation.'
      },
      {
        type: 'feature',
        text: 'Local-First SQLite & Dexie Storage',
        detail: 'Portable workspace storage stored directly on your computer with instantaneous offline search and full export capabilities.'
      },
      {
        type: 'feature',
        text: 'Distraction-Free Writing Panel',
        detail: 'Rich text editing powered by TipTap with support for markdown shortcuts, tables, images, and attachments.'
      }
    ]
  }
];

/**
 * Parses a semantic version string into a comparable numeric tuple.
 * Supports standard semver like "0.2.20" or "v0.2.20".
 */
export function parseSemver(versionStr: string): [number, number, number] {
  const cleaned = versionStr.trim().replace(/^v/, '');
  const parts = cleaned.split('.').map(p => {
    const num = parseInt(p, 10);
    return isNaN(num) ? 0 : num;
  });
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

/**
 * Compares two semantic version strings.
 * Returns:
 *   1 if v1 > v2
 *  -1 if v1 < v2
 *   0 if v1 === v2
 */
export function compareSemver(v1: string, v2: string): number {
  const [major1, minor1, patch1] = parseSemver(v1);
  const [major2, minor2, patch2] = parseSemver(v2);

  if (major1 !== major2) return major1 > major2 ? 1 : -1;
  if (minor1 !== minor2) return minor1 > minor2 ? 1 : -1;
  if (patch1 !== patch2) return patch1 > patch2 ? 1 : -1;
  return 0;
}

/**
 * Determines whether the "What's New" modal should pop up automatically.
 *
 * Rules agreed via design review:
 * 1. If `lastSeenVersion` is undefined (fresh install / first run), returns false
 *    (the caller should silently record the current version).
 * 2. If `currentVersion` is strictly greater than `lastSeenVersion`, returns true.
 * 3. Otherwise returns false.
 */
export function shouldAutoOpenWhatsNew(currentVersion: string, lastSeenVersion?: string): boolean {
  if (!lastSeenVersion) {
    return false;
  }
  return compareSemver(currentVersion, lastSeenVersion) > 0;
}
