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

  it('defaults new UI layer colors when omitted in older settings', () => {
    const merged = mergeStoredSettings({ preset: 'sepia' });
    expect(merged.customSurfaceBgColor).toBe('#f4e6cc');
    expect(merged.customHeaderBgColor).toBe('#ebd9bc');
    expect(merged.customColumnHeaderBgColor).toBe('#e8d3b0');
    expect(merged.customCardBgColor).toBe('#eeddbe');
  });

  it('preserves custom UI layer colors when provided', () => {
    const merged = mergeStoredSettings({
      preset: 'custom',
      customHeaderBgColor: '#112233',
      customColumnHeaderBgColor: '#223344',
      customCardBgColor: '#334455',
      customSurfaceBgColor: '#445566'
    });
    expect(merged.customHeaderBgColor).toBe('#112233');
    expect(merged.customColumnHeaderBgColor).toBe('#223344');
    expect(merged.customCardBgColor).toBe('#334455');
    expect(merged.customSurfaceBgColor).toBe('#445566');
  });
});

