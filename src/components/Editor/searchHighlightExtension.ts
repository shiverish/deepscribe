import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

export interface SearchMatch {
  from: number;
  to: number;
}

export interface SearchHighlightQuery {
  searchTerm: string;
  caseSensitive: boolean;
  activeMatchIndex: number;
}

export interface SearchHighlightState extends SearchHighlightQuery {
  matches: SearchMatch[];
  decorations: DecorationSet;
}

const EMPTY_QUERY: SearchHighlightQuery = {
  searchTerm: '',
  caseSensitive: false,
  activeMatchIndex: 0
};

export const searchHighlightPluginKey = new PluginKey<SearchHighlightState>('searchHighlightPlugin');

export function findMatchesInDoc(
  doc: ProseMirrorNode,
  searchTerm: string,
  caseSensitive: boolean
): SearchMatch[] {
  if (!searchTerm || searchTerm.length === 0) return [];
  const results: SearchMatch[] = [];
  const query = caseSensitive ? searchTerm : searchTerm.toLowerCase();

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const text = caseSensitive ? node.text : node.text.toLowerCase();
    let index = text.indexOf(query);
    while (index !== -1) {
      const from = pos + index;
      const to = from + query.length;
      results.push({ from, to });
      index = text.indexOf(query, index + query.length);
    }
  });

  return results;
}

function buildSearchState(doc: ProseMirrorNode, query: SearchHighlightQuery): SearchHighlightState {
  const matches = findMatchesInDoc(doc, query.searchTerm, query.caseSensitive);
  const activeMatchIndex = matches.length > 0
    ? Math.min(Math.max(query.activeMatchIndex, 0), matches.length - 1)
    : 0;

  const decorations = DecorationSet.create(
    doc,
    matches.map((match, idx) =>
      Decoration.inline(match.from, match.to, {
        class: idx === activeMatchIndex ? 'find-match find-match-active' : 'find-match'
      })
    )
  );

  return { ...query, activeMatchIndex, matches, decorations };
}

/** Marks a transaction with a new search query so the plugin recomputes matches and decorations. */
export function setSearchHighlightQuery(tr: Transaction, query: SearchHighlightQuery): Transaction {
  return tr.setMeta(searchHighlightPluginKey, query);
}

/** Reads the current matches, active index and query straight from the plugin state. */
export function getSearchHighlightState(state: EditorState): SearchHighlightState | undefined {
  return searchHighlightPluginKey.getState(state);
}

function getScrollParent(element: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = element.parentElement;
  while (node) {
    const overflowY = window.getComputedStyle(node).overflowY;
    if (/(auto|scroll|overlay)/.test(overflowY) && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * Scrolt de scrollcontainer van de editor naar een match.
 * ProseMirror's eigen tr.scrollIntoView() vertrekt vanaf de DOM-selectie, en die zit
 * tijdens het zoeken in het invoerveld van de find-bar — dus buiten de editor. Daardoor
 * loopt PM langs de verkeerde ouders omhoog en scrolt er niets. Daarom doen we het zelf.
 */
export function scrollMatchIntoView(view: EditorView, match: SearchMatch): void {
  const container = getScrollParent(view.dom as HTMLElement);
  if (!container) return;

  let coords: { top: number; bottom: number };
  try {
    coords = view.coordsAtPos(match.from);
  } catch {
    return;
  }

  const box = container.getBoundingClientRect();
  const margin = 48;
  if (coords.top >= box.top + margin && coords.bottom <= box.bottom - margin) return;

  container.scrollTop += coords.top - box.top - container.clientHeight / 2;
}

export const SearchHighlightExtension = Extension.create({
  name: 'searchHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin<SearchHighlightState>({
        key: searchHighlightPluginKey,
        state: {
          init: (_config, state) => buildSearchState(state.doc, EMPTY_QUERY),
          apply: (tr, previous, _oldState, newState) => {
            const query = tr.getMeta(searchHighlightPluginKey) as SearchHighlightQuery | undefined;
            if (query) return buildSearchState(newState.doc, query);
            if (tr.docChanged) return buildSearchState(newState.doc, previous);
            return previous;
          }
        },
        props: {
          decorations(state) {
            return this.getState(state)?.decorations ?? DecorationSet.empty;
          }
        }
      })
    ];
  }
});
