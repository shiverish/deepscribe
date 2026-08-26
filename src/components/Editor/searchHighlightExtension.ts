import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

export interface SearchMatch {
  from: number;
  to: number;
}

export interface SearchHighlightOptions {
  searchTerm: string;
  caseSensitive: boolean;
  activeMatchIndex: number;
}

export interface SearchHighlightStorage {
  results: SearchMatch[];
}

export const searchHighlightPluginKey = new PluginKey<DecorationSet>('searchHighlightPlugin');

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

export const SearchHighlightExtension = Extension.create<SearchHighlightOptions, SearchHighlightStorage>({
  name: 'searchHighlight',

  addOptions() {
    return {
      searchTerm: '',
      caseSensitive: false,
      activeMatchIndex: 0,
    };
  },

  addStorage() {
    return {
      results: [],
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: searchHighlightPluginKey,
        state: {
          init: (_config, state) => {
            const { searchTerm, caseSensitive, activeMatchIndex } = this.options;
            const matches = findMatchesInDoc(state.doc, searchTerm, caseSensitive);
            this.storage.results = matches;

            const decorations = matches.map((match, idx) =>
              Decoration.inline(match.from, match.to, {
                class: idx === activeMatchIndex ? 'find-match find-match-active' : 'find-match',
              })
            );
            return DecorationSet.create(state.doc, decorations);
          },
          apply: (tr, oldSet, _oldState, newState) => {
            const isDocChanged = tr.docChanged;
            const isMetaChanged = tr.getMeta(searchHighlightPluginKey);

            if (!isDocChanged && !isMetaChanged) {
              return oldSet.map(tr.mapping, tr.doc);
            }

            const { searchTerm, caseSensitive, activeMatchIndex } = this.options;
            const matches = findMatchesInDoc(newState.doc, searchTerm, caseSensitive);
            this.storage.results = matches;

            const decorations = matches.map((match, idx) =>
              Decoration.inline(match.from, match.to, {
                class: idx === activeMatchIndex ? 'find-match find-match-active' : 'find-match',
              })
            );
            return DecorationSet.create(newState.doc, decorations);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});
