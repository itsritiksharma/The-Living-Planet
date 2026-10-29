/** Storage that never throws (private windows and blocked storage simply behave as empty). */
export interface SafeStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export function browserSessionStorage(): SafeStorage {
  const resolve = (): Storage | null => {
    try {
      return typeof window !== 'undefined' ? window.sessionStorage : null;
    } catch {
      return null;
    }
  };
  return {
    get(key) {
      try {
        return resolve()?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        resolve()?.setItem(key, value);
      } catch {
        // Storage unavailable or full: the session simply will not survive a reload.
      }
    },
    remove(key) {
      try {
        resolve()?.removeItem(key);
      } catch {
        // ignore
      }
    },
  };
}

export function memoryStorage(): SafeStorage {
  const values = new Map<string, string>();
  return {
    get: (key) => values.get(key) ?? null,
    set: (key, value) => void values.set(key, value),
    remove: (key) => void values.delete(key),
  };
}
