import {
  DEFAULT_STREAM_PREFERENCES,
  normalizePreferences,
  type StreamPreferences,
} from '../../shared/quality';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Keeps browser storage parsing and failures out of the renderer coordinator. */
export function createPreferenceStore(storage?: StorageLike) {
  const read = (key: string): string | null => {
    try {
      return storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };
  const write = (key: string, value: string): void => {
    try {
      storage?.setItem(key, value);
    } catch {
      /* Persistent preferences are optional; the current session continues. */
    }
  };

  return {
    displayName: () => read('discorja.name') ?? '',
    saveDisplayName: (name: string) => write('discorja.name', name),
    profilePhoto: () => {
      const photo = read('discorja.profile-photo');
      return photo &&
        photo.length <= 250_000 &&
        /^data:image\/(?:jpeg|png|webp);base64,/.test(photo)
        ? photo
        : '';
    },
    saveProfilePhoto: (photo: string) => {
      try {
        if (photo) storage?.setItem('discorja.profile-photo', photo);
        else storage?.removeItem('discorja.profile-photo');
      } catch {
        /* Profile pictures are optional; the current session continues. */
      }
    },
    sidebarCollapsed: () => read('discorja.sidebar-collapsed') === 'true',
    saveSidebarCollapsed: (collapsed: boolean) =>
      write('discorja.sidebar-collapsed', String(collapsed)),
    streamPreferences: (): StreamPreferences => {
      try {
        const saved = read('discorja.stream-preferences');
        return saved
          ? normalizePreferences(JSON.parse(saved))
          : { ...DEFAULT_STREAM_PREFERENCES };
      } catch {
        return { ...DEFAULT_STREAM_PREFERENCES };
      }
    },
    saveStreamPreferences: (preferences: StreamPreferences) =>
      write('discorja.stream-preferences', JSON.stringify(preferences)),
    clearObsoletePreferences: (): void => {
      try {
        storage?.removeItem('discorja.preview-economy');
        storage?.removeItem('discorja.rooms');
      } catch {
        /* Cleanup of removed preferences is best effort. */
      }
    },
  };
}
