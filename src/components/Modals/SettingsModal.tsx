import React, { useState, useEffect } from 'react';
import { X, RotateCcw, Palette, Type, Sliders, Sparkles, Eye, Check, Save, Trash2, FolderOpen, FolderInput, Database, Bot, Copy, CheckCheck, RefreshCw, ArrowUpCircle } from 'lucide-react';
import type { UserSettings, ThemePreset, FontFamily, ContentWidth, WorkspaceStatus } from '../../types';
import { PRESET_PALETTES } from '../../hooks/useSettings';
import { repository } from '../../db/repository';
import { CURRENT_APP_VERSION } from '../../data/changelog';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: UserSettings;
  onUpdateSettings: (partial: Partial<UserSettings>) => void;
  onResetSettings: () => void;
  onOpenWhatsNew?: () => void;
}

type TabType = 'appearance' | 'editor' | 'general' | 'ai';

interface UpdaterState {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  currentVersion: string;
  availableVersion?: string | null;
  releaseNotes?: string | null;
  progress?: {
    percent: number;
    bytesPerSecond: number;
    transferred: number;
    total: number;
  } | null;
  error?: string | null;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onResetSettings,
  onOpenWhatsNew
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [copiedClient, setCopiedClient] = useState<string | null>(null);
  const [selectedMcpClient, setSelectedMcpClient] = useState<'claude' | 'antigravity' | 'cursor' | 'cli'>('claude');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [themeName, setThemeName] = useState('');
  const [themeSaveError, setThemeSaveError] = useState<string | null>(null);
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatus | null>(null);
  const [workspaceMessage, setWorkspaceMessage] = useState('');
  const [isMovingWorkspace, setIsMovingWorkspace] = useState(false);
  const [updaterState, setUpdaterState] = useState<UpdaterState | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateFeedback, setUpdateFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setActiveTab('general');

    const updater = window.electronAPI?.updater;
    if (!updater) return;

    let isDisposed = false;
    const handleUpdaterState = (state: UpdaterState) => {
      if (isDisposed) return;
      setUpdaterState(state);
      if (state.status === 'checking') {
        setIsCheckingUpdate(true);
        setUpdateFeedback('Checking for updates...');
      } else {
        setIsCheckingUpdate(false);
      }
      if (state.status === 'available') {
        setUpdateFeedback(`Update v${state.availableVersion || ''} found. Downloading...`);
      } else if (state.status === 'downloading') {
        const percent = state.progress?.percent != null ? ` (${state.progress.percent}%)` : '';
        setUpdateFeedback(`Downloading update v${state.availableVersion || ''}${percent}...`);
      } else if (state.status === 'not-available') {
        setUpdateFeedback('You are already using the latest version.');
      } else if (state.status === 'downloaded') {
        setUpdateFeedback(`Version ${state.availableVersion || ''} is ready to install.`);
      } else if (state.status === 'error' && state.error) {
        setUpdateFeedback(`Update check: ${state.error}`);
      }
    };

    // Subscribe before reading/checking so no updater state transition is missed.
    const unsubscribe = updater.onStatusChange(handleUpdaterState);

    const checkOnOpen = async () => {
      try {
        const state = await updater.getState();
        if (isDisposed) return;
        handleUpdaterState(state);

        // An existing check/download already covers this opening. Keep a downloaded
        // update available for installation instead of replacing that state.
        if (['checking', 'available', 'downloading', 'downloaded'].includes(state.status)) return;

        setIsCheckingUpdate(true);
        setUpdateFeedback('Checking for updates...');
        const result = await updater.check();
        if (!isDisposed && !result.ok) {
          setUpdateFeedback(`Update check: ${result.error || 'No updates found'}`);
        }
      } catch (err) {
        if (!isDisposed) {
          setIsCheckingUpdate(false);
          setUpdateFeedback(`Error: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    };

    void checkOnOpen();

    return () => {
      isDisposed = true;
      unsubscribe();
    };
  }, [isOpen]);

  const handleCheckForUpdates = async () => {
    if (!window.electronAPI?.updater) return;
    setIsCheckingUpdate(true);
    setUpdateFeedback('Checking for updates...');
    try {
      const res = await window.electronAPI.updater.check();
      if (!res.ok) {
        setUpdateFeedback(`Update check: ${res.error || 'No updates found'}`);
      }
    } catch (err) {
      setUpdateFeedback(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleInstallUpdate = async () => {
    if (!window.electronAPI?.updater) return;
    setUpdateFeedback('Installing update and restarting...');
    try {
      await window.electronAPI.updater.install();
    } catch (err) {
      setUpdateFeedback(`Installation failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !window.electronAPI?.workspace) return;
    window.electronAPI.workspace.status().then(setWorkspaceStatus).catch(error => {
      setWorkspaceMessage(error instanceof Error ? error.message : 'Could not read workspace status.');
    });
  }, [isOpen]);

  const handleMoveWorkspace = async () => {
    if (!window.electronAPI?.workspace) return;
    setIsMovingWorkspace(true);
    setWorkspaceMessage('Checking and copying workspace...');
    try {
      await repository.flush();
      const result = await window.electronAPI.workspace.chooseAndMove();
      if (!result) {
        setWorkspaceMessage('Move cancelled.');
        return;
      }
      setWorkspaceStatus(result);
      setWorkspaceMessage(result.previousPath
        ? `Workspace moved. The previous folder was retained as a safety copy: ${result.previousPath}`
        : 'The workspace is already in this location.');
    } catch (error) {
      setWorkspaceMessage(error instanceof Error ? error.message : 'Failed to move workspace.');
    } finally {
      setIsMovingWorkspace(false);
    }
  };

  if (!isOpen) return null;

  const handleReset = () => {
    onResetSettings();
    setShowResetConfirm(false);
  };

  const handleSaveTheme = () => {
    const name = themeName.trim();
    if (!name) {
      setThemeSaveError('Enter a name for the theme first.');
      return;
    }
    if (name.length > 40) {
      setThemeSaveError('A theme name can contain no more than 40 characters.');
      return;
    }

    const palette = settings.preset === 'custom' ? undefined : PRESET_PALETTES[settings.preset];
    const savedTheme = {
      id: `theme-${crypto.randomUUID()}`,
      name,
      theme: palette?.mode ?? settings.theme,
      accentColor: palette?.accent ?? settings.accentColor,
      atmosphereColor: palette?.atmosphere ?? settings.atmosphereColor,
      selectedCardColor: palette?.selected ?? settings.selectedCardColor,
      backgroundColor: palette?.bg ?? settings.customBgColor ?? '#141312',
      textColor: palette?.text ?? settings.customTextColor ?? '#faf6ee',
      createdAt: Date.now()
    };
    onUpdateSettings({ savedThemes: [...settings.savedThemes, savedTheme] });
    setThemeName('');
    setThemeSaveError(null);
  };

  const applySavedTheme = (theme: UserSettings['savedThemes'][number]) => {
    onUpdateSettings({
      preset: 'custom',
      theme: theme.theme,
      accentColor: theme.accentColor,
      atmosphereColor: theme.atmosphereColor,
      selectedCardColor: theme.selectedCardColor,
      customBgColor: theme.backgroundColor,
      customTextColor: theme.textColor
    });
  };

  const deleteSavedTheme = (themeId: string, name: string) => {
    if (!window.confirm(`Delete saved theme “${name}”?`)) return;
    onUpdateSettings({ savedThemes: settings.savedThemes.filter(theme => theme.id !== themeId) });
  };

  const themePresets: Array<{ id: ThemePreset; name: string; icon: string; bg: string; text: string; accent: string; atmosphere: string }> = [
    { id: 'vanilla', name: 'Warm Vanilla', icon: '🍦', bg: '#141312', text: '#FAF6EE', accent: '#3b82f6', atmosphere: '#EBDEC3' },
    { id: 'cyberpunk', name: 'Cyberpunk Neon', icon: '⚡', bg: '#0d0914', text: '#e2d9f3', accent: '#00f0ff', atmosphere: '#00f0ff' },
    { id: 'nord', name: 'Nordic Slate', icon: '❄️', bg: '#2e3440', text: '#eceff4', accent: '#88c0d0', atmosphere: '#88c0d0' },
    { id: 'dracula', name: 'Dracula Dark', icon: '🧛', bg: '#282a36', text: '#f8f8f2', accent: '#bd93f9', atmosphere: '#bd93f9' },
    { id: 'sepia', name: 'Sepia Paper', icon: '📜', bg: '#fbf0d9', text: '#433422', accent: '#b45309', atmosphere: '#b45309' },
    { id: 'obsidian', name: 'Obsidian OLED', icon: '🖤', bg: '#000000', text: '#e0e0e0', accent: '#6366f1', atmosphere: '#6366f1' },
    { id: 'custom', name: 'Custom', icon: '🎨', bg: settings.customBgColor || '#141312', text: settings.customTextColor || '#faf6ee', accent: settings.accentColor, atmosphere: settings.atmosphereColor }
  ];

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(7, 10, 18, 0.8)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px'
      }}
    >
      <div
        className="modal-container settings-modal"
        onClick={e => e.stopPropagation()}
        style={{
          width: '620px',
          maxWidth: '92vw',
          maxHeight: '85vh',
          background: 'var(--bg-surface)',
          backdropFilter: 'var(--glass-backdrop)',
          border: '1px solid var(--border-neon-cyan)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6), 0 0 30px rgba(var(--atmosphere-rgb), 0.15)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Modal Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders size={20} className="modal-header-icon" />
            <h2>Settings</h2>
            <span style={{
              fontSize: '0.72rem',
              color: 'var(--text-secondary)',
              padding: '2px 6px',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '4px',
              fontWeight: 500
            }}>
              v{updaterState?.currentVersion || '0.1.7'}
            </span>
          </div>
          <button className="icon-button" onClick={onClose} title="Close (Esc)">
            <X size={18} />
          </button>
        </div>

        {/* Tab Bar */}
        <div className="settings-tabs">
          <button
            className={`settings-tab ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            <Sliders size={16} />
            <span>General</span>
          </button>
          <button
            className={`settings-tab ${activeTab === 'appearance' ? 'active' : ''}`}
            onClick={() => setActiveTab('appearance')}
          >
            <Palette size={16} />
            <span>Appearance</span>
          </button>
          <button
            className={`settings-tab ${activeTab === 'editor' ? 'active' : ''}`}
            onClick={() => setActiveTab('editor')}
          >
            <Type size={16} />
            <span>Editor</span>
          </button>
          <button
            className={`settings-tab ${activeTab === 'ai' ? 'active' : ''}`}
            onClick={() => setActiveTab('ai')}
          >
            <Bot size={16} />
            <span>AI & Integrations</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="modal-body settings-body">
          {activeTab === 'appearance' && (
            <div className="settings-section">
              {/* Theme Presets Grid */}
              <div className="setting-item">
                <div className="setting-info">
                  <label>Theme Presets</label>
                  <span className="setting-description">Choose a complete visual theme for the entire application</span>
                </div>
                <div className="preset-grid">
                  {themePresets.map(preset => (
                    <button
                      key={preset.id}
                      className={`preset-card ${settings.preset === preset.id ? 'active' : ''}`}
                      onClick={() => {
                        const pal = PRESET_PALETTES[preset.id as keyof typeof PRESET_PALETTES];
                        onUpdateSettings({
                          preset: preset.id,
                          accentColor: pal ? pal.accent : settings.accentColor,
                          atmosphereColor: pal ? pal.atmosphere : settings.atmosphereColor,
                          selectedCardColor: pal ? pal.selected : settings.selectedCardColor,
                          customBgColor: pal ? pal.bg : settings.customBgColor,
                          customTextColor: pal ? pal.text : settings.customTextColor,
                          theme: pal ? pal.mode : settings.theme
                        });
                      }}
                      style={{
                        background: preset.bg,
                        color: preset.text,
                        borderColor: settings.preset === preset.id ? preset.accent : 'rgba(255, 255, 255, 0.1)'
                      }}
                    >
                      <div className="preset-card-header">
                        <span className="preset-icon">{preset.icon}</span>
                        <span className="preset-name">{preset.name}</span>
                        {settings.preset === preset.id && <Check size={14} color={preset.accent} />}
                      </div>
                      <div className="preset-preview-dots">
                        <span className="dot" style={{ backgroundColor: preset.bg, border: '1px solid rgba(255,255,255,0.2)' }} />
                        <span className="dot" style={{ backgroundColor: preset.text }} />
                        <span className="dot" style={{ backgroundColor: preset.accent }} />
                        <span className="dot" style={{ backgroundColor: preset.atmosphere }} />
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Color Pickers */}
              <div className="setting-item">
                <div className="setting-info">
                  <label>Custom Colors</label>
                  <span className="setting-description">Choose or refine your accent, atmosphere, selection, agent alert, background, and text colors</span>
                </div>
                <div className="color-picker-row">
                  <div className="color-picker-field">
                    <span>Accent Color</span>
                    <div className="color-picker-input-wrapper">
                      <input
                        type="color"
                        value={settings.accentColor}
                        onChange={e => onUpdateSettings({ accentColor: e.target.value, preset: 'custom' })}
                      />
                      <span className="color-hex-label">{settings.accentColor}</span>
                    </div>
                  </div>

                  <div className="color-picker-field">
                    <span>Atmosphere Color (borders and tints)</span>
                    <div className="color-picker-input-wrapper">
                      <input
                        type="color"
                        value={settings.atmosphereColor}
                        onChange={e => onUpdateSettings({ atmosphereColor: e.target.value, preset: 'custom' })}
                      />
                      <span className="color-hex-label">{settings.atmosphereColor}</span>
                    </div>
                  </div>

                  <div className="color-picker-field">
                    <span>Agent Alert Color</span>
                    <div className="color-picker-input-wrapper">
                      <input
                        type="color"
                        value={settings.agentAlertColor}
                        onChange={e => onUpdateSettings({ agentAlertColor: e.target.value })}
                      />
                      <span className="color-hex-label">{settings.agentAlertColor}</span>
                    </div>
                  </div>

                  <div className="color-picker-field">
                    <span>Background</span>
                    <div className="color-picker-input-wrapper">
                      <input
                        type="color"
                        value={settings.customBgColor || '#141312'}
                        onChange={e => onUpdateSettings({ customBgColor: e.target.value, preset: 'custom' })}
                      />
                      <span className="color-hex-label">{settings.customBgColor || '#141312'}</span>
                    </div>
                  </div>

                  <div className="color-picker-field">
                    <span>Selected Cards (gradient)</span>
                    <div className="color-picker-input-wrapper">
                      <input
                        type="color"
                        value={settings.selectedCardColor}
                        onChange={e => onUpdateSettings({ selectedCardColor: e.target.value, preset: 'custom' })}
                      />
                      <span className="color-hex-label">{settings.selectedCardColor}</span>
                    </div>
                  </div>

                  <div className="color-picker-field">
                    <span>Text Color</span>
                    <div className="color-picker-input-wrapper">
                      <input
                        type="color"
                        value={settings.customTextColor || '#faf6ee'}
                        onChange={e => onUpdateSettings({ customTextColor: e.target.value, preset: 'custom' })}
                      />
                      <span className="color-hex-label">{settings.customTextColor || '#faf6ee'}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="setting-item">
                <div className="setting-info">
                  <label>Saved Themes</label>
                  <span className="setting-description">Save the current colors as a personal theme and apply them again later</span>
                </div>
                {settings.savedThemes.length > 0 && (
                  <div className="saved-theme-grid">
                    {settings.savedThemes.map(theme => (
                      <div key={theme.id} className="saved-theme-card" style={{ background: theme.backgroundColor, color: theme.textColor }}>
                        <button type="button" className="saved-theme-apply" onClick={() => applySavedTheme(theme)} title={`Apply theme “${theme.name}”`}>
                          <span className="saved-theme-name">{theme.name}</span>
                          <span className="preset-preview-dots">
                            <span className="dot" style={{ backgroundColor: theme.backgroundColor, border: '1px solid rgba(255,255,255,0.2)' }} />
                            <span className="dot" style={{ backgroundColor: theme.textColor }} />
                            <span className="dot" style={{ backgroundColor: theme.accentColor }} />
                            <span className="dot" style={{ backgroundColor: theme.atmosphereColor }} />
                            <span className="dot" style={{ backgroundColor: theme.selectedCardColor }} />
                          </span>
                        </button>
                        <button type="button" className="saved-theme-delete" onClick={() => deleteSavedTheme(theme.id, theme.name)} title={`Delete theme “${theme.name}”`} aria-label={`Delete theme “${theme.name}”`}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="save-theme-row">
                  <input
                    type="text"
                    value={themeName}
                    maxLength={40}
                    placeholder="Name this theme..."
                    onChange={event => {
                      setThemeName(event.target.value);
                      setThemeSaveError(null);
                    }}
                    onKeyDown={event => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        handleSaveTheme();
                      }
                    }}
                  />
                  <button type="button" className="secondary-button save-theme-button" onClick={handleSaveTheme}>
                    <Save size={14} /> Save
                  </button>
                </div>
                {themeSaveError && <span className="setting-inline-error" role="alert">{themeSaveError}</span>}
              </div>

              {/* Visual Effects Toggles */}
              <div className="setting-item">
                <div className="setting-info">
                  <label>Visual Effects</label>
                  <span className="setting-description">Enable or disable glass effects and card glow for more performance or atmosphere</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                      <Sparkles size={16} />
                      <span>Glassmorphic Blur (Backdrop Blur)</span>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={settings.enableGlassmorphism}
                        onChange={e => onUpdateSettings({ enableGlassmorphism: e.target.checked })}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                      <Eye size={16} />
                      <span>Neon Card Glow & Shadow Effects</span>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={settings.enableGlow}
                        onChange={e => onUpdateSettings({ enableGlow: e.target.checked })}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'editor' && (
            <div className="settings-section">
              <div className="setting-item">
                <div className="setting-info">
                  <label>Font</label>
                  <span className="setting-description">Choose the font used by the text editor</span>
                </div>
                <div className="setting-control-group">
                  {(['sans', 'serif', 'mono'] as FontFamily[]).map(font => (
                    <button
                      key={font}
                      className={`setting-chip ${settings.fontFamily === font ? 'active' : ''}`}
                      onClick={() => onUpdateSettings({ fontFamily: font })}
                    >
                      {font === 'sans' ? 'Sans-serif' : font === 'serif' ? 'Serif' : 'Monospace'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="setting-item">
                <div className="setting-info">
                  <label>Font Size ({settings.fontSize}px)</label>
                  <span className="setting-description">Adjust the text size in the writing panel</span>
                </div>
                <input
                  type="range"
                  min={13}
                  max={22}
                  step={1}
                  value={settings.fontSize}
                  onChange={e => onUpdateSettings({ fontSize: Number(e.target.value) })}
                  className="setting-range"
                />
              </div>

              <div className="setting-item">
                <div className="setting-info">
                  <label>Line Height ({settings.lineHeight})</label>
                  <span className="setting-description">Spacing between lines of text</span>
                </div>
                <div className="setting-control-group">
                  {[1.4, 1.6, 1.8].map(lh => (
                    <button
                      key={lh}
                      className={`setting-chip ${settings.lineHeight === lh ? 'active' : ''}`}
                      onClick={() => onUpdateSettings({ lineHeight: lh })}
                    >
                      {lh === 1.4 ? 'Compact (1.4)' : lh === 1.6 ? 'Standard (1.6)' : 'Spacious (1.8)'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="setting-item">
                <div className="setting-info">
                  <label>Maximum Text Width</label>
                  <span className="setting-description">Maximum paragraph width while writing</span>
                </div>
                <div className="setting-control-group">
                  {(['narrow', 'standard', 'full'] as ContentWidth[]).map(width => (
                    <button
                      key={width}
                      className={`setting-chip ${settings.contentWidth === width ? 'active' : ''}`}
                      onClick={() => onUpdateSettings({ contentWidth: width })}
                    >
                      {width === 'narrow' ? 'Comfortable (680px)' : width === 'standard' ? 'Standard (800px)' : 'Full'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'general' && (
            <div className="settings-section">
              <div className="setting-item">
                <div className="setting-info">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <RefreshCw size={15} /> Version & Updates
                  </label>
                  <span className="setting-description">
                    DeepScribe can check for updates automatically and update directly in the app.
                  </span>
                </div>
                {window.electronAPI?.updater ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          Current version: v{updaterState?.currentVersion || CURRENT_APP_VERSION}
                        </span>
                        {updaterState?.status === 'downloaded' && (
                          <span style={{
                            fontSize: '0.72rem',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: '#10B981',
                            fontWeight: 600
                          }}>
                            Update v{updaterState.availableVersion || ''} ready!
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {onOpenWhatsNew && (
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={onOpenWhatsNew}
                            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                          >
                            <Sparkles size={14} /> What's New
                          </button>
                        )}
                        {updaterState?.status === 'downloaded' ? (
                          <button
                            className="primary-button"
                            type="button"
                            onClick={handleInstallUpdate}
                            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                          >
                            <ArrowUpCircle size={14} /> Restart & Update Now
                          </button>
                        ) : (
                          <button
                            className="secondary-button"
                            type="button"
                            disabled={isCheckingUpdate || updaterState?.status === 'downloading'}
                            onClick={handleCheckForUpdates}
                            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                          >
                            <RefreshCw size={14} style={{ animation: isCheckingUpdate ? 'spin 1s linear infinite' : 'none' }} />
                            {isCheckingUpdate ? 'Checking...' : 'Check for Updates'}
                          </button>
                        )}
                      </div>
                    </div>

                    {updaterState?.status === 'downloading' && updaterState.progress && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          <span>Downloading update v{updaterState.availableVersion || ''}...</span>
                          <span>{updaterState.progress.percent}%</span>
                        </div>
                        <div style={{ width: '100%', height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${updaterState.progress.percent}%`, height: '100%', background: 'var(--accent-color)', transition: 'width 0.2s ease' }} />
                        </div>
                      </div>
                    )}

                    {updateFeedback && (
                      <span className="setting-description" style={{ fontSize: '0.75rem', color: updaterState?.status === 'error' ? '#EF4444' : 'var(--text-secondary)' }}>
                        {updateFeedback}
                      </span>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Current version: v{CURRENT_APP_VERSION}
                    </span>
                    {onOpenWhatsNew && (
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={onOpenWhatsNew}
                        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                      >
                        <Sparkles size={14} /> What's New
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="setting-item">
                <div className="setting-info">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Database size={15} /> Data Storage</label>
                  <span className="setting-description">Projects, settings, and attachments are stored together in one portable workspace.</span>
                </div>
                {window.electronAPI?.workspace ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <code style={{ fontSize: '0.72rem', overflowWrap: 'anywhere', color: 'var(--text-secondary)' }}>
                      {workspaceStatus?.path ?? 'Loading location...'}
                    </code>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      <button className="secondary-button" type="button" onClick={() => window.electronAPI?.workspace.openFolder()}>
                        <FolderOpen size={14} /> Open Workspace Folder
                      </button>
                      <button className="secondary-button" type="button" disabled={isMovingWorkspace} onClick={handleMoveWorkspace}>
                        <FolderInput size={14} /> {isMovingWorkspace ? 'Working...' : 'Change Location'}
                      </button>
                    </div>
                    <span style={{ color: '#F59E0B', fontSize: '0.72rem' }}>Not encrypted — files are readable by processes with access to this folder.</span>
                    {workspaceMessage && <span className="setting-description" role="status">{workspaceMessage}</span>}
                  </div>
                ) : (
                  <span className="setting-description">The portable workspace is available in the desktop app.</span>
                )}
              </div>

              <div className="setting-item">
                <div className="setting-info">
                  <label>Miller Column Width ({settings.columnWidth}px)</label>
                  <span className="setting-description">Width of each navigation column in the main view</span>
                </div>
                <div className="setting-control-group">
                  {[280, 320, 380].map(cw => (
                    <button
                      key={cw}
                      className={`setting-chip ${settings.columnWidth === cw ? 'active' : ''}`}
                      onClick={() => onUpdateSettings({ columnWidth: cw })}
                    >
                      {cw === 280 ? 'Compact (280px)' : cw === 320 ? 'Standard (320px)' : 'Wide (380px)'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="setting-item">
                <div className="setting-info">
                  <label>Native Spell Check</label>
                  <span className="setting-description">Enable the built-in browser/system spell checker</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={settings.spellcheck}
                    onChange={e => onUpdateSettings({ spellcheck: e.target.checked })}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              {/* System Tray & Background Setting */}
              <div className="setting-item">
                <div className="setting-info">
                  <label>Minimize and Close to System Tray</label>
                  <span className="setting-description">Keep DeepScribe running silently in the Windows system tray when closed or minimized so global shortcuts like Ctrl+Alt+S remain active</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={settings.minimizeToTray ?? true}
                    onChange={e => {
                      const enabled = e.target.checked;
                      onUpdateSettings({ minimizeToTray: enabled });
                      if (window.electronAPI?.tray?.setTrayEnabled) {
                        window.electronAPI.tray.setTrayEnabled(enabled);
                      }
                    }}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              {/* Screen Annotation Global Shortcut Info */}
              <div className="setting-item">
                <div className="setting-info">
                  <label>Visual Screen Annotation (Global Hotkey)</label>
                  <span className="setting-description">Freeze screen and draw arrows, boxes, and badges to create tasks or blocks in DeepScribe from anywhere in Windows</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <kbd style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    background: 'rgba(59, 130, 246, 0.15)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    color: '#60A5FA',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    fontFamily: 'monospace'
                  }}>
                    Ctrl + Alt + S
                  </kbd>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="settings-section">
              {/* Status Banner */}
              <div className="setting-item">
                <div style={{
                  padding: '14px 16px',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981', display: 'inline-block', boxShadow: '0 0 8px #10B981' }} />
                      <strong style={{ color: '#10B981', fontSize: '13px' }}>Smart Dual-Mode MCP Server Active</strong>
                    </div>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.15)', color: '#10B981', fontWeight: 600 }}>
                      24/7 Agent Ready
                    </span>
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                    AI agents (such as Antigravity, Claude Desktop, and Cursor) can always read and update DeepScribe — live while the window is open or directly through SQLite while the app is closed.
                  </span>
                </div>
              </div>

              {/* Toggle offline agent access */}
              <div className="setting-item">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div className="setting-info">
                  <label>Direct SQLite Offline Access</label>
                  <span className="setting-description">Allow AI agents to read and write workspace.sqlite directly while the app is closed</span>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={settings.allowOfflineAgentAccess !== false}
                      onChange={e => onUpdateSettings({ allowOfflineAgentAccess: e.target.checked })}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>

              {/* MCP Configuration Generator */}
              <div className="setting-item">
                <div className="setting-info">
                  <label>MCP Client Configuration</label>
                  <span className="setting-description">Copy the ready-to-use configuration for your AI assistant or development environment:</span>
                </div>
                <div className="setting-control-group">
                  {(['claude', 'antigravity', 'cursor', 'cli'] as const).map(client => (
                    <button
                      key={client}
                      type="button"
                      className={`setting-chip ${selectedMcpClient === client ? 'active' : ''}`}
                      onClick={() => setSelectedMcpClient(client)}
                    >
                      {client === 'claude' ? 'Claude Desktop' : client === 'antigravity' ? 'Antigravity / Gemini' : client === 'cursor' ? 'Cursor / VS Code' : 'Universal CLI'}
                    </button>
                  ))}
                </div>

                <div style={{ position: 'relative', marginTop: '6px' }}>
                  <pre style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid var(--border-subtle)',
                    fontSize: '12px',
                    fontFamily: 'var(--font-code)',
                    color: 'var(--text-primary)',
                    overflowX: 'auto',
                    margin: 0
                  }}>
                    <code>
                      {(() => {
                        const serverPath = 'k:/Apps/DeepScribe/mcp/server.mjs';
                        switch (selectedMcpClient) {
                          case 'claude':
                          case 'antigravity':
                          case 'cursor':
                            return JSON.stringify({
                              mcpServers: {
                                deepscribe: {
                                  command: 'node',
                                  args: [serverPath]
                                }
                              }
                            }, null, 2);
                          case 'cli':
                            return `node "${serverPath}"`;
                        }
                      })()}
                    </code>
                  </pre>
                  <button
                    type="button"
                    className="secondary-button"
                    style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontSize: '11px',
                      padding: '4px 8px'
                    }}
                    onClick={() => {
                      const serverPath = 'k:/Apps/DeepScribe/mcp/server.mjs';
                      let text = '';
                      if (selectedMcpClient === 'cli') {
                        text = `node "${serverPath}"`;
                      } else {
                        text = JSON.stringify({
                          mcpServers: {
                            deepscribe: {
                              command: 'node',
                              args: [serverPath]
                            }
                          }
                        }, null, 2);
                      }
                      navigator.clipboard.writeText(text);
                      setCopiedClient(selectedMcpClient);
                      setTimeout(() => setCopiedClient(null), 2500);
                    }}
                  >
                    {copiedClient === selectedMcpClient ? (
                      <>
                        <CheckCheck size={12} color="#10B981" />
                        <span style={{ color: '#10B981' }}>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={12} />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Best practices note */}
              <div className="setting-item" style={{ marginTop: '4px' }}>
                <div className="setting-info">
                  <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>💡 Recommended AI Tags &amp; Workflows</label>
                  <span className="setting-description" style={{ fontSize: '11px', lineHeight: '1.5' }}>
                    You organize tasks in the Tasks view. Agents may create concrete follow-ups in projects or Workspace Inbox and update task progress, but cannot edit or organize a task after creating it. Use tags such as <code style={{ color: 'var(--accent-color)' }}>#concept</code> to keep regular knowledge blocks discoverable.
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <div>
            {!showResetConfirm ? (
              <button
                className="secondary-button"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
                onClick={() => setShowResetConfirm(true)}
              >
                <RotateCcw size={14} />
                <span>Restore Defaults</span>
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: '#ef4444' }}>Are you sure?</span>
                <button className="danger-button" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={handleReset}>
                  Yes, restore
                </button>
                <button
                  className="secondary-button"
                  style={{ padding: '4px 8px', fontSize: '12px' }}
                  onClick={() => setShowResetConfirm(false)}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          <button className="primary-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
