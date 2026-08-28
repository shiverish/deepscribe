import type { Block } from '../types';
import { parseTaskHumanId } from './taskBlocks';

const STOP_WORDS = new Set(['de', 'het', 'een', 'en', 'of', 'van', 'voor', 'met', 'in', 'op', 'aan', 'is', 'zijn', 'te', 'dit', 'dat']);
const CONCEPT_GROUPS = [
  ['todo', 'taak', 'taken', 'actie', 'werk'],
  ['idee', 'concept', 'gedachte', 'voorstel'],
  ['agent', 'agents', 'ai', 'assistent', 'automatisering'],
  ['bestand', 'bestanden', 'document', 'bijlage', 'file'],
  ['zoeken', 'zoekfunctie', 'vinden', 'search'],
  ['app', 'applicatie', 'software', 'programma'],
  ['fout', 'bug', 'probleem', 'issue'],
  ['ontwerp', 'design', 'ui', 'interface']
];

function normalizeToken(token: string): string {
  return token.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase().replace(/[^\p{L}\p{N}_-]/gu, '');
}

function tokens(text: string): string[] {
  return text.split(/\s+/).map(normalizeToken).filter(token => token.length > 1 && !STOP_WORDS.has(token));
}

function expandQuery(queryTokens: string[]): Set<string> {
  const expanded = new Set(queryTokens);
  for (const token of queryTokens) {
    const group = CONCEPT_GROUPS.find(values => values.includes(token));
    group?.forEach(value => expanded.add(value));
  }
  return expanded;
}

function trigrams(value: string): Set<string> {
  const padded = `  ${value} `;
  const result = new Set<string>();
  for (let index = 0; index <= padded.length - 3; index += 1) result.add(padded.slice(index, index + 3));
  return result;
}

function trigramSimilarity(left: string, right: string): number {
  const a = trigrams(left);
  const b = trigrams(right);
  let overlap = 0;
  for (const value of a) if (b.has(value)) overlap += 1;
  return a.size + b.size ? (2 * overlap) / (a.size + b.size) : 0;
}

function extractQueryTaskNumbers(query: string): number[] {
  const numbers = new Set<number>();
  for (const part of query.trim().split(/\s+/)) {
    if (!part) continue;
    const fromId = parseTaskHumanId(part);
    if (fromId !== null) {
      numbers.add(fromId);
    } else if (/^\d+$/.test(part)) {
      const num = parseInt(part, 10);
      if (Number.isFinite(num) && num > 0) {
        numbers.add(num);
      }
    }
  }
  return Array.from(numbers);
}

export function rankBlocksLocally(blocks: Block[], query: string): Array<{ block: Block; score: number }> {
  const queryTokens = tokens(query);
  const queryTaskNumbers = extractQueryTaskNumbers(query);
  if (queryTokens.length === 0 && queryTaskNumbers.length === 0) return [];
  const expanded = expandQuery(queryTokens);
  const normalizedQuery = queryTokens.join(' ');
  const singleTaskMatch = queryTaskNumbers.length === 1 && (
    parseTaskHumanId(query.trim()) !== null || /^\d+$/.test(query.trim())
  );

  return blocks.map(block => {
    const titleTokens = tokens(block.title);
    const bodyTokens = tokens(block.plainText);
    const tagTokens = block.tags.flatMap(tokens);
    const taskNumber = block.kind === 'task' && typeof block.task?.taskNumber === 'number' ? block.task.taskNumber : null;
    const taskTokens = taskNumber ? [`tsk-${taskNumber}`, `${taskNumber}`] : [];

    let score = 0;
    if (taskNumber !== null && queryTaskNumbers.includes(taskNumber)) {
      score += singleTaskMatch ? 100 : 50;
    }

    for (const token of expanded) {
      if (titleTokens.includes(token)) score += queryTokens.includes(token) ? 8 : 3;
      if (tagTokens.includes(token)) score += queryTokens.includes(token) ? 6 : 2;
      if (taskTokens.includes(token)) score += queryTokens.includes(token) ? 8 : 3;
      const bodyHits = bodyTokens.filter(value => value === token).length;
      score += Math.min(bodyHits, 4) * (queryTokens.includes(token) ? 2 : 1);
    }
    score += trigramSimilarity(normalizedQuery, normalizeToken(block.title)) * 4;
    return { block, score };
  }).filter(result => result.score >= 1).sort((a, b) => b.score - a.score || b.block.updatedAt - a.block.updatedAt);
}
