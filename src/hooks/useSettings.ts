import { useState, useEffect, useCallback } from 'react';
import { db } from '../db/db';
import { type UserSettings, DEFAULT_USER_SETTINGS } from '../types';
import { repository } from '../db/repository';
import { normalizeWebhookEndpoints } from '../utils/webhooks';

const STORAGE_KEY = 'deepscribe_settings';

export const PRESET_PALETTES = {
  vanilla: {
    bg: '#141312',
    surface: '#1a1816',
    card: '#201d1a',
    headerBg: '#12100e',
    columnHeaderBg: '#161412',
    text: '#FAF6EE',
    accent: '#3b82f6',
    atmosphere: '#EBDEC3',
    selected: '#322C25',
    agentAlert: '#38BDF8',
    mode: 'dark' as const
  },
  cyberpunk: {
    bg: '#0d0914',
    surface: '#150e20',
    card: '#1e1430',
    headerBg: '#100b1a',
    columnHeaderBg: '#181024',
    text: '#e2d9f3',
    accent: '#00f0ff',
    atmosphere: '#00f0ff',
    selected: '#241735',
    agentAlert: '#ff0055',
    mode: 'dark' as const
  },
  nord: {
    bg: '#2e3440',
    surface: '#2b313e',
    card: '#3b4252',
    headerBg: '#252a34',
    columnHeaderBg: '#343d4d',
    text: '#eceff4',
    accent: '#88c0d0',
    atmosphere: '#88c0d0',
    selected: '#465064',
    agentAlert: '#ebcb8b',
    mode: 'dark' as const
  },
  dracula: {
    bg: '#282a36',
    surface: '#21222c',
    card: '#2c2f3f',
    headerBg: '#1d1e26',
    columnHeaderBg: '#2a2c3a',
    text: '#f8f8f2',
    accent: '#bd93f9',
    atmosphere: '#bd93f9',
    selected: '#3A3D51',
    agentAlert: '#ff79c6',
    mode: 'dark' as const
  },
  sepia: {
    bg: '#fbf0d9',
    surface: '#f4e6cc',
    card: '#eeddbe',
    headerBg: '#ebd9bc',
    columnHeaderBg: '#e8d3b0',
    text: '#433422',
    accent: '#b45309',
    atmosphere: '#b45309',
    selected: '#E4CFAA',
    agentAlert: '#c2410c',
    mode: 'light' as const
  },
  obsidian: {
    bg: '#000000',
    surface: '#121212',
    card: '#1c1c1c',
    headerBg: '#0a0a0a',
    columnHeaderBg: '#141414',
    text: '#e0e0e0',
    accent: '#6366f1',
    atmosphere: '#6366f1',
    selected: '#242424',
    agentAlert: '#ec4899',
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

export function mergeStoredSettings(value: Partial<UserSettings>): UserSettings {
  const preset = value.preset || DEFAULT_USER_SETTINGS.preset;
  const palette = preset === 'custom' ? undefined : PRESET_PALETTES[preset];

  return {
    ...DEFAULT_USER_SETTINGS,
    ...value,
    minimizeToTray: typeof value.minimizeToTray === 'boolean' ? value.minimizeToTray : DEFAULT_USER_SETTINGS.minimizeToTray,
    savedThemes: Array.isArray(value.savedThemes) ? value.savedThemes : [],
    webhooks: normalizeWebhookEndpoints(value.webhooks),
    atmosphereColor: value.atmosphereColor || palette?.atmosphere || DEFAULT_USER_SETTINGS.atmosphereColor,
    selectedCardColor: value.selectedCardColor || palette?.selected || value.customBgColor || DEFAULT_USER_SETTINGS.selectedCardColor,
    agentAlertColor: value.agentAlertColor || palette?.agentAlert || DEFAULT_USER_SETTINGS.agentAlertColor,
    customSurfaceBgColor: value.customSurfaceBgColor || palette?.surface || DEFAULT_USER_SETTINGS.customSurfaceBgColor,
    customHeaderBgColor: value.customHeaderBgColor || palette?.headerBg || DEFAULT_USER_SETTINGS.customHeaderBgColor,
    customColumnHeaderBgColor: value.customColumnHeaderBgColor || palette?.columnHeaderBg || DEFAULT_USER_SETTINGS.customColumnHeaderBgColor,
    customCardBgColor: value.customCardBgColor || palette?.card || DEFAULT_USER_SETTINGS.customCardBgColor
  };
}

export function applySettingsToDOM(settings: UserSettings) {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const atmosphereColor = settings.atmosphereColor || '#EBDEC3';
  root.style.setProperty('--atmosphere-color', atmosphereColor);
  root.style.setProperty('--atmosphere-rgb', hexToRgbChannels(atmosphereColor));
  root.style.setProperty('--selected-card-color', settings.selectedCardColor);
  root.style.setProperty('--selected-card-rgb', hexToRgbChannels(settings.selectedCardColor));
  root.style.setProperty('--agent-alert-color', settings.agentAlertColor);
  root.style.setProperty('--agent-alert-rgb', hexToRgbChannels(settings.agentAlertColor));
  root.style.setProperty('--bg-card-active', `rgba(${hexToRgbChannels(settings.selectedCardColor)}, 0.92)`);

  // Preset or Custom Theme Colors
  if (settings.preset !== 'custom' && PRESET_PALETTES[settings.preset]) {
    const palette = PRESET_PALETTES[settings.preset];
    root.style.setProperty('--bg-dark', palette.bg);
    root.style.setProperty('--bg-surface', palette.surface);
    root.style.setProperty('--bg-card', palette.card);
    root.style.setProperty('--header-bg', palette.headerBg);
    root.style.setProperty('--modal-header-bg', palette.headerBg);
    root.style.setProperty('--column-header-bg', palette.columnHeaderBg);
    root.style.setProperty('--text-primary', palette.text);
    root.style.setProperty('--accent-color', settings.accentColor || palette.accent);
    root.setAttribute('data-theme', palette.mode);
  } else if (settings.preset === 'custom') {
    if (settings.customBgColor) root.style.setProperty('--bg-dark', settings.customBgColor);
    if (settings.customSurfaceBgColor) root.style.setProperty('--bg-surface', settings.customSurfaceBgColor);
    if (settings.customCardBgColor) root.style.setProperty('--bg-card', settings.customCardBgColor);
    if (settings.customHeaderBgColor) {
      root.style.setProperty('--header-bg', settings.customHeaderBgColor);
      root.style.setProperty('--modal-header-bg', settings.customHeaderBgColor);
    }
    if (settings.customColumnHeaderBgColor) root.style.setProperty('--column-header-bg', settings.customColumnHeaderBgColor);
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
    if (typeof window !== 'undefined' && window.electronAPI?.workspace) return DEFAULT_USER_SETTINGS;
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
    repository.initialize().then(() => db.settings.get('user_settings')).then(record => {
      if (isMounted && record && record.value) {
        const merged = mergeStoredSettings(record.value);
        setSettings(merged);
        applySettingsToDOM(merged);
        if (!window.electronAPI?.workspace) localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
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

  // Synchronize tray setting with Electron main process
  useEffect(() => {
    if (window.electronAPI?.tray?.setTrayEnabled) {
      window.electronAPI.tray.setTrayEnabled(settings.minimizeToTray ?? true).catch(() => {});
    }
  }, [settings.minimizeToTray]);

  const updateSettings = useCallback(async (partial: Partial<UserSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...partial };
      if (!window.electronAPI?.workspace) localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      db.settings.put({ key: 'user_settings', value: updated }).catch(() => {});
      return updated;
    });
  }, []);

  const resetSettings = useCallback(async () => {
    setSettings(previous => {
      const reset = {
        ...DEFAULT_USER_SETTINGS,
        savedThemes: previous.savedThemes,
        lastSeenWhatsNewVersion: previous.lastSeenWhatsNewVersion
      };
      if (!window.electronAPI?.workspace) localStorage.setItem(STORAGE_KEY, JSON.stringify(reset));
      db.settings.put({ key: 'user_settings', value: reset }).catch(() => {});
      return reset;
    });
  }, []);

  return {
    settings,
    updateSettings,
    resetSettings
  };
}
