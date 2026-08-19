import React from 'react';
import { Tag as TagIcon, X } from 'lucide-react';
import { getTagColor, normalizeTag } from '../../utils/tagUtils';

interface TagBadgeProps {
  tag: string;
  onRemove?: (tag: string) => void;
  onClick?: (tag: string) => void;
  size?: 'sm' | 'md';
  active?: boolean;
  showIcon?: boolean;
}

export const TagBadge: React.FC<TagBadgeProps> = ({
  tag,
  onRemove,
  onClick,
  size = 'md',
  active = false,
  showIcon = false,
}) => {
  const normalized = normalizeTag(tag);
  const color = getTagColor(normalized);

  const isSmall = size === 'sm';

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRemove) {
      onRemove(normalized);
    }
  };

  const badgeStyle: React.CSSProperties = {
    backgroundColor: active ? color.border : color.bg,
    color: active ? '#ffffff' : color.text,
    border: `1px solid ${active ? color.text : color.border}`,
    borderRadius: '6px',
    padding: isSmall ? '1px 6px' : '2px 8px',
    fontSize: isSmall ? '0.70rem' : '0.76rem',
    fontWeight: 500,
    letterSpacing: '0.01em',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    cursor: onClick ? 'pointer' : 'default',
    userSelect: 'none',
    transition: 'all 0.15s ease',
    whiteSpace: 'nowrap',
    lineHeight: '1.3',
    fontFamily: 'inherit',
  };

  const label = (
    <>
      {showIcon && <TagIcon size={isSmall ? 9 : 11} style={{ opacity: 0.6 }} aria-hidden="true" />}
      <span>{normalized}</span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={`tag-badge ${active ? 'active' : ''}`}
        style={badgeStyle}
        onClick={(event) => {
          event.stopPropagation();
          onClick(normalized);
        }}
        aria-pressed={active}
        aria-label={`Filter op tag ${normalized}`}
        title={`Filter op tag ${normalized}`}
      >
        {label}
      </button>
    );
  }

  return (
    <span
      className={`tag-badge ${active ? 'active' : ''}`}
      style={badgeStyle}
      title={`Tag: ${normalized}`}
    >
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={handleRemove}
          style={{
            background: 'none',
            border: 'none',
            color: 'inherit',
            padding: 0,
            margin: 0,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            opacity: 0.6,
            borderRadius: '50%',
          }}
          title={`Remove tag ${normalized}`}
          aria-label={`Remove tag ${normalized}`}
        >
          <X size={isSmall ? 10 : 12} />
        </button>
      )}
    </span>
  );
};
