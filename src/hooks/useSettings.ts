import { useState, useEffect, useCallback } from 'react';
import { db } from '../db/db';
import { type UserSettings, DEFAULT_USER_SETTINGS } from '../types';

const STORAGE_KEY = 'deepscribe_settings';

export const PRESET_PALETTES = {
  vanilla: {
    bg: '#141312',
    surface: 'rgba(26, 24, 22, 0.88)',
    card: 'rgba(32, 29, 26, 0.75)',
    text: '#FAF6EE',
    accent: '#3b82f6',
    atmosphere: '#EBDEC3',
    mode: 'dark' as const
  },
  cyberpunk: {
    bg: '#0d0914',
    surface: 'rgba(21, 14, 32, 0.9)',
    card: 'rgba(30, 20, 48, 0.8)',
    text: '#e2d9f3',
    accent: '#00f0ff',
    atmosphere: '#00f0ff',
    mode: 'dark' as const
  },
  nord: {
    bg: '#2e3440',
    surface: 'rgba(43, 49, 62, 0.9)',
    card: 'rgba(59, 66, 82, 0.85)',
    text: '#eceff4',
    accent: '#88c0d0',
    atmosphere: '#88c0d0',
    mode: 'dark' as const
  },
  dracula: {
    bg: '#282a36',
    surface: 'rgba(33, 34, 44, 0.92)',
    card: 'rgba(44, 47, 63, 0.85)',
    text: '#f8f8f2',
    accent: '#bd93f9',
    atmosphere: '#bd93f9',
    mode: 'dark' as const
  },
  sepia: {
    bg: '#fbf0d9',
    surface: 'rgba(244, 230, 204, 0.95)',
    card: 'rgba(238, 221, 190, 0.9)',
    text: '#433422',
    accent: '#b45309',
    atmosphere: '#b45309',
    mode: 'light' as const
  },
  obsidian: {
    bg: '#000000',
    surface: 'rgba(18, 18, 18, 0.95)',
    card: 'rgba(28, 28, 28, 0.9)',
    text: '#e0e0e0',
    accent: '#6366f1',
    atmosphere: '#6366f1',
    mode: 'dark' as const
  }
};

function hexToRgbChannels(hex: string): string {
  const normalized = hex.replace('#', '');
  const expanded = normalized.length === 3
    ? normalized.split('').map(character => character + character).join('')
    : normalized;
  const value = Number.parseInt(expanded, 16);

  if (expanded.length !== 6 || Number.isNaN(value)) return '235, 222, 195';

  return `${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}`;
}

function mergeStoredSettings(value: Partial<UserSettings>): UserSettings {
  const preset = value.preset || DEFAULT_USER_SETTINGS.preset;
  const palette = preset === 'custom' ? undefined : PRESET_PALETTES[preset];

  return {
    ...DEFAULT_USER_SETTINGS,
    ...value,
    atmosphereColor: value.atmosphereColor || palette?.atmosphere || DEFAULT_USER_SETTINGS.atmosphereColor
  };
}

export function applySettingsToDOM(settings: UserSettings) {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const atmosphereColor = settings.atmosphereColor || '#EBDEC3';
  root.style.setProperty('--atmosphere-color', atmosphereColor);
  root.style.setProperty('--atmosphere-rgb', hexToRgbChannels(atmosphereColor));

  // Preset or Custom Theme Colors
  if (settings.preset !== 'custom' && PRESET_PALETTES[settings.preset]) {
    const palette = PRESET_PALETTES[settings.preset];
    root.style.setProperty('--bg-dark', palette.bg);
    root.style.setProperty('--bg-surface', palette.surface);
    root.style.setProperty('--bg-card', palette.card);
    root.style.setProperty('--text-primary', palette.text);
    root.style.setProperty('--accent-color', settings.accentColor || palette.accent);
    root.setAttribute('data-theme', palette.mode);
  } else if (settings.preset === 'custom') {
    if (settings.customBgColor) root.style.setProperty('--bg-dark', settings.customBgColor);
    if (settings.customTextColor) root.style.setProperty('--text-primary', settings.customTextColor);
    root.style.setProperty('--accent-color', settings.accentColor);
    let effectiveTheme = settings.theme;
    if (settings.theme === 'system') {
      effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    root.setAttribute('data-theme', effectiveTheme);
  }

  // Glassmorphism Toggle
  if (!settings.enableGlassmorphism) {
    root.style.setProperty('--glass-backdrop', 'none');
    root.classList.add('no-glass');
  } else {
    root.style.setProperty('--glass-backdrop', 'blur(16px) saturate(130%)');
    root.classList.remove('no-glass');
  }

  // Glow Toggle
  if (!settings.enableGlow) {
    root.classList.add('no-glow');
  } else {
    root.classList.remove('no-glow');
  }

  // Font Size & Line Height
  root.style.setProperty('--editor-font-size', `${settings.fontSize}px`);
  root.style.setProperty('--editor-line-height', `${settings.lineHeight}`);

  // Font Family
  let fontFamilyCss = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  if (settings.fontFamily === 'serif') {
    fontFamilyCss = 'Georgia, Cambria, "Times New Roman", Times, serif';
  } else if (settings.fontFamily === 'mono') {
    fontFamilyCss = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
  }
  root.style.setProperty('--editor-font-family', fontFamilyCss);

  // Content Width
  let maxWidthCss = '800px';
  if (settings.contentWidth === 'narrow') {
    maxWidthCss = '680px';
  } else if (settings.contentWidth === 'full') {
    maxWidthCss = '100%';
  }
  root.style.setProperty('--editor-max-width', maxWidthCss);

  // Miller Column Width
  root.style.setProperty('--column-width', `${settings.columnWidth}px`);
}

export function useSettings() {
  const [settings, setSettings] = useState<UserSettings>(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        return mergeStoredSettings(JSON.parse(cached));
      }
    } catch {
      // Fall back to default
    }
    return DEFAULT_USER_SETTINGS;
  });

  // Load from Dexie DB on mount
  useEffect(() => {
    let isMounted = true;
    db.settings.get('user_settings').then(record => {
      if (isMounted && record && record.value) {
        const merged = mergeStoredSettings(record.value);
        setSettings(merged);
        applySettingsToDOM(merged);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      }
    }).catch(() => {
      // Ignore fallback
    });

    return () => {
      isMounted = false;
    };
  }, []);

  // Apply to DOM on state change
  useEffect(() => {
    applySettingsToDOM(settings);
  }, [settings]);

  const updateSettings = useCallback(async (partial: Partial<UserSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...partial };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      db.settings.put({ key: 'user_settings', value: updated }).catch(() => {});
      return updated;
    });
  }, []);

  const resetSettings = useCallback(async () => {
    setSettings(DEFAULT_USER_SETTINGS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_USER_SETTINGS));
    await db.settings.put({ key: 'user_settings', value: DEFAULT_USER_SETTINGS }).catch(() => {});
  }, []);

  return {
    settings,
    updateSettings,
    resetSettings
  };
}
