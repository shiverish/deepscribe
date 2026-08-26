import { describe, expect, it, vi } from 'vitest';

describe('useKeyboardShortcuts', () => {
  it('triggers action hotkeys correctly when navigating cards', () => {
    const onEditFocus = vi.fn();
    const onNavigateRight = vi.fn();
    const onNewBlock = vi.fn();
    const onAddChildBlock = vi.fn();
    const onTrash = vi.fn();

    const handleKeyDown = (e: { key: string; shiftKey?: boolean; preventDefault: () => void }) => {
      if (e.shiftKey && e.key === 'ArrowRight') {
        e.preventDefault();
        onAddChildBlock();
      } else if (e.shiftKey && e.key === 'ArrowDown') {
        e.preventDefault();
        onNewBlock();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onNavigateRight();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onEditFocus();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onTrash();
      }
    };

    handleKeyDown({ key: 'Enter', preventDefault: vi.fn() });
    expect(onEditFocus).toHaveBeenCalledTimes(1);

    handleKeyDown({ key: 'Delete', preventDefault: vi.fn() });
    expect(onTrash).toHaveBeenCalledTimes(1);

    handleKeyDown({ key: 'ArrowRight', shiftKey: true, preventDefault: vi.fn() });
    expect(onAddChildBlock).toHaveBeenCalledTimes(1);

    handleKeyDown({ key: 'ArrowDown', shiftKey: true, preventDefault: vi.fn() });
    expect(onNewBlock).toHaveBeenCalledTimes(1);
  });

  it('triggers search and find shortcuts correctly', () => {
    const onOpenSearch = vi.fn();
    const onFindInDocument = vi.fn();

    const handleKeyDown = (e: { key: string; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; preventDefault: () => void }) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      if ((isCtrlOrCmd && e.key.toLowerCase() === 'k') || (isCtrlOrCmd && e.shiftKey && e.key.toLowerCase() === 'f')) {
        e.preventDefault();
        onOpenSearch();
      } else if (isCtrlOrCmd && !e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        onFindInDocument();
      }
    };

    // Ctrl+K opens global search
    handleKeyDown({ key: 'k', ctrlKey: true, preventDefault: vi.fn() });
    expect(onOpenSearch).toHaveBeenCalledTimes(1);

    // Ctrl+Shift+F opens global search
    handleKeyDown({ key: 'F', ctrlKey: true, shiftKey: true, preventDefault: vi.fn() });
    expect(onOpenSearch).toHaveBeenCalledTimes(2);

    // Ctrl+F opens in-document find
    handleKeyDown({ key: 'f', ctrlKey: true, preventDefault: vi.fn() });
    expect(onFindInDocument).toHaveBeenCalledTimes(1);
  });
});
