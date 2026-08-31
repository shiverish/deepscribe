import React from 'react';
import { X } from 'lucide-react';

interface ClearSearchButtonProps {
  /** Rendered only when there is something to clear. */
  visible: boolean;
  onClear: () => void;
  className?: string;
  size?: number;
  style?: React.CSSProperties;
}

/**
 * Shared clear control for the search inputs. Every search surface hides it
 * while its field is empty, so the button only ever appears when pressing it
 * does something.
 */
export const ClearSearchButton: React.FC<ClearSearchButtonProps> = ({
  visible,
  onClear,
  className,
  size = 13,
  style
}) => {
  if (!visible) return null;

  return (
    <button
      type="button"
      className={className}
      onClick={onClear}
      title="Clear (Escape)"
      aria-label="Clear search"
      style={style}
    >
      <X size={size} />
    </button>
  );
};
