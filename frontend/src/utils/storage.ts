import { Platform } from 'react-native';

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const memory = new Map<string, string>();

const memoryStore: KeyValueStore = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => {
    memory.set(key, value);
  },
  removeItem: (key) => {
    memory.delete(key);
  },
};

/** localStorage on web (survives a browser refresh); in memory elsewhere, so no storage dependency is needed. */
function store(): KeyValueStore {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    return localStorage;
  }
  return memoryStore;
}

export function loadJson(key: string): unknown {
  try {
    const raw = store().getItem(key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function saveJson(key: string, value: unknown): void {
  try {
    store().setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or disabled: the state still works for this page load.
  }
}

export function removeStored(key: string): void {
  try {
    store().removeItem(key);
  } catch {
    // See saveJson.
  }
}

/** Test helper: forgets everything kept in the in-memory store. */
export function clearMemoryStore(): void {
  memory.clear();
}
