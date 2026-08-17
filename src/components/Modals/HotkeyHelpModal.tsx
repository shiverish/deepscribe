import React, { useEffect } from 'react';
import { X, Command } from 'lucide-react';

interface HotkeyHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HotkeyHelpModal: React.FC<HotkeyHelpModalProps> = ({ isOpen, onClose }) => {
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

  const shortcuts = [
    { key: '↑ / ↓', desc: 'Verticaal navigeren door kaarten in de actieve kolom' },
    { key: 'Enter', desc: 'Titel bewerken (nogmaals Enter = door naar tekstinhoud)' },
    { key: 'Escape', desc: 'Bewerken stoppen & terugkeren naar kaartnavigatie' },
    { key: 'Shift + →', desc: 'Nieuw kind-blok (subblok) toevoegen aan gekozen blok' },
    { key: 'Shift + ↓ / Shift + N', desc: 'Nieuw tekstblok toevoegen aan actieve niveau' },
    { key: 'Delete / Backspace', desc: 'Geselecteerd blok verplaatsen naar prullenbak' },
    { key: '→', desc: 'Volgende niveau / kind-blokken openen' },
    { key: '←', desc: 'Terugnavigeren naar de bovenliggende kolom' },
    { key: 'Ctrl + K', desc: 'Globale zoekfunctie openen (titel, inhoud & tags)' },
    { key: 'Ctrl + D', desc: 'Geselecteerd blok + onderliggende tak dupliceren' },
    { key: 'Ctrl + 1 / 2 / 3', desc: 'Wissel weergave (Columns / Graph / Stats)' },
    { key: 'Ctrl + Shift + E', desc: 'Vast schrijfpaneel in- of inklappen' },
    { key: 'Shift + ?', desc: 'Dit sneltoetsenoverzicht openen' },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(7, 10, 18, 0.8)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '500px',
          maxWidth: '90vw',
          background: 'var(--bg-surface)',
          backdropFilter: 'var(--glass-backdrop)',
          border: '1px solid var(--neon-cyan)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 0 30px rgba(0, 240, 255, 0.2)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(10, 15, 26, 0.8)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '1rem', fontWeight: 600 }}>
            <Command size={18} color="#00F0FF" />
            <span>Sneltoetsen Overzicht</span>
          </div>

          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shortcuts.map((item, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-subtle)'
              }}
            >
              <span style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>{item.desc}</span>
              <kbd>{item.key}</kbd>
            </div>
          ))}
        </div>

        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border-subtle)',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            textAlign: 'center',
            background: 'rgba(10, 15, 26, 0.8)'
          }}
        >
          Tip: Alle acties zijn ook via de muis en het contextmenu bereikbaar.
        </div>
      </div>
    </div>
  );
};
