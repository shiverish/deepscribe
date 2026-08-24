import React, { useEffect } from 'react';
import { FileDown, Printer, X } from 'lucide-react';
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
  onExportPdf: () => void;
}

const PRESETS = [
  { key: 'a4Document', label: 'A4 document', description: '11 pt · normal margins' },
  { key: 'a5Book', label: 'A5 book', description: '11 pt · compact margins' },
  { key: 'largeText', label: 'Large text', description: '13 pt · compact margins' }
] as const;

export const PrintSettingsModal: React.FC<PrintSettingsModalProps> = ({
  isOpen,
  isPrinting,
  settings,
  onChange,
  onClose,
  onPrint,
  onExportPdf
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
            <h2 id="print-settings-title">Print Settings</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} disabled={isPrinting} title="Close" aria-label="Close print settings">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body print-settings-body">
          <section>
            <span className="print-settings-label">Quick Presets</span>
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
              <span className="print-settings-label">Paper Size</span>
              <select value={settings.pageSize} onChange={event => update('pageSize', event.target.value as PrintPageSize)}>
                <option value="A4">A4</option>
                <option value="A5">A5</option>
              </select>
            </label>
            <label>
              <span className="print-settings-label">Text Size</span>
              <select value={settings.fontSize} onChange={event => update('fontSize', Number(event.target.value) as PrintFontSize)}>
                {[10, 11, 12, 13, 14].map(size => <option key={size} value={size}>{size} pt</option>)}
              </select>
            </label>
            <label>
              <span className="print-settings-label">Margins</span>
              <select value={settings.margin} onChange={event => update('margin', event.target.value as PrintMargin)}>
                <option value="compact">Compact · 10 mm</option>
                <option value="normal">Normal · 16 mm</option>
                <option value="wide">Wide · 22 mm</option>
              </select>
            </label>
            <label>
              <span className="print-settings-label">Font</span>
              <select value={settings.font} onChange={event => update('font', event.target.value as PrintFont)}>
                <option value="serif">Book · Georgia</option>
                <option value="sans">Business · sans-serif</option>
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
              <strong>Start every block on a new page</strong>
              <small>Turn this off for one continuous document.</small>
            </span>
          </label>

          <label className="print-page-break-control">
            <input
              type="checkbox"
              checked={settings.pageNumbers}
              onChange={event => update('pageNumbers', event.target.checked)}
            />
            <span>
              <strong>Show page numbers</strong>
              <small>Adds page numbers to the bottom of each printed page.</small>
            </span>
          </label>

          <section>
            <span className="print-settings-label">Block Header</span>
            <div className="print-control-grid">
              <label>
                <span className="print-settings-label">Layout</span>
                <select value={settings.headerStyle} onChange={event => update('headerStyle', event.target.value as PrintHeaderStyle)}>
                  <option value="full">Full · project, path, and title</option>
                  <option value="compact">Compact · metadata on one line</option>
                  <option value="title">Block title only</option>
                  <option value="none">No header</option>
                </select>
              </label>
              <label>
                <span className="print-settings-label">Alignment</span>
                <select
                  value={settings.headerAlignment}
                  disabled={settings.headerStyle === 'none'}
                  onChange={event => update('headerAlignment', event.target.value as PrintHeaderAlignment)}
                >
                  <option value="left">Left</option>
                  <option value="center">Centered</option>
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
                <strong>Divider below the header</strong>
                <small>Adds a clear divider between the block title and its content.</small>
              </span>
            </label>
          </section>

          <div className="print-settings-summary">
            {settings.pageSize} · {settings.fontSize} pt · {settings.margin === 'compact' ? '10' : settings.margin === 'normal' ? '16' : '22'} mm · {settings.font === 'serif' ? 'Georgia' : 'sans-serif'} · {settings.pageNumbers ? 'page numbers' : 'no page numbers'} · {settings.headerStyle === 'full' ? 'full header' : settings.headerStyle === 'compact' ? 'compact header' : settings.headerStyle === 'title' ? 'title only' : 'no header'}
          </div>
        </div>

        <div className="modal-footer print-settings-footer">
          <button className="secondary-button" type="button" onClick={onClose} disabled={isPrinting}>Cancel</button>
          <button className="secondary-button" type="button" onClick={onExportPdf} disabled={isPrinting}>
            <FileDown size={14} />
            {isPrinting ? 'Exporting PDF…' : 'Export PDF'}
          </button>
          <button className="primary-button print-settings-submit" type="button" onClick={onPrint} disabled={isPrinting}>
            <Printer size={14} />
            {isPrinting ? 'Opening print dialog…' : 'Print'}
          </button>
        </div>
      </div>
    </div>
  );
};
