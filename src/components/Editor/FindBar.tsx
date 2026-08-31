import React, { useEffect, useRef } from 'react';
import { Search, ChevronUp, ChevronDown, X } from 'lucide-react';
import { ClearSearchButton } from '../Search/ClearSearchButton';

interface FindBarProps {
  isOpen: boolean;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  caseSensitive: boolean;
  onToggleCaseSensitive: () => void;
  matchCount: number;
  activeMatchIndex: number;
  onFindNext: () => void;
  onFindPrev: () => void;
  onClose: () => void;
}

export const FindBar: React.FC<FindBarProps> = ({
  isOpen,
  searchTerm,
  onSearchChange,
  caseSensitive,
  onToggleCaseSensitive,
  matchCount,
  activeMatchIndex,
  onFindNext,
  onFindPrev,
  onClose
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 30);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const clearSearch = () => {
    onSearchChange('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        onFindPrev();
      } else {
        onFindNext();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (searchTerm) {
        clearSearch();
      } else {
        onClose();
      }
    } else if (e.altKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      onToggleCaseSensitive();
    }
  };

  const countDisplay = searchTerm
    ? matchCount > 0
      ? `${activeMatchIndex + 1} of ${matchCount}`
      : 'No matches'
    : '';

  return (
    <div className="find-bar" role="search" aria-label="Find in document">
      <Search size={14} className="find-bar-icon" />
      <input
        ref={inputRef}
        type="text"
        className="find-bar-input"
        placeholder="Find in document..."
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="Search text"
      />
      {searchTerm && (
        <span className={`find-bar-count ${matchCount === 0 ? 'no-matches' : ''}`}>
          {countDisplay}
        </span>
      )}
      <ClearSearchButton
        visible={searchTerm.length > 0}
        onClear={clearSearch}
        className="find-bar-btn"
        size={14}
      />
      <button
        type="button"
        className={`find-bar-btn case-toggle ${caseSensitive ? 'active' : ''}`}
        onClick={onToggleCaseSensitive}
        title={caseSensitive ? 'Match case (Alt+C) - Active' : 'Match case (Alt+C)'}
        aria-label="Toggle match case"
        aria-pressed={caseSensitive}
      >
        Aa
      </button>
      <button
        type="button"
        className="find-bar-btn"
        onClick={onFindPrev}
        disabled={matchCount === 0}
        title="Previous match (Shift+Enter)"
        aria-label="Previous match"
      >
        <ChevronUp size={14} />
      </button>
      <button
        type="button"
        className="find-bar-btn"
        onClick={onFindNext}
        disabled={matchCount === 0}
        title="Next match (Enter)"
        aria-label="Next match"
      >
        <ChevronDown size={14} />
      </button>
      <button
        type="button"
        className="find-bar-btn find-bar-close"
        onClick={onClose}
        title="Close (Escape)"
        aria-label="Close find bar"
      >
        <X size={14} />
      </button>
    </div>
  );
};
