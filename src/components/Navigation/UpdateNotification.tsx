import React, { useState, useEffect } from 'react';
import { ArrowUpCircle, Download, RefreshCw, X, Sparkles } from 'lucide-react';

export interface UpdaterState {
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

interface UpdateNotificationProps {
  updaterState: UpdaterState | null;
  onInstall: () => void;
  onCheckUpdates?: () => void;
}

export const UpdateNotification: React.FC<UpdateNotificationProps> = ({
  updaterState,
  onInstall
}) => {
  const [isDismissed, setIsDismissed] = useState(false);
  const [lastVersionPrompted, setLastVersionPrompted] = useState<string | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);

  // If a new version is downloaded or status transitions to downloaded, reset dismissal
  useEffect(() => {
    if (!updaterState) return;
    if (updaterState.status === 'downloaded' && updaterState.availableVersion) {
      if (lastVersionPrompted !== updaterState.availableVersion) {
        setIsDismissed(false);
        setLastVersionPrompted(updaterState.availableVersion);
      }
    }
  }, [updaterState, lastVersionPrompted]);

  if (!updaterState || isDismissed) return null;

  const { status, availableVersion, progress } = updaterState;

  // Only display notification for active update operations
  if (status !== 'downloading' && status !== 'downloaded' && status !== 'available') {
    return null;
  }

  const handleInstall = async () => {
    setIsInstalling(true);
    try {
      await onInstall();
    } catch {
      setIsInstalling(false);
    }
  };

  return (
    <div
      className="update-notification-toast"
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 999,
        maxWidth: '380px',
        width: 'calc(100vw - 48px)',
        background: 'var(--bg-surface, #1e1d1b)',
        backdropFilter: 'var(--glass-backdrop, blur(16px))',
        border: '1px solid var(--border-neon-cyan, rgba(59, 130, 246, 0.4))',
        borderRadius: 'var(--radius-lg, 12px)',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.45), 0 0 20px rgba(var(--atmosphere-rgb, 59, 130, 246), 0.2)',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        color: 'var(--text-primary, #faf6ee)',
        animation: 'slideUpFade 0.3s ease-out'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: status === 'downloaded'
                ? 'rgba(16, 185, 129, 0.18)'
                : 'rgba(59, 130, 246, 0.18)',
              border: status === 'downloaded'
                ? '1px solid rgba(16, 185, 129, 0.4)'
                : '1px solid rgba(59, 130, 246, 0.4)',
              color: status === 'downloaded' ? '#10B981' : '#60A5FA',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            {status === 'downloaded' ? (
              <Sparkles size={18} />
            ) : (
              <Download size={18} />
            )}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', lineHeight: 1.2 }}>
              {status === 'downloaded'
                ? `Update v${availableVersion || ''} Ready`
                : status === 'downloading'
                ? `Downloading v${availableVersion || ''}`
                : `Update v${availableVersion || ''} Available`}
            </div>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary, #a8a29e)', marginTop: '2px' }}>
              {status === 'downloaded'
                ? 'Restart DeepScribe now to apply the latest update.'
                : status === 'downloading'
                ? `Downloading in background${progress?.percent != null ? ` (${progress.percent}%)` : ''}...`
                : 'A new version of DeepScribe is ready to download.'}
            </div>
          </div>
        </div>

        <button
          type="button"
          className="icon-button"
          onClick={() => setIsDismissed(true)}
          title="Dismiss for now"
          aria-label="Dismiss update notification"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary, #a8a29e)',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <X size={16} />
        </button>
      </div>

      {status === 'downloading' && progress && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${progress.percent}%`,
                height: '100%',
                background: 'var(--accent-color, #3b82f6)',
                transition: 'width 0.2s ease'
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-secondary, #a8a29e)' }}>
            <span>{progress.percent}% completed</span>
            {progress.bytesPerSecond > 0 && (
              <span>{(progress.bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s</span>
            )}
          </div>
        </div>
      )}

      {status === 'downloaded' && (
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setIsDismissed(true)}
            style={{
              padding: '6px 12px',
              fontSize: '0.78rem',
              borderRadius: '6px'
            }}
          >
            Later
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={isInstalling}
            onClick={handleInstall}
            style={{
              padding: '6px 14px',
              fontSize: '0.78rem',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#10B981',
              borderColor: '#10B981',
              color: '#ffffff',
              fontWeight: 600
            }}
          >
            {isInstalling ? (
              <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <ArrowUpCircle size={14} />
            )}
            <span>{isInstalling ? 'Restarting...' : 'Restart & Update'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
