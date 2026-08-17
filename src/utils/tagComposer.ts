export interface TagComposerState {
  isOpen: boolean;
  value: string;
  error: string | null;
}

export type TagComposerAction =
  | { type: 'open' }
  | { type: 'change'; value: string }
  | { type: 'invalid'; error: string }
  | { type: 'clear-error' }
  | { type: 'close' };

export const initialTagComposerState: TagComposerState = {
  isOpen: false,
  value: '',
  error: null,
};

export function tagComposerReducer(state: TagComposerState, action: TagComposerAction): TagComposerState {
  switch (action.type) {
    case 'open':
      return { isOpen: true, value: '', error: null };
    case 'change':
      return { ...state, value: action.value, error: null };
    case 'invalid':
      return { ...state, isOpen: true, error: action.error };
    case 'clear-error':
      return { ...state, error: null };
    case 'close':
      return initialTagComposerState;
  }
}
