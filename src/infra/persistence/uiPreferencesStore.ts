/**
 * UI preferences — the ONLY legitimate use of localStorage in this app.
 *
 * Theme, zoom, snapping, the active tool and "last opened project" are small,
 * replaceable, non-authoritative values: losing them costs nothing and they are
 * never a source of truth for project content. Project data, media and asset
 * identity live in IndexedDB (ADR-006); anything durable that lands here is a
 * defect and the guard at the bottom of this file exists to catch it.
 */

export const UI_PREFERENCES_STORAGE_KEY = 'neuralpro:ui';

export interface UiPreferences {
  theme: 'dark' | 'light';
  timelineZoom: number;
  magneticSnapping: boolean;
  activeTool: 'select' | 'rate-stretch' | 'split';
  timelineEditMode: 'normal' | 'ripple' | 'overwrite';
  lastProjectId: string | null;
  lastProjectName: string | null;
}

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  theme: 'dark',
  timelineZoom: 1,
  magneticSnapping: true,
  activeTool: 'select',
  timelineEditMode: 'normal',
  lastProjectId: null,
  lastProjectName: null,
};

/** Values that must never be persisted here, even by accident. */
const FORBIDDEN_PREFERENCE_KEYS = ['tracks', 'clips', 'project', 'assets', 'document', 'state'] as const;

export interface UiPreferencesStore {
  read(): UiPreferences;
  write(patch: Partial<UiPreferences>): UiPreferences;
  clear(): void;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getLocalStorage(): StorageLike | null {
  try {
    const storage = (globalThis as { localStorage?: StorageLike }).localStorage;
    if (!storage || typeof storage.getItem !== 'function') return null;
    // Private modes expose localStorage but throw on access.
    storage.getItem(UI_PREFERENCES_STORAGE_KEY);
    return storage;
  } catch {
    return null;
  }
}

function normalize(raw: unknown): UiPreferences {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const zoom = Number(source.timelineZoom);
  return {
    theme: source.theme === 'light' ? 'light' : 'dark',
    // Any finite zoom is clamped into the supported range rather than discarded,
    // so a hand-edited or corrupted value cannot produce an unusable timeline.
    timelineZoom: Number.isFinite(zoom)
      ? Math.min(32, Math.max(0.05, zoom))
      : DEFAULT_UI_PREFERENCES.timelineZoom,
    magneticSnapping: source.magneticSnapping === undefined ? DEFAULT_UI_PREFERENCES.magneticSnapping : source.magneticSnapping === true,
    activeTool:
      source.activeTool === 'rate-stretch' || source.activeTool === 'split'
        ? source.activeTool
        : DEFAULT_UI_PREFERENCES.activeTool,
    timelineEditMode:
      source.timelineEditMode === 'ripple' || source.timelineEditMode === 'overwrite'
        ? source.timelineEditMode
        : DEFAULT_UI_PREFERENCES.timelineEditMode,
    lastProjectId: typeof source.lastProjectId === 'string' && source.lastProjectId.trim() !== '' ? source.lastProjectId : null,
    lastProjectName: typeof source.lastProjectName === 'string' && source.lastProjectName.trim() !== '' ? source.lastProjectName : null,
  };
}

/** Throws if a caller tries to smuggle project data into the preferences blob. */
export function assertPreferencesAreUiOnly(patch: Record<string, unknown>): void {
  for (const key of Object.keys(patch)) {
    if ((FORBIDDEN_PREFERENCE_KEYS as readonly string[]).includes(key)) {
      throw new Error(`Refusing to store "${key}" in localStorage: project data belongs in IndexedDB (ADR-006).`);
    }
  }
}

export function createUiPreferencesStore(storageOverride?: StorageLike | null): UiPreferencesStore {
  const storage = storageOverride === undefined ? getLocalStorage() : storageOverride;

  const read = (): UiPreferences => {
    if (!storage) return { ...DEFAULT_UI_PREFERENCES };
    try {
      const raw = storage.getItem(UI_PREFERENCES_STORAGE_KEY);
      if (!raw) return { ...DEFAULT_UI_PREFERENCES };
      return normalize(JSON.parse(raw));
    } catch {
      // A corrupt preference blob must never break the editor: reset it.
      try {
        storage.removeItem(UI_PREFERENCES_STORAGE_KEY);
      } catch {
        /* noop */
      }
      return { ...DEFAULT_UI_PREFERENCES };
    }
  };

  return {
    read,
    write(patch) {
      assertPreferencesAreUiOnly(patch);
      const next = { ...read(), ...patch };
      if (storage) {
        try {
          storage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Quota or a blocked storage: preferences are non-critical, keep going.
        }
      }
      return next;
    },
    clear() {
      if (!storage) return;
      try {
        storage.removeItem(UI_PREFERENCES_STORAGE_KEY);
      } catch {
        /* noop */
      }
    },
  };
}
