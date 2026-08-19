export interface DiffChunk {
  type: 'added' | 'removed' | 'unchanged';
  value: string;
}

export interface LineDiff {
  type: 'added' | 'removed' | 'unchanged';
  line: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface TagDiff {
  added: string[];
  removed: string[];
  unchanged: string[];
}

export interface DiffSummary {
  addedLines: number;
  removedLines: number;
  addedWords: number;
  removedWords: number;
  hasChanges: boolean;
  label: string;
}

/**
 * Standard Longest Common Subsequence (LCS) matrix computation for arrays of strings.
 */
function computeLcsMatrix<T>(a: T[], b: T[], equals: (x: T, y: T) => boolean = (x, y) => x === y): number[][] {
  const matrix: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (equals(a[i], b[j])) {
        matrix[i + 1][j + 1] = matrix[i][j] + 1;
      } else {
        matrix[i + 1][j + 1] = Math.max(matrix[i + 1][j], matrix[i][j + 1]);
      }
    }
  }
  return matrix;
}

/**
 * Computes line-by-line diff between two text strings.
 */
export function diffLines(oldText: string, newText: string): LineDiff[] {
  const oldLines = oldText ? oldText.replace(/\r\n/g, '\n').split('\n') : [];
  const newLines = newText ? newText.replace(/\r\n/g, '\n').split('\n') : [];

  const matrix = computeLcsMatrix(oldLines, newLines);
  const result: LineDiff[] = [];

  let i = oldLines.length;
  let j = newLines.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({
        type: 'unchanged',
        line: oldLines[i - 1],
        oldLineNumber: i,
        newLineNumber: j
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || matrix[i][j - 1] >= matrix[i - 1][j])) {
      result.unshift({
        type: 'added',
        line: newLines[j - 1],
        newLineNumber: j
      });
      j--;
    } else if (i > 0 && (j === 0 || matrix[i][j - 1] < matrix[i - 1][j])) {
      result.unshift({
        type: 'removed',
        line: oldLines[i - 1],
        oldLineNumber: i
      });
      i--;
    }
  }

  return result;
}

/**
 * Computes word-by-word diff between two short strings or sentences.
 */
export function diffWords(oldText: string, newText: string): DiffChunk[] {
  const splitWords = (text: string) => text.match(/\s+|\S+/g) || [];
  const oldTokens = splitWords(oldText);
  const newTokens = splitWords(newText);

  const matrix = computeLcsMatrix(oldTokens, newTokens);
  const result: DiffChunk[] = [];

  let i = oldTokens.length;
  let j = newTokens.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldTokens[i - 1] === newTokens[j - 1]) {
      result.unshift({ type: 'unchanged', value: oldTokens[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || matrix[i][j - 1] >= matrix[i - 1][j])) {
      result.unshift({ type: 'added', value: newTokens[j - 1] });
      j--;
    } else if (i > 0 && (j === 0 || matrix[i][j - 1] < matrix[i - 1][j])) {
      result.unshift({ type: 'removed', value: oldTokens[i - 1] });
      i--;
    }
  }

  // Merge consecutive chunks of same type
  const merged: DiffChunk[] = [];
  for (const chunk of result) {
    if (merged.length > 0 && merged[merged.length - 1].type === chunk.type) {
      merged[merged.length - 1].value += chunk.value;
    } else {
      merged.push({ ...chunk });
    }
  }

  return merged;
}

/**
 * Compares two lists of tags and groups them into added, removed, and unchanged.
 */
export function diffTags(oldTags: string[] = [], newTags: string[] = []): TagDiff {
  const oldSet = new Set(oldTags);
  const newSet = new Set(newTags);

  const added = newTags.filter(t => !oldSet.has(t));
  const removed = oldTags.filter(t => !newSet.has(t));
  const unchanged = newTags.filter(t => oldSet.has(t));

  return { added, removed, unchanged };
}

/**
 * Converts HTML content into cleanly formatted readable text lines for diffing.
 */
export function htmlToDiffableText(html: string): string {
  if (!html) return '';

  // Simple clean conversion from TipTap HTML to readable lines
  let text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<\/blockquote>/gi, '\n')
    .replace(/<\/pre>/gi, '\n')
    .replace(/<li[^>]*data-type="taskItem"[^>]*data-checked="true"[^>]*>/gi, '- [x] ')
    .replace(/<li[^>]*data-type="taskItem"[^>]*>/gi, '- [ ] ')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  // Trim extraneous double blank lines
  return text.split('\n').map(l => l.trim()).filter((l, idx, arr) => l.length > 0 || (idx > 0 && arr[idx - 1].length > 0)).join('\n');
}

/**
 * Calculates a summary of changes between two versions of text.
 */
export function computeDiffSummary(oldText: string, newText: string): DiffSummary {
  const lines = diffLines(oldText, newText);
  let addedLines = 0;
  let removedLines = 0;

  for (const item of lines) {
    if (item.type === 'added') addedLines++;
    else if (item.type === 'removed') removedLines++;
  }

  const oldWordCount = (oldText.match(/\S+/g) || []).length;
  const newWordCount = (newText.match(/\S+/g) || []).length;
  const addedWords = Math.max(0, newWordCount - oldWordCount);
  const removedWords = Math.max(0, oldWordCount - newWordCount);

  const hasChanges = addedLines > 0 || removedLines > 0 || oldText !== newText;

  let label = 'No changes';
  if (hasChanges) {
    const parts: string[] = [];
    if (addedLines > 0) parts.push(`+${addedLines} line${addedLines === 1 ? '' : 's'}`);
    if (removedLines > 0) parts.push(`-${removedLines} line${removedLines === 1 ? '' : 's'}`);
    if (parts.length === 0) parts.push('Minor inline change');
    label = parts.join(', ');
  }

  return {
    addedLines,
    removedLines,
    addedWords,
    removedWords,
    hasChanges,
    label
  };
}
