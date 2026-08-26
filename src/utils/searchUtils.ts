import { parseTag } from './tagUtils';

export interface ParsedSearchQuery {
  text: string;
  tags: string[];
}

/** Splits free text from exact #tag filters. Multiple tags use AND semantics. */
export function parseSearchQuery(query: string): ParsedSearchQuery {
  const textParts: string[] = [];
  const tags = new Set<string>();

  for (const part of query.normalize('NFC').trim().split(/\s+/)) {
    if (!part) continue;
    if (part.startsWith('#')) {
      const tag = parseTag(part).tag;
      if (tag) {
        tags.add(tag);
        continue;
      }
    }
    textParts.push(part.toLowerCase());
  }

  return { text: textParts.join(' '), tags: Array.from(tags) };
}

export interface TagCount {
  tag: string;
  count: number;
}

/**
 * Returns the top tags sorted by count descending, then alphabetically.
 * Preserves any active tags not in the top limit so the user can toggle/remove them.
 */
export function rankTopTags(tagCounts: TagCount[], activeTags: string[] = [], limit: number = 10): string[] {
  const sorted = [...tagCounts].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  const top = sorted.slice(0, limit).map(tc => tc.tag);
  const topSet = new Set(top);
  const extraActive = activeTags.filter(t => !topSet.has(t));
  return [...top, ...extraActive];
}

