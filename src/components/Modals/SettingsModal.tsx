import React, { useState, useEffect } from 'react';
import { X, RotateCcw, Palette, Type, Sliders, Sparkles, Eye, Check, Save, Trash2, FolderOpen, FolderInput, Database, Bot, Copy, CheckCheck, RefreshCw, ArrowUpCircle } from 'lucide-react';
import type { UserSettings, ThemePreset, FontFamily, ContentWidth, WorkspaceStatus } from '../../types';
import { PRESET_PALETTES } from '../../hooks/useSettings';
import { repository } from '../../db/repository';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: UserSettings;
  onUpdateSettings: (partial: Partial<UserSettings>) => void;
  onResetSettings: () => void;
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
  onResetSettings
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('appearance');
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
    if (!isOpen || !window.electronAPI?.updater) return;
    window.electronAPI.updater.getState().then(setUpdaterState).catch(() => {});
    const unsubscribe = window.electronAPI.updater.onStatusChange(state => {
      setUpdaterState(state);
      if (state.status === 'checking') {
        setIsCheckingUpdate(true);
      } else {
        setIsCheckingUpdate(false);
      }
      if (state.status === 'not-available') {
        setUpdateFeedback('Je gebruikt al de nieuwste versie.');
      } else if (state.status === 'downloaded') {
        setUpdateFeedback(`Versie ${state.availableVersion || ''} is gereed voor installatie.`);
      } else if (state.status === 'error' && state.error) {
        setUpdateFeedback(`Updatecontrole: ${state.error}`);
      }
    });
    return () => unsubscribe();
  }, [isOpen]);

  const handleCheckForUpdates = async () => {
    if (!window.electronAPI?.updater) return;
    setIsCheckingUpdate(true);
    setUpdateFeedback('Zoeken naar updates...');
    try {
      const res = await window.electronAPI.updater.check();
      if (!res.ok) {
        setUpdateFeedback(`Updatecontrole: ${res.error || 'Geen updates gevonden'}`);
      }
    } catch (err) {
      setUpdateFeedback(`Fout: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleInstallUpdate = async () => {
    if (!window.electronAPI?.updater) return;
    setUpdateFeedback('Update installeren en herstarten...');
    try {
      await window.electronAPI.updater.install();
    } catch (err) {
      setUpdateFeedback(`Fout bij installatie: ${err instanceof Error ? err.message : String(err)}`);
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
      setWorkspaceMessage(error instanceof Error ? error.message : 'Workspacestatus kon niet worden gelezen.');
    });
  }, [isOpen]);

  const handleMoveWorkspace = async () => {
    if (!window.electronAPI?.workspace) return;
    setIsMovingWorkspace(true);
    setWorkspaceMessage('Workspace wordt gecontroleerd en gekopieerd...');
    try {
      await repository.flush();
      const result = await window.electronAPI.workspace.chooseAndMove();
      if (!result) {
        setWorkspaceMessage('Verplaatsen geannuleerd.');
        return;
      }
      setWorkspaceStatus(result);
      setWorkspaceMessage(result.previousPath
        ? `Workspace verplaatst. De vorige map is als veiligheidskopie behouden: ${result.previousPath}`
        : 'De workspace staat al op deze locatie.');
    } catch (error) {
      setWorkspaceMessage(error instanceof Error ? error.message : 'Workspace verplaatsen is mislukt.');
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
      setThemeSaveError('Geef het thema eerst een naam.');
      return;
    }
    if (name.length > 40) {
      setThemeSaveError('Een themanaam mag maximaal 40 tekens bevatten.');
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
    if (!window.confirm(`Opgeslagen thema “${name}” verwijderen?`)) return;
    onUpdateSettings({ savedThemes: settings.savedThemes.filter(theme => theme.id !== themeId) });
  };

  const themePresets: Array<{ id: ThemePreset; name: string; icon: string; bg: string; text: string; accent: string; atmosphere: string }> = [
    { id: 'vanilla', name: 'Warm Vanilla', icon: '🍦', bg: '#141312', text: '#FAF6EE', accent: '#3b82f6', atmosphere: '#EBDEC3' },
    { id: 'cyberpunk', name: 'Cyberpunk Neon', icon: '⚡', bg: '#0d0914', text: '#e2d9f3', accent: '#00f0ff', atmosphere: '#00f0ff' },
    { id: 'nord', name: 'Nordic Slate', icon: '❄️', bg: '#2e3440', text: '#eceff4', accent: '#88c0d0', atmosphere: '#88c0d0' },
    { id: 'dracula', name: 'Dracula Dark', icon: '🧛', bg: '#282a36', text: '#f8f8f2', accent: '#bd93f9', atmosphere: '#bd93f9' },
    { id: 'sepia', name: 'Sepia Papier', icon: '📜', bg: '#fbf0d9', text: '#433422', accent: '#b45309', atmosphere: '#b45309' },
    { id: 'obsidian', name: 'Obsidian OLED', icon: '🖤', bg: '#000000', text: '#e0e0e0', accent: '#6366f1', atmosphere: '#6366f1' },
    { id: 'custom', name: 'Aangepast (Vrij)', icon: '🎨', bg: settings.customBgColor || '#141312', text: settings.customTextColor || '#faf6ee', accent: settings.accentColor, atmosphere: settings.atmosphereColor }
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
            <h2>Instellingen</h2>
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
          <button className="icon-button" onClick={onClose} title="Sluiten (Esc)">
            <X size={18} />
          </button>
        </div>

        {/* Tab Bar */}
        <div className="settings-tabs">
          <button
            className={`settings-tab ${activeTab === 'appearance' ? 'active' : ''}`}
            onClick={() => setActiveTab('appearance')}
          >
            <Palette size={16} />
            <span>Weergave</span>
          </button>
          <button
            className={`settings-tab ${activeTab === 'editor' ? 'active' : ''}`}
            onClick={() => setActiveTab('editor')}
          >
            <Type size={16} />
            <span>Editor</span>
          </button>
          <button
            className={`settings-tab ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            <Sliders size={16} />
            <span>Algemeen</span>
          </button>
          <button
            className={`settings-tab ${activeTab === 'ai' ? 'active' : ''}`}
            onClick={() => setActiveTab('ai')}
          >
            <Bot size={16} />
            <span>AI & Integraties</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="modal-body settings-body">
          {activeTab === 'appearance' && (
            <div className="settings-section">
              {/* Theme Presets Grid */}
              <div className="setting-item">
                <div className="setting-info">
                  <label>Thema Presets</label>
                  <span className="setting-description">Kies een compleet stijlthema voor de gehele applicatie</span>
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
                  <label>Aangepaste Kleuren</label>
                  <span className="setting-description">Selecteer of verfijn je eigen accent-, sfeer-, selectie-, agent-alert-, achtergrond- en tekstkleur</span>
                </div>
                <div className="color-picker-row">
                  <div className="color-picker-field">
                    <span>Accentkleur</span>
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
                    <span>Sfeerkleur (randen en tinten)</span>
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
                    <span>Agent-alertkleur</span>
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
                    <span>Achtergrond</span>
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
                    <span>Geselecteerde kaarten (gradient)</span>
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
                    <span>Tekstkleur</span>
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
                  <label>Opgeslagen thema’s</label>
                  <span className="setting-description">Bewaar de huidige kleuren als een persoonlijk thema en pas ze later opnieuw toe</span>
                </div>
                {settings.savedThemes.length > 0 && (
                  <div className="saved-theme-grid">
                    {settings.savedThemes.map(theme => (
                      <div key={theme.id} className="saved-theme-card" style={{ background: theme.backgroundColor, color: theme.textColor }}>
                        <button type="button" className="saved-theme-apply" onClick={() => applySavedTheme(theme)} title={`Thema “${theme.name}” toepassen`}>
                          <span className="saved-theme-name">{theme.name}</span>
                          <span className="preset-preview-dots">
                            <span className="dot" style={{ backgroundColor: theme.backgroundColor, border: '1px solid rgba(255,255,255,0.2)' }} />
                            <span className="dot" style={{ backgroundColor: theme.textColor }} />
                            <span className="dot" style={{ backgroundColor: theme.accentColor }} />
                            <span className="dot" style={{ backgroundColor: theme.atmosphereColor }} />
                            <span className="dot" style={{ backgroundColor: theme.selectedCardColor }} />
                          </span>
                        </button>
                        <button type="button" className="saved-theme-delete" onClick={() => deleteSavedTheme(theme.id, theme.name)} title={`Thema “${theme.name}” verwijderen`} aria-label={`Thema “${theme.name}” verwijderen`}>
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
                    placeholder="Naam van dit thema..."
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
                    <Save size={14} /> Opslaan
                  </button>
                </div>
                {themeSaveError && <span className="setting-inline-error" role="alert">{themeSaveError}</span>}
              </div>

              {/* Visual Effects Toggles */}
              <div className="setting-item">
                <div className="setting-info">
                  <label>Visuele Effecten</label>
                  <span className="setting-description">Schakel glas-effecten en kaartgloed in of uit voor extra prestatie of sfeer</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                      <Sparkles size={16} />
                      <span>Glassmorphic Vervaging (Backdrop Blur)</span>
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
                      <span>Neon Kaartglow & Schaduweffecten</span>
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
                  <label>Lettertype (Font)</label>
                  <span className="setting-description">Kies het lettertype voor de tekst-editor</span>
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
                  <label>Lettergrootte ({settings.fontSize}px)</label>
                  <span className="setting-description">Pas de tekstgrootte aan in het schrijfvenster</span>
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
                  <label>Regelafstand ({settings.lineHeight})</label>
                  <span className="setting-description">Ruimte tussen de regels in de tekst</span>
                </div>
                <div className="setting-control-group">
                  {[1.4, 1.6, 1.8].map(lh => (
                    <button
                      key={lh}
                      className={`setting-chip ${settings.lineHeight === lh ? 'active' : ''}`}
                      onClick={() => onUpdateSettings({ lineHeight: lh })}
                    >
                      {lh === 1.4 ? 'Compact (1.4)' : lh === 1.6 ? 'Standaard (1.6)' : 'Ruim (1.8)'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="setting-item">
                <div className="setting-info">
                  <label>Maximale Tekstbreedte</label>
                  <span className="setting-description">Maximale breedte van de alinea's tijdens het schrijven</span>
                </div>
                <div className="setting-control-group">
                  {(['narrow', 'standard', 'full'] as ContentWidth[]).map(width => (
                    <button
                      key={width}
                      className={`setting-chip ${settings.contentWidth === width ? 'active' : ''}`}
                      onClick={() => onUpdateSettings({ contentWidth: width })}
                    >
                      {width === 'narrow' ? 'Comfortabel (680px)' : width === 'standard' ? 'Standaard (800px)' : 'Volledig'}
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
                    <RefreshCw size={15} /> Versie & Updates
                  </label>
                  <span className="setting-description">
                    DeepScribe kan automatisch op updates controleren en direct in-app worden bijgewerkt.
                  </span>
                </div>
                {window.electronAPI?.updater ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          Huidige versie: v{updaterState?.currentVersion || '0.1.6'}
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
                            Update v{updaterState.availableVersion || ''} gereed!
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {updaterState?.status === 'downloaded' ? (
                          <button
                            className="primary-button"
                            type="button"
                            onClick={handleInstallUpdate}
                            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                          >
                            <ArrowUpCircle size={14} /> Nu herstarten & bijwerken
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
                            {isCheckingUpdate ? 'Zoeken...' : 'Zoeken naar updates'}
                          </button>
                        )}
                      </div>
                    </div>

                    {updaterState?.status === 'downloading' && updaterState.progress && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          <span>Update v{updaterState.availableVersion || ''} downloaden...</span>
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
                  <span className="setting-description">In-app updates zijn beschikbaar in de geïnstalleerde desktopversie.</span>
                )}
              </div>

              <div className="setting-item">
                <div className="setting-info">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Database size={15} /> Dataopslag</label>
                  <span className="setting-description">Projecten, instellingen en bijlagen staan samen in één verplaatsbare workspace.</span>
                </div>
                {window.electronAPI?.workspace ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <code style={{ fontSize: '0.72rem', overflowWrap: 'anywhere', color: 'var(--text-secondary)' }}>
                      {workspaceStatus?.path ?? 'Locatie wordt geladen...'}
                    </code>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      <button className="secondary-button" type="button" onClick={() => window.electronAPI?.workspace.openFolder()}>
                        <FolderOpen size={14} /> Open workspacemap
                      </button>
                      <button className="secondary-button" type="button" disabled={isMovingWorkspace} onClick={handleMoveWorkspace}>
                        <FolderInput size={14} /> {isMovingWorkspace ? 'Bezig...' : 'Locatie wijzigen'}
                      </button>
                    </div>
                    <span style={{ color: '#F59E0B', fontSize: '0.72rem' }}>Niet versleuteld — bestanden zijn leesbaar voor processen met toegang tot deze map.</span>
                    {workspaceMessage && <span className="setting-description" role="status">{workspaceMessage}</span>}
                  </div>
                ) : (
                  <span className="setting-description">De verplaatsbare workspace is beschikbaar in de desktop-app.</span>
                )}
              </div>

              <div className="setting-item">
                <div className="setting-info">
                  <label>Miller-kolombreedte ({settings.columnWidth}px)</label>
                  <span className="setting-description">Breedte van elke navigatiekolom in de hoofdweergave</span>
                </div>
                <div className="setting-control-group">
                  {[280, 320, 380].map(cw => (
                    <button
                      key={cw}
                      className={`setting-chip ${settings.columnWidth === cw ? 'active' : ''}`}
                      onClick={() => onUpdateSettings({ columnWidth: cw })}
                    >
                      {cw === 280 ? 'Compact (280px)' : cw === 320 ? 'Standaard (320px)' : 'Breed (380px)'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="setting-item">
                <div className="setting-info">
                  <label>Native Spellingscontrole</label>
                  <span className="setting-description">Ingebouwde browser/systeem spellingscontrole inschakelen</span>
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
                      <strong style={{ color: '#10B981', fontSize: '13px' }}>Smart Dual-Mode MCP Server Actief</strong>
                    </div>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.15)', color: '#10B981', fontWeight: 600 }}>
                      24/7 Agent Ready
                    </span>
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                    AI-agents (zoals in Antigravity, Claude Desktop en Cursor) kunnen DeepScribe altijd uitlezen en bijwerken — zowel live als het venster open staat als rechtstreeks via SQLite wanneer de app gesloten is.
                  </span>
                </div>
              </div>

              {/* Toggle offline agent access */}
              <div className="setting-item">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div className="setting-info">
                    <label>Directe SQLite Offline Toegang</label>
                    <span className="setting-description">Laat AI-agents rechtstreeks in workspace.sqlite lezen en schrijven als de app gesloten is</span>
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
                  <label>MCP Client Configuratie</label>
                  <span className="setting-description">Kopieer de kant-en-klare configuratie voor jouw AI assistent of ontwikkelomgeving:</span>
                </div>
                <div className="setting-control-group">
                  {(['claude', 'antigravity', 'cursor', 'cli'] as const).map(client => (
                    <button
                      key={client}
                      type="button"
                      className={`setting-chip ${selectedMcpClient === client ? 'active' : ''}`}
                      onClick={() => setSelectedMcpClient(client)}
                    >
                      {client === 'claude' ? 'Claude Desktop' : client === 'antigravity' ? 'Antigravity / Gemini' : client === 'cursor' ? 'Cursor / VS Code' : 'Universele CLI'}
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
                        <span style={{ color: '#10B981' }}>Gekopieerd!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={12} />
                        <span>Kopieer</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Best practices note */}
              <div className="setting-item" style={{ marginTop: '4px' }}>
                <div className="setting-info">
                  <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>💡 Aanbevolen AI Tags &amp; Workflows</label>
                  <span className="setting-description" style={{ fontSize: '11px', lineHeight: '1.5' }}>
                    Gebruik tags zoals <code style={{ color: 'var(--accent-color)' }}>#todo</code>, <code style={{ color: 'var(--accent-color)' }}>#agent-ready</code> of <code style={{ color: 'var(--accent-color)' }}>#concept</code> om taken en kennisblokken direct vindbaar te maken voor agents. Vraag een agent om <code style={{ color: 'var(--accent-color)' }}>get_or_create_daily_plan</code> aan te roepen voor een overzichtelijke dagplanning.
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
                <span>Standaardwaarden herstellen</span>
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: '#ef4444' }}>Zeker weten?</span>
                <button className="danger-button" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={handleReset}>
                  Ja, herstel
                </button>
                <button
                  className="secondary-button"
                  style={{ padding: '4px 8px', fontSize: '12px' }}
                  onClick={() => setShowResetConfirm(false)}
                >
                  Annuleren
                </button>
              </div>
            )}
          </div>

          <button className="primary-button" onClick={onClose}>
            Sluiten
          </button>
        </div>
      </div>
    </div>
  );
};
