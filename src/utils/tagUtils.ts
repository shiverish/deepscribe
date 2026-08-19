export const TAG_MAX_LENGTH = 48;

export interface TagValidationResult {
  tag: string | null;
  error: string | null;
}

/** Produces the canonical representation used in storage and comparisons. */
export function normalizeTag(tag: string): string {
  return tag.normalize('NFC').trim().replace(/^#+/, '').trim().toLowerCase();
}

/** Validates user or imported input and returns its canonical representation. */
export function parseTag(input: string): TagValidationResult {
  const tag = normalizeTag(input);
  if (!tag) return { tag: null, error: 'Enter a tag.' };
  if (tag.length > TAG_MAX_LENGTH) {
    return { tag: null, error: `A tag can contain no more than ${TAG_MAX_LENGTH} characters.` };
  }
  if (!/^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u.test(tag)) {
    return { tag: null, error: 'Use only letters, numbers, hyphens, and underscores.' };
  }
  return { tag, error: null };
}

/** Normalizes, validates and deduplicates a list while preserving its order. */
export function sanitizeTags(tags: readonly string[] = []): string[] {
  const result = new Set<string>();
  for (const candidate of tags) {
    const parsed = parseTag(candidate);
    if (parsed.tag) result.add(parsed.tag);
  }
  return Array.from(result);
}

const SEMANTIC_TAG_PALETTES: Record<string, { bg: string; text: string; border: string }> = {
  // Status / Action (Warm Amber / Ochre)
  'todo': { bg: 'hsl(38, 70%, 14%)', border: 'hsl(38, 60%, 28%)', text: 'hsl(42, 90%, 75%)' },
  'in-progress': { bg: 'hsl(38, 70%, 14%)', border: 'hsl(38, 60%, 28%)', text: 'hsl(42, 90%, 75%)' },
  'in-behandeling': { bg: 'hsl(38, 70%, 14%)', border: 'hsl(38, 60%, 28%)', text: 'hsl(42, 90%, 75%)' },
  'bezig': { bg: 'hsl(38, 70%, 14%)', border: 'hsl(38, 60%, 28%)', text: 'hsl(42, 90%, 75%)' },
  'wip': { bg: 'hsl(38, 70%, 14%)', border: 'hsl(38, 60%, 28%)', text: 'hsl(42, 90%, 75%)' },
  'action': { bg: 'hsl(38, 70%, 14%)', border: 'hsl(38, 60%, 28%)', text: 'hsl(42, 90%, 75%)' },

  // Completed / Done (Muted Sage Green)
  'completed': { bg: 'hsl(142, 50%, 14%)', border: 'hsl(142, 40%, 26%)', text: 'hsl(142, 60%, 75%)' },
  'klaar': { bg: 'hsl(142, 50%, 14%)', border: 'hsl(142, 40%, 26%)', text: 'hsl(142, 60%, 75%)' },
  'afgerond': { bg: 'hsl(142, 50%, 14%)', border: 'hsl(142, 40%, 26%)', text: 'hsl(142, 60%, 75%)' },
  'done': { bg: 'hsl(142, 50%, 14%)', border: 'hsl(142, 40%, 26%)', text: 'hsl(142, 60%, 75%)' },
  'finished': { bg: 'hsl(142, 50%, 14%)', border: 'hsl(142, 40%, 26%)', text: 'hsl(142, 60%, 75%)' },

  // Agent / AI (Sky Blue)
  'agent-ready': { bg: 'hsl(199, 60%, 14%)', border: 'hsl(199, 50%, 28%)', text: 'hsl(199, 80%, 75%)' },
  'agent': { bg: 'hsl(199, 60%, 14%)', border: 'hsl(199, 50%, 28%)', text: 'hsl(199, 80%, 75%)' },
  'ai': { bg: 'hsl(199, 60%, 14%)', border: 'hsl(199, 50%, 28%)', text: 'hsl(199, 80%, 75%)' },
  'klaar-voor-agent': { bg: 'hsl(199, 60%, 14%)', border: 'hsl(199, 50%, 28%)', text: 'hsl(199, 80%, 75%)' },
  'mcp': { bg: 'hsl(199, 60%, 14%)', border: 'hsl(199, 50%, 28%)', text: 'hsl(199, 80%, 75%)' },

  // Planning / Focus (Mint / Emerald)
  'planning': { bg: 'hsl(160, 50%, 14%)', border: 'hsl(160, 40%, 26%)', text: 'hsl(160, 65%, 75%)' },
  'daily-log': { bg: 'hsl(160, 50%, 14%)', border: 'hsl(160, 40%, 26%)', text: 'hsl(160, 65%, 75%)' },
  'focus': { bg: 'hsl(160, 50%, 14%)', border: 'hsl(160, 40%, 26%)', text: 'hsl(160, 65%, 75%)' },
  'dagplanning': { bg: 'hsl(160, 50%, 14%)', border: 'hsl(160, 40%, 26%)', text: 'hsl(160, 65%, 75%)' },

  // Concept / Ideas (Soft Lavender)
  'concept': { bg: 'hsl(265, 45%, 16%)', border: 'hsl(265, 35%, 30%)', text: 'hsl(265, 75%, 82%)' },
  'idee': { bg: 'hsl(265, 45%, 16%)', border: 'hsl(265, 35%, 30%)', text: 'hsl(265, 75%, 82%)' },
  'idea': { bg: 'hsl(265, 45%, 16%)', border: 'hsl(265, 35%, 30%)', text: 'hsl(265, 75%, 82%)' },
  'brainstorm': { bg: 'hsl(265, 45%, 16%)', border: 'hsl(265, 35%, 30%)', text: 'hsl(265, 75%, 82%)' },
  'core-concept': { bg: 'hsl(265, 45%, 16%)', border: 'hsl(265, 35%, 30%)', text: 'hsl(265, 75%, 82%)' },

  // Review / Blocked / Bug (Coral / Muted Rose)
  'review': { bg: 'hsl(350, 50%, 15%)', border: 'hsl(350, 45%, 28%)', text: 'hsl(350, 75%, 80%)' },
  'geblokkeerd': { bg: 'hsl(350, 50%, 15%)', border: 'hsl(350, 45%, 28%)', text: 'hsl(350, 75%, 80%)' },
  'blocked': { bg: 'hsl(350, 50%, 15%)', border: 'hsl(350, 45%, 28%)', text: 'hsl(350, 75%, 80%)' },
  'urgent': { bg: 'hsl(350, 50%, 15%)', border: 'hsl(350, 45%, 28%)', text: 'hsl(350, 75%, 80%)' },
  'bug': { bg: 'hsl(350, 50%, 15%)', border: 'hsl(350, 45%, 28%)', text: 'hsl(350, 75%, 80%)' },
  'fix': { bg: 'hsl(350, 50%, 15%)', border: 'hsl(350, 45%, 28%)', text: 'hsl(350, 75%, 80%)' },

  // Archive / Muted (Slate)
  'archive': { bg: 'hsl(215, 25%, 16%)', border: 'hsl(215, 20%, 28%)', text: 'hsl(215, 40%, 78%)' },
  'archief': { bg: 'hsl(215, 25%, 16%)', border: 'hsl(215, 20%, 28%)', text: 'hsl(215, 40%, 78%)' }
};

const DEFAULT_TAG_PALETTE = {
  bg: 'hsl(38, 18%, 15%)',
  border: 'hsl(38, 18%, 24%)',
  text: 'hsl(38, 35%, 84%)'
};

/** Generates a curated, calm color palette for any tag name. */
export function getTagColor(tag: string): { bg: string; text: string; border: string } {
  const normalized = normalizeTag(tag);
  if (SEMANTIC_TAG_PALETTES[normalized]) {
    return SEMANTIC_TAG_PALETTES[normalized];
  }
  return DEFAULT_TAG_PALETTE;
}

function htmlToPlainText(content: string): string {
  if (typeof DOMParser !== 'undefined') {
    try {
      return new DOMParser().parseFromString(content, 'text/html').body.textContent || '';
    } catch {
      // Fall through to the non-browser-safe fallback.
    }
  }
  return content.replace(/<[^>]*>/g, ' ');
}

function isLikelyHexColor(value: string): boolean {
  return [3, 4, 6, 8].includes(value.length) && /^[0-9a-f]+$/i.test(value);
}

/**
 * Extracts deliberate hashtags. A hashtag must start at a text boundary and
 * with a Unicode letter, which avoids URL fragments, C# and numeric issue ids.
 */
export function extractHashtags(contentHtmlOrText: string): string[] {
  if (!contentHtmlOrText) return [];
  const plainText = htmlToPlainText(contentHtmlOrText);
  const pattern = /(?:^|[\s([{>"'“‘])#([\p{L}][\p{L}\p{N}_-]*)(?=[\s.,!?:;)\]}"'”’<]|$)/gu;
  const result = new Set<string>();

  for (const match of plainText.matchAll(pattern)) {
    const candidate = match[1];
    if (isLikelyHexColor(candidate)) continue;
    const parsed = parseTag(candidate);
    if (parsed.tag) result.add(parsed.tag);
  }
  return Array.from(result);
}

/** Merges tag arrays using the same validation as manual input and imports. */
export function mergeTags(existing: readonly string[] = [], additions: readonly string[] = []): string[] {
  return sanitizeTags([...existing, ...additions]);
}
