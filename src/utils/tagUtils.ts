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
  if (!tag) return { tag: null, error: 'Vul een tag in.' };
  if (tag.length > TAG_MAX_LENGTH) {
    return { tag: null, error: `Een tag mag maximaal ${TAG_MAX_LENGTH} tekens bevatten.` };
  }
  if (!/^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u.test(tag)) {
    return { tag: null, error: 'Gebruik alleen letters, cijfers, koppeltekens en underscores.' };
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

/** Generates a consistent pastel color palette for any tag name. */
export function getTagColor(tag: string): { bg: string; text: string; border: string } {
  const normalized = normalizeTag(tag);
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = normalized.charCodeAt(i) + ((hash << 5) - hash);
  }

  const hue = Math.abs(hash) % 360;
  return {
    bg: `hsl(${hue}, 75%, 92%)`,
    border: `hsl(${hue}, 60%, 80%)`,
    text: `hsl(${hue}, 70%, 25%)`
  };
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
  const pattern = /(^|[\s([{>"'“‘])#([\p{L}][\p{L}\p{N}_-]*)/gu;
  const result = new Set<string>();

  for (const match of plainText.matchAll(pattern)) {
    const candidate = match[2];
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
