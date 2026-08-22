import { describe, expect, it } from 'vitest';
import { DEFAULT_USER_SETTINGS } from '../types';
import { mergeStoredSettings } from './useSettings';

describe('settings compatibility', () => {
  it('adds the default alert color to settings saved by older versions', () => {
    const merged = mergeStoredSettings({ preset: 'vanilla', accentColor: '#123456' });
    expect(merged.agentAlertColor).toBe(DEFAULT_USER_SETTINGS.agentAlertColor);
    expect(merged.accentColor).toBe('#123456');
  });

  it('preserves a custom global alert color independently of the selected preset', () => {
    const merged = mergeStoredSettings({ preset: 'dracula', agentAlertColor: '#ff5500' });
    expect(merged.agentAlertColor).toBe('#ff5500');
  });

  it('defaults minimizeToTray to true when omitted', () => {
    const merged = mergeStoredSettings({ preset: 'vanilla' });
    expect(merged.minimizeToTray).toBe(true);
  });

  it('preserves an explicit minimizeToTray false setting', () => {
    const merged = mergeStoredSettings({ preset: 'vanilla', minimizeToTray: false });
    expect(merged.minimizeToTray).toBe(false);
  });
});
