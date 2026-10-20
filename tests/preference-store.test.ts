import { describe, expect, it } from 'vitest';
import {
  createPreferenceStore,
  type StorageLike,
} from '../src/renderer/state/preference-store';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const storage: StorageLike = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
  return { storage, values };
}

describe('persistência das preferências locais', () => {
  it('carrega e grava nome, menu e qualidade', () => {
    const { storage, values } = memoryStorage({
      'discorja.name': 'Luís',
      'discorja.sidebar-collapsed': 'true',
      'discorja.stream-preferences': JSON.stringify({
        preset: '1080p120',
        maxUploadMbps: 900,
        adaptive: false,
      }),
    });
    const store = createPreferenceStore(storage);

    expect(store.displayName()).toBe('Luís');
    expect(store.sidebarCollapsed()).toBe(true);
    expect(store.streamPreferences()).toMatchObject({
      preset: '1080p120',
      maxUploadMbps: 500,
      adaptive: false,
    });

    store.saveDisplayName('Ana');
    store.saveSidebarCollapsed(false);
    expect(values.get('discorja.name')).toBe('Ana');
    expect(values.get('discorja.sidebar-collapsed')).toBe('false');
  });

  it('usa padrões quando os dados estão inválidos e remove a preferência obsoleta', () => {
    const { storage, values } = memoryStorage({
      'discorja.rooms': '[{"code":"ABCDEFGH"}]',
      'discorja.stream-preferences': 'null}',
      'discorja.preview-economy': 'true',
    });
    const store = createPreferenceStore(storage);

    expect(store.streamPreferences()).toMatchObject({
      preset: '720p30',
      maxUploadMbps: 100,
      adaptive: true,
    });
    store.clearObsoletePreferences();
    expect(values.has('discorja.preview-economy')).toBe(false);
    expect(values.has('discorja.rooms')).toBe(false);
  });

  it('mantém a sessão funcional quando o armazenamento lança erros', () => {
    const unavailable: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const store = createPreferenceStore(unavailable);

    expect(store.displayName()).toBe('');
    expect(store.streamPreferences().preset).toBe('720p30');
    expect(() => {
      store.saveDisplayName('Ana');
      store.saveSidebarCollapsed(true);
      store.saveStreamPreferences(store.streamPreferences());
      store.clearObsoletePreferences();
    }).not.toThrow();
  });
});
