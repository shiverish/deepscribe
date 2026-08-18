import React, { useEffect } from 'react';
import { Printer, X } from 'lucide-react';
import {
  BLOCK_PRINT_PRESETS,
  type BlockPrintSettings,
  type PrintFont,
  type PrintFontSize,
  type PrintHeaderAlignment,
  type PrintHeaderStyle,
  type PrintMargin,
  type PrintPageSize
} from '../../utils/printDocument';

interface PrintSettingsModalProps {
  isOpen: boolean;
  isPrinting: boolean;
  settings: BlockPrintSettings;
  onChange: (settings: BlockPrintSettings) => void;
  onClose: () => void;
  onPrint: () => void;
}

const PRESETS = [
  { key: 'a4Document', label: 'A4 document', description: '11 pt · normale marges' },
  { key: 'a5Book', label: 'A5 boek', description: '11 pt · compacte marges' },
  { key: 'largeText', label: 'Grote letters', description: '13 pt · compacte marges' }
] as const;

export const PrintSettingsModal: React.FC<PrintSettingsModalProps> = ({
  isOpen,
  isPrinting,
  settings,
  onChange,
  onClose,
  onPrint
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isPrinting) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isPrinting, onClose]);

  if (!isOpen) return null;

  const update = <Key extends keyof BlockPrintSettings>(key: Key, value: BlockPrintSettings[Key]) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="modal-backdrop" onClick={isPrinting ? undefined : onClose}>
      <div className="modal-container print-settings-modal" role="dialog" aria-modal="true" aria-labelledby="print-settings-title" onClick={event => event.stopPropagation()}>
        <div className="modal-header">
          <div className="print-settings-title">
            <Printer size={19} className="modal-header-icon" />
            <h2 id="print-settings-title">Printinstellingen</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} disabled={isPrinting} title="Sluiten" aria-label="Printinstellingen sluiten">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body print-settings-body">
          <section>
            <span className="print-settings-label">Snelle keuze</span>
            <div className="print-preset-grid">
              {PRESETS.map(preset => {
                const presetSettings = BLOCK_PRINT_PRESETS[preset.key];
                const isActive = JSON.stringify(settings) === JSON.stringify(presetSettings);
                return (
                  <button
                    key={preset.key}
                    type="button"
                    className={`print-preset${isActive ? ' active' : ''}`}
                    onClick={() => onChange({ ...presetSettings })}
                  >
                    <strong>{preset.label}</strong>
                    <span>{preset.description}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="print-control-grid">
            <label>
              <span className="print-settings-label">Papierformaat</span>
              <select value={settings.pageSize} onChange={event => update('pageSize', event.target.value as PrintPageSize)}>
                <option value="A4">A4</option>
                <option value="A5">A5</option>
              </select>
            </label>
            <label>
              <span className="print-settings-label">Tekstgrootte</span>
              <select value={settings.fontSize} onChange={event => update('fontSize', Number(event.target.value) as PrintFontSize)}>
                {[10, 11, 12, 13, 14].map(size => <option key={size} value={size}>{size} pt</option>)}
              </select>
            </label>
            <label>
              <span className="print-settings-label">Marges</span>
              <select value={settings.margin} onChange={event => update('margin', event.target.value as PrintMargin)}>
                <option value="compact">Compact · 10 mm</option>
                <option value="normal">Normaal · 16 mm</option>
                <option value="wide">Ruim · 22 mm</option>
              </select>
            </label>
            <label>
              <span className="print-settings-label">Lettertype</span>
              <select value={settings.font} onChange={event => update('font', event.target.value as PrintFont)}>
                <option value="serif">Boek · Georgia</option>
                <option value="sans">Zakelijk · sans-serif</option>
              </select>
            </label>
          </section>

          <label className="print-page-break-control">
            <input
              type="checkbox"
              checked={settings.pageBreakPerBlock}
              onChange={event => update('pageBreakPerBlock', event.target.checked)}
            />
            <span>
              <strong>Ieder blok op een nieuwe pagina</strong>
              <small>Schakel dit uit voor een doorlopend document.</small>
            </span>
          </label>

          <section>
            <span className="print-settings-label">Blokheader</span>
            <div className="print-control-grid">
              <label>
                <span className="print-settings-label">Opmaak</span>
                <select value={settings.headerStyle} onChange={event => update('headerStyle', event.target.value as PrintHeaderStyle)}>
                  <option value="full">Uitgebreid · project, pad en titel</option>
                  <option value="compact">Compact · metadata op één regel</option>
                  <option value="title">Alleen bloktitel</option>
                  <option value="none">Geen header</option>
                </select>
              </label>
              <label>
                <span className="print-settings-label">Uitlijning</span>
                <select
                  value={settings.headerAlignment}
                  disabled={settings.headerStyle === 'none'}
                  onChange={event => update('headerAlignment', event.target.value as PrintHeaderAlignment)}
                >
                  <option value="left">Links</option>
                  <option value="center">Gecentreerd</option>
                </select>
              </label>
            </div>
            <label className={`print-page-break-control print-header-divider${settings.headerStyle === 'none' ? ' disabled' : ''}`}>
              <input
                type="checkbox"
                checked={settings.headerDivider}
                disabled={settings.headerStyle === 'none'}
                onChange={event => update('headerDivider', event.target.checked)}
              />
              <span>
                <strong>Scheidingslijn onder de header</strong>
                <small>Geeft de bloktitel een duidelijk einde vóór de inhoud.</small>
              </span>
            </label>
          </section>

          <div className="print-settings-summary">
            {settings.pageSize} · {settings.fontSize} pt · {settings.margin === 'compact' ? '10' : settings.margin === 'normal' ? '16' : '22'} mm · {settings.font === 'serif' ? 'Georgia' : 'sans-serif'} · {settings.headerStyle === 'full' ? 'uitgebreide header' : settings.headerStyle === 'compact' ? 'compacte header' : settings.headerStyle === 'title' ? 'alleen titel' : 'geen header'}
          </div>
        </div>

        <div className="modal-footer print-settings-footer">
          <button className="secondary-button" type="button" onClick={onClose} disabled={isPrinting}>Annuleren</button>
          <button className="primary-button print-settings-submit" type="button" onClick={onPrint} disabled={isPrinting}>
            <Printer size={14} />
            {isPrinting ? 'Printdialoog openen…' : 'Printen'}
          </button>
        </div>
      </div>
    </div>
  );
};
