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
