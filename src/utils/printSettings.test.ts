import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import {
  DEFAULT_BLOCK_PRINT_SETTINGS,
  PRINT_SETTINGS_DB_KEY,
  PRINT_SETTINGS_STORAGE_KEY,
  getStoredPrintSettingsSync,
  loadStoredPrintSettings,
  saveStoredPrintSettings,
  type BlockPrintSettings
} from './printDocument';

class MockStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

describe('printSettings persistence', () => {
  let mockStorage: MockStorage;

  beforeEach(async () => {
    mockStorage = new MockStorage();
    (globalThis as any).window = {
      localStorage: mockStorage
    };
    (globalThis as any).localStorage = mockStorage;
    await db.settings.clear();
  });

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).localStorage;
  });

  it('returns default settings when storage is empty', () => {
    const settings = getStoredPrintSettingsSync();
    expect(settings).toEqual(DEFAULT_BLOCK_PRINT_SETTINGS);
  });

  it('reads synchronous settings from localStorage and normalizes corrupted data', () => {
    localStorage.setItem(PRINT_SETTINGS_STORAGE_KEY, JSON.stringify({
      pageSize: 'A5',
      fontSize: 99, // invalid, should default to 11
      margin: 'compact',
      pageBreakPerBlock: false,
      headerStyle: 'none'
    }));

    const settings = getStoredPrintSettingsSync();
    expect(settings).toEqual({
      pageSize: 'A5',
      font: 'serif',
      fontSize: 11,
      margin: 'compact',
      pageBreakPerBlock: false,
      pageNumbers: true,
      headerStyle: 'none',
      headerAlignment: 'left',
      headerDivider: false
    });
  });

  it('falls back to defaults when localStorage contains invalid JSON', () => {
    localStorage.setItem(PRINT_SETTINGS_STORAGE_KEY, 'not-valid-json{{{');
    const settings = getStoredPrintSettingsSync();
    expect(settings).toEqual(DEFAULT_BLOCK_PRINT_SETTINGS);
  });

  it('saves settings to both localStorage and Dexie settings table', async () => {
    const customSettings: BlockPrintSettings = {
      pageSize: 'A5',
      font: 'sans',
      fontSize: 13,
      margin: 'wide',
      pageBreakPerBlock: false,
      pageNumbers: false,
      headerStyle: 'compact',
      headerAlignment: 'center',
      headerDivider: true
    };

    const saved = await saveStoredPrintSettings(customSettings);
    expect(saved).toEqual(customSettings);

    const storedInLocal = localStorage.getItem(PRINT_SETTINGS_STORAGE_KEY);
    expect(storedInLocal).not.toBeNull();
    expect(JSON.parse(storedInLocal!)).toEqual(customSettings);

    const storedInDb = await db.settings.get(PRINT_SETTINGS_DB_KEY);
    expect(storedInDb?.value).toEqual(customSettings);
  });

  it('loads stored print settings from db and updates localStorage if present', async () => {
    const dbSettings: BlockPrintSettings = {
      pageSize: 'A5',
      font: 'sans',
      fontSize: 14,
      margin: 'compact',
      pageBreakPerBlock: true,
      pageNumbers: true,
      headerStyle: 'title',
      headerAlignment: 'left',
      headerDivider: false
    };

    await db.settings.put({ key: PRINT_SETTINGS_DB_KEY, value: dbSettings });
    // localStorage is empty initially
    expect(localStorage.getItem(PRINT_SETTINGS_STORAGE_KEY)).toBeNull();

    const loaded = await loadStoredPrintSettings();
    expect(loaded).toEqual(dbSettings);

    // localStorage should have been synced
    const syncedLocal = JSON.parse(localStorage.getItem(PRINT_SETTINGS_STORAGE_KEY)!);
    expect(syncedLocal).toEqual(dbSettings);
  });

  it('loads from legacy storage key in db if present', async () => {
    const legacySettings: BlockPrintSettings = {
      pageSize: 'A4',
      font: 'sans',
      fontSize: 12,
      margin: 'normal',
      pageBreakPerBlock: false,
      pageNumbers: false,
      headerStyle: 'full',
      headerAlignment: 'center',
      headerDivider: true
    };

    await db.settings.put({ key: PRINT_SETTINGS_STORAGE_KEY, value: legacySettings });
    const loaded = await loadStoredPrintSettings();
    expect(loaded).toEqual(legacySettings);
  });
});
