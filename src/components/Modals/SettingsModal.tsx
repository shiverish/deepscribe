import React, { useState, useEffect } from 'react';
import { X, RotateCcw, Palette, Type, Sliders, Sparkles, Eye, Check } from 'lucide-react';
import type { UserSettings, ThemePreset, FontFamily, ContentWidth } from '../../types';
import { PRESET_PALETTES } from '../../hooks/useSettings';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: UserSettings;
  onUpdateSettings: (partial: Partial<UserSettings>) => void;
  onResetSettings: () => void;
}

type TabType = 'appearance' | 'editor' | 'general';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onResetSettings
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('appearance');
  const [showResetConfirm, setShowResetConfirm] = useState(false);

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

  if (!isOpen) return null;

  const handleReset = () => {
    onResetSettings();
    setShowResetConfirm(false);
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
                  <span className="setting-description">Selecteer of verfijn je eigen accent-, sfeer-, achtergrond- en tekstkleur</span>
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
