export interface ProjectColorOption {
  name: string;
  hex: string;
}

export const PROJECT_COLOR_PALETTE: ProjectColorOption[] = [
  { name: 'Amber', hex: '#F59E0B' },
  { name: 'Emerald', hex: '#10B981' },
  { name: 'Sky', hex: '#0284C7' },
  { name: 'Indigo', hex: '#6366F1' },
  { name: 'Purple', hex: '#8B5CF6' },
  { name: 'Pink', hex: '#EC4899' },
  { name: 'Rose', hex: '#F43F5E' },
  { name: 'Teal', hex: '#14B8A6' },
  { name: 'Orange', hex: '#F97316' },
  { name: 'Slate', hex: '#64748B' },
];

export const DEFAULT_PROJECT_COLOR = '#F59E0B';
export const INBOX_PROJECT_COLOR = '#64748B';

export function getProjectColor(color?: string | null): string {
  if (!color || !color.trim()) return DEFAULT_PROJECT_COLOR;
  return color.trim();
}
