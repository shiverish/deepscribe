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

  it('defaults both tray behaviours to true when omitted', () => {
    const merged = mergeStoredSettings({ preset: 'vanilla' });
    expect(merged.minimizeToTray).toBe(true);
    expect(merged.closeToTray).toBe(true);
  });

  /**
   * Minimizing and closing shared one switch before the split. What the user chose
   * there was a choice about both, so it has to carry over rather than silently
   * turning closing back on.
   */
  it('carries the old combined tray choice over to closing', () => {
    expect(mergeStoredSettings({ minimizeToTray: false }).closeToTray).toBe(false);
    expect(mergeStoredSettings({ minimizeToTray: false }).minimizeToTray).toBe(false);
    expect(mergeStoredSettings({ minimizeToTray: true }).closeToTray).toBe(true);
  });

  it('keeps the two tray behaviours independent once both are stored', () => {
    const merged = mergeStoredSettings({ minimizeToTray: false, closeToTray: true });
    expect(merged.minimizeToTray).toBe(false);
    expect(merged.closeToTray).toBe(true);

    const inverse = mergeStoredSettings({ minimizeToTray: true, closeToTray: false });
    expect(inverse.minimizeToTray).toBe(true);
    expect(inverse.closeToTray).toBe(false);
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

  it('defaults auto-start settings appropriately when omitted', () => {
    const merged = mergeStoredSettings({ preset: 'vanilla' });
    expect(merged.autoStartOnBoot).toBe(false);
    expect(merged.autoStartMinimized).toBe(true);
  });

  it('preserves custom auto-start settings when provided', () => {
    const merged = mergeStoredSettings({
      preset: 'vanilla',
      autoStartOnBoot: true,
      autoStartMinimized: false
    });
    expect(merged.autoStartOnBoot).toBe(true);
    expect(merged.autoStartMinimized).toBe(false);
  });
});


describe('startup view settings', () => {
  it('keeps opening the columns view for settings saved before the choice existed', () => {
    const merged = mergeStoredSettings({ preset: 'vanilla' });
    expect(merged.startupViewMode).toBe('fixed');
    expect(merged.startupView).toBe('columns');
    expect(merged.lastActiveView).toBe('columns');
  });

  it('keeps a stored startup view and mode', () => {
    const merged = mergeStoredSettings({ startupViewMode: 'last-used', startupView: 'stats', lastActiveView: 'tasks' });
    expect(merged.startupViewMode).toBe('last-used');
    expect(merged.startupView).toBe('stats');
    expect(merged.lastActiveView).toBe('tasks');
  });

  // The graph view was removed in 0.2.33; settings written before that can name it.
  it('drops a stored view that no longer exists', () => {
    const merged = mergeStoredSettings({ startupView: 'graph' as never, lastActiveView: 'graph' as never });
    expect(merged.startupView).toBe('columns');
    expect(merged.lastActiveView).toBe('columns');
  });

  it('ignores an unknown startup mode', () => {
    expect(mergeStoredSettings({ startupViewMode: 'whenever' as never }).startupViewMode).toBe('fixed');
  });
});
