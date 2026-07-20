import { useEffect } from 'react';

interface KeyboardShortcutsHandlers {
  onNavigateUp: () => void;
  onNavigateDown: () => void;
  onNavigateRight: () => void;
  onNavigateLeft: () => void;
  onOpenSearch: () => void;
  onNewBlock: () => void;
  onDuplicate: () => void;
  onTrash: () => void;
  onToggleWritingPanel: () => void;
  onOpenHelp: () => void;
}

export function useKeyboardShortcuts({
  onNavigateUp,
  onNavigateDown,
  onNavigateRight,
  onNavigateLeft,
  onOpenSearch,
  onNewBlock,
  onDuplicate,
  onTrash,
  onToggleWritingPanel,
  onOpenHelp
}: KeyboardShortcutsHandlers) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing inside an input, textarea or contenteditable element (TipTap editor)
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      // Global shortcuts (work anywhere or when not editing text)
      if (isCtrlOrCmd && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenSearch();
        return;
      }

      if (isCtrlOrCmd && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        onToggleWritingPanel();
        return;
      }

      if (e.shiftKey && e.key === '?') {
        if (!isInput) {
          e.preventDefault();
          onOpenHelp();
          return;
        }
      }

      if (isInput) return; // Prevent navigation hotkeys while typing in editor or search input

      // Miller Navigation Hotkeys
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        onNavigateUp();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        onNavigateDown();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        onNavigateRight();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onNavigateLeft();
      } else if (isCtrlOrCmd && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        onNewBlock();
      } else if (isCtrlOrCmd && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        onDuplicate();
      } else if (isCtrlOrCmd && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        onTrash();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    onNavigateUp,
    onNavigateDown,
    onNavigateRight,
    onNavigateLeft,
    onOpenSearch,
    onNewBlock,
    onDuplicate,
    onTrash,
    onToggleWritingPanel,
    onOpenHelp
  ]);
}
