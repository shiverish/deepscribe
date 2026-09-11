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

export const CURRENT_APP_VERSION = '0.2.54';

export const CHANGELOG_ENTRIES: ReleaseEntry[] = [
  {
    version: '0.2.54',
    date: 'September 2026',
    title: 'Self-Repairing Claude Desktop Connection',
    summary: 'DeepScribe can now install and verify its Claude Desktop MCP connection from the active app installation.',
    items: [
      {
        type: 'feature',
        text: 'Install / repair Claude Desktop connection',
        detail: 'DeepScribe safely merges its portable MCP registration into Claude Desktop, preserves every other configured server and creates a backup before changing the file.'
      },
      {
        type: 'improvement',
        text: 'Claude connection check',
        detail: 'The check validates both the exact installed DeepScribe runtime path and a live MCP status response, with a clear Claude Desktop restart reminder.'
      }
    ]
  },
  {
    version: '0.2.53',
    date: 'September 2026',
    title: 'Self-Repairing Codex Connection',
    summary: 'DeepScribe can now package, install and verify its Codex MCP connection without relying on a developer checkout path.',
    items: [
      {
        type: 'feature',
        text: 'Install / repair Codex connection',
        detail: 'Settings → AI & Integrations installs DeepScribe from the active app resources and checks both Codex registration and the MCP status tool.'
      },
      {
        type: 'improvement',
        text: 'Portable Codex plugin and corrected task guidance',
        detail: 'The repository now builds a Codex plugin with the DeepScribe skill, and “Maak hier een actie van” correctly uses create_task for concrete follow-ups.'
      }
    ]
  },
  {
    version: '0.2.52',
    date: 'September 2026',
    title: 'Responsive Keyboard Shortcut Guide',
    summary: 'The shortcut guide is now wider, grouped by workflow and keeps its configurable window hotkey current.',
    items: [
      {
        type: 'improvement',
        text: 'Wider responsive shortcut guide',
        detail: 'Shortcut categories use a two-column layout on wide screens and collapse to one scrolling column on compact windows.'
      },
      {
        type: 'improvement',
        text: 'Current global window hotkey',
        detail: 'The guide now shows the configured Toggle DeepScribe Window binding rather than always displaying the default.'
      }
    ]
  },
  {
    version: '0.2.51',
    date: 'September 2026',
    title: 'Responsive Collapsible Inspector',
    summary: 'Inspector metadata now collapses into accessible sections for smaller screens.',
    items: [{ type: 'feature', text: 'Collapsible Inspector sections', detail: 'Project color, Quick Capture, task details, tags, attachments, dependencies, references and scratchpad can be expanded when needed.' }]
  },
  {
    version: '0.2.50',
    date: 'September 2026',
    title: 'Project Momentum Focus Radar',
    summary: 'Focus Radar now maps projects by momentum instead of placing individual tasks on fixed status rings.',
    items: [
      {
        type: 'feature',
        text: 'Project-level momentum radar',
        detail: 'Projects move inward through current activity, actionable work and stored graph references; stale, sparse projects remain visible on the outer orbit.'
      },
      {
        type: 'fix',
        text: 'Orbit rotation centred on the Focus hub',
        detail: 'Replaced the conflicting status-ring transforms so radar nodes circulate around the actual centre.'
      }
    ]
  },
  {
    version: '0.2.49',
    date: 'September 2026',
    title: 'Hotkey Recorder & Capture Improvements',
    summary: 'Fixed global shortcut recording to reliably capture Alt key combinations via window capture listener and disabled native menu activation.',
    items: [
      {
        type: 'fix',
        text: 'Reliable hotkey recording for Alt key combinations',
        detail: 'Fixed key capture to reliably record combinations like Alt+D by using window-level capture phase listeners, code-based key mapping, and disabling native menu bar activation.'
      },
      {
        type: 'improvement',
        text: 'Direct manual typing for global hotkeys',
        detail: 'Added direct text input support alongside key recording so shortcuts can also be typed manually.'
      }
    ]
  },
  {
    version: '0.2.48',
    date: 'September 2026',
    title: 'Global Window Toggle & Customizable Hotkey',
    summary: 'Bring DeepScribe to the front or minimize it to the system tray with a system-wide hotkey (default Ctrl + Alt + D), fully customizable in Settings.',
    items: [
      {
        type: 'feature',
        text: 'Global hotkey to toggle DeepScribe window',
        detail: 'Instantly restore, show, and focus DeepScribe from anywhere in Windows, or minimize it back to the system tray (default Ctrl + Alt + D).'
      },
      {
        type: 'improvement',
        text: 'Customizable global shortcut in Settings',
        detail: 'Configure your preferred global shortcut with key recording support and a one-click reset under Settings → Desktop Integration.'
      }
    ]
  },
  {
    version: '0.2.47',
    date: 'September 2026',
    title: 'Bounded Context Retrieval for Agents',
    summary: 'Agents can now request one deterministic, source-traceable context package instead of assembling project knowledge through many separate calls.',
    items: [
      {
        type: 'feature',
        text: 'Bounded context retrieval for agents',
        detail: 'Added a read-only get_context MCP tool that combines source passages, project instructions, hierarchy, typed relations, backlinks, tasks, dependencies, and freshness metadata in one deterministic character budget.'
      }
    ]
  },
  {
    version: '0.2.46',
    date: 'September 2026',
    title: 'Text Note Tool in SeeScribe',
    summary: 'Added an interactive Text Note (💬 Note) annotation tool to the SeeScribe overlay canvas.',
    items: [
      {
        type: 'feature',
        text: 'Interactive text notes on screen captures',
        detail: 'Place, type, drag, re-edit, and delete text notes directly on the screen capture canvas with multi-line support and shortcut keys (7 and T).'
      },
      {
        type: 'improvement',
        text: 'Structured text note metadata',
        detail: 'Formatted on-screen text notes into task markdown descriptions and attached structured JSON annotation metadata for agents.'
      }
    ]
  },
  {
    version: '0.2.45',
    date: 'September 2026',
    title: 'Task ID Assignment for SeeScribe Captures',
    summary: 'Screen captures submitted via SeeScribe now correctly receive sequential task numbers (#TSK-xxx) and human identifiers.',
    items: [
      {
        type: 'fix',
        text: 'Sequential task number for SeeScribe captures',
        detail: 'Assigned sequential TSK numbers to tasks created via SeeScribe capture bridge and auto-healed legacy unnumbered tasks upon workspace load.'
      }
    ]
  },
  {
    version: '0.2.44',
    date: 'September 2026',
    title: 'Configurable Project & Agent Targets for Quick Capture',
    summary: 'Configure Project and Agent targets directly in Quick Capture, the Writing Panel inspector, or via the capture card right-click context menu.',
    items: [
      {
        type: 'feature',
        text: 'Quick Capture configuration',
        detail: 'Select Project and Agent targets when creating captures with automatic preference memory.'
      },
      {
        type: 'feature',
        text: 'Writing Panel inspector & card context menu',
        detail: 'Easily change Project and Agent targets on existing captures from the Writing Panel or via right-click context menu on capture cards.'
      },
      {
        type: 'fix',
        text: 'Reliable capture persistence',
        detail: 'Immediate disk flush and external data version tracking prevents capture disappearance upon window focus.'
      }
    ]
  },
  {
    version: '0.2.43',
    date: 'September 2026',
    title: 'Restored Classic Quick Capture in Tasks',
    summary: 'Restored the streamlined Quick Capture workflow embedded directly within Tasks and Writing Panel, removing the separate Inbox view.',
    items: [
      {
        type: 'improvement',
        text: 'Classic Quick Capture restored',
        detail: 'Captures appear in their dedicated collapsible section inside Tasks with 1-click Ready task conversion, without a separate Inbox view.'
      }
    ]
  },
  {
    version: '0.2.40',
    date: 'September 2026',
    title: 'Product Landing Page & Enhanced Capture Triage Instructions',
    summary: 'Introduced the official product landing page and enhanced agent instructions for Quick Capture triage.',
    items: [
      {
        type: 'feature',
        text: 'Product Landing Page',
        detail: 'Modern showcase landing page introducing DeepScribe architecture, orbital momentum workflow, and AI agent co-working capabilities.'
      },
      {
        type: 'improvement',
        text: 'Actionable Capture Triage Prompt',
        detail: 'Refined the default Goal, Context, and Acceptance Criteria when converting captured notes into Ready tasks for agent triage.'
      }
    ]
  },
  {
    version: '0.2.39',
    date: 'September 2026',
    title: 'Quick Capture Triage & Captures Tray',
    summary: 'Easily view, manage, and convert raw Quick Capture entries into actionable Ready tasks directly within the Tasks view.',
    items: [
      {
        type: 'feature',
        text: 'Captures Section in Tasks View',
        detail: 'A dedicated collapsible tray at the top of the Inbox column (and List view) displaying all unprocessed Quick Capture entries with relative timestamps and project hint badges.'
      },
      {
        type: 'feature',
        text: '1-Click Ready Task Conversion',
        detail: 'Instantly transform raw capture notes in-place into structured Ready tasks with Goal, Context, and Acceptance Criteria, pre-assigned to the hinted project.'
      },
      {
        type: 'improvement',
        text: 'Writing Panel Quick Capture Inspector',
        detail: 'Review and convert captured notes into Ready tasks directly while inspecting or editing notes in the Writing Panel.'
      }
    ]
  },
  {
    version: '0.2.38',
    date: 'September 2026',
    title: 'Windows Startup & Background Launch',
    summary: 'Automatically launch DeepScribe when you log in to Windows, with a configurable option to start silently minimized in the system tray.',
    items: [
      {
        type: 'feature',
        text: 'Start on Windows Startup',
        detail: 'DeepScribe can now be configured to start automatically at Windows login. Toggle it on or off in Settings > General.'
      },
      {
        type: 'feature',
        text: 'Start Minimized to System Tray',
        detail: 'When auto-start is enabled, DeepScribe can launch silently in the background so global hotkeys (such as Quick Capture Ctrl + Alt + C and Screen Annotation) are immediately ready without interrupting you.'
      }
    ]
  },
  {
    version: '0.2.37',
    date: 'August 2026',
    title: 'Task Project Filter & Multi-Select',
    summary: 'Effortlessly exclude specific projects with a single click, toggle all projects with dynamic Select All / Deselect All, and enjoy clean zero-selection state handling.',
    items: [
      {
        type: 'improvement',
        text: 'Single Project Exclusion',
        detail: 'Clicking a project when all projects are active now unchecks only that project while keeping all other projects selected, making it easy to exclude a few projects.'
      },
      {
        type: 'improvement',
        text: 'Dynamic Select / Deselect All',
        detail: 'The project filter now features a dynamic toggle button to select or deselect all projects (or search-filtered projects) with one click.'
      }
    ]
  },
  {
    version: '0.2.36',
    date: 'August 2026',
    title: 'Circle Momentum Radar',
    summary: 'A complete redesign of the Focus view into an interactive Circle Momentum Radar with concentric orbital tracks, momentum hub, live glowing nodes, and hover previews.',
    items: [
      {
        type: 'feature',
        text: 'Circle Momentum Radar',
        detail: 'The Focus view is now an orbital radar visualization showing workspace momentum. A central hub displays total active tasks and agent counts, surrounded by three concentric rings (Your Turn, In Flight, and Up Next). Orbiting nodes reflect project colors, active pulse intensities, drift alert warnings, and quick hover previews.'
      },
      {
        type: 'improvement',
        text: 'Focus View Project & Rotation Controls',
        detail: 'Filter radar items by specific projects or view all projects at once, and pause or resume orbital rotation with a single click in the header.'
      }
    ]
  },
  {
    version: '0.2.35',
    date: 'August 2026',
    title: 'Somewhere To Dump It, Somewhere To See It',
    summary: 'A capture window for the thought you do not want to file yet, a Focus view for where everything stands, a say in which view opens first, and a clear button on every search field.',
    items: [
      {
        type: 'feature',
        text: 'Focus View',
        detail: 'The switcher slot the graph view left behind is now Focus, on Ctrl + 4. It answers "where do I stand" across every project: rows grouped by whose turn it is, an agent working, your turn, stuck, ready to pick up. Rows are flagged when a claim has expired or is about to, when a task looks busy but its agent has gone quiet, and when something has been waiting on you for days. No new data, no editing: every row leads back to the block.'
      },
      {
        type: 'feature',
        text: 'Quick Capture',
        detail: 'Ctrl + Alt + C opens a small always-on-top window with one text field and nothing that has to be filled in, also reachable from the tray while DeepScribe sits minimised. An entry is an ordinary block in the Workspace Inbox and never a task: the text is stored verbatim, and an agent turns it into a proper task later, so tasks still come from agents alone. Capturing does not pull the app in front of whatever you were doing.'
      },
      {
        type: 'improvement',
        text: 'Choose The View DeepScribe Opens With',
        detail: 'Settings → General gains a startup view choice: a fixed view, or the one you had open last. The default keeps the old behaviour. A stored view that no longer exists falls back to the columns, which is not theoretical: the graph view was removed in 0.2.33.'
      },
      {
        type: 'improvement',
        text: 'Every Search Field Has A Clear Button',
        detail: 'All five search surfaces share one clear button that appears only when the field holds something, and focus stays in the input afterwards. Escape now clears a filled field first and closes the search modal or find bar once it is empty. Clearing empties the search text alone, so the task view keeps its project and status filters; the search modal is the exception, because tags are part of its query.'
      }
    ]
  },
  {
    version: '0.2.34',
    date: 'August 2026',
    title: 'Agents Can Hand You Files',
    summary: 'An agent can now attach a file to a block instead of leaving a path behind, task updates say so on the project card, and the two tray behaviours are finally separate switches.',
    items: [
      {
        type: 'feature',
        text: 'Agents Upload Attachments',
        detail: 'The new upload_attachment MCP tool takes one file per call, up to 25 MB, either from a path on disk or as base64, and stores it as a normal attachment on a knowledge or task block. Repeating an upload with the same requestId is safe: identical content gives back the attachment that is already there, different content is refused. Every uploaded file carries a SHA-256 and the id of the agent that sent it.'
      },
      {
        type: 'feature',
        text: 'Task Updates Have Their Own Badge',
        detail: 'A project card used to fold agent task updates into the same bot badge as written content, and clicking it went to the columns. Tasks now get a second badge with its own count, and it opens the task list filtered on that project.'
      },
      {
        type: 'improvement',
        text: 'Minimize And Close To Tray Are Separate',
        detail: 'One switch decided both, so keeping DeepScribe alive after closing also meant losing the window from the taskbar on minimize. They are two settings now. The tray icon only appears while one of them can actually hide the window. Your old setting carries over to both.'
      },
      {
        type: 'fix',
        text: 'Find In Block Jumps To The Match Again',
        detail: 'The find bar counted matches but never highlighted them or scrolled to them. Both the highlighting and the scrolling are fixed, and Ctrl + F on a selection prefills the search again.'
      }
    ]
  },
  {
    version: '0.2.33',
    date: 'August 2026',
    title: 'Graph View Removed',
    summary: 'The graph is a tool for agents rather than something to sit and look at, so the view is gone. The relations it drew are untouched.',
    items: [
      {
        type: 'improvement',
        text: 'Graph View Removed',
        detail: 'The fourth view and its Ctrl + 4 shortcut are gone; the switcher is back to Columns, Tasks and Stats. Nothing about the underlying data changed: relations, dependencies and wiki links are still stored, still shown in the References panel while writing, and still reachable by agents over MCP.'
      }
    ]
  },
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
