export interface BrowserStorageAccess {
  readonly available: boolean;
  getItem(key: string): string | null;
  setItem(key: string, value: string): boolean;
  removeItem(key: string): boolean;
}

export function createBrowserStorageAccess(
  acquire: () => Storage = () => window.localStorage,
): BrowserStorageAccess {
  let available = true;

  function storage(): Storage | null {
    if (!available) return null;
    try {
      return acquire();
    } catch {
      available = false;
      return null;
    }
  }

  return {
    get available() {
      return available;
    },
    getItem(key) {
      try {
        const target = storage();
        if (!target) return null;
        return target.getItem(key);
      } catch {
        available = false;
        return null;
      }
    },
    setItem(key, value) {
      try {
        const target = storage();
        if (!target) return false;
        target.setItem(key, value);
        return true;
      } catch {
        available = false;
        return false;
      }
    },
    removeItem(key) {
      try {
        const target = storage();
        if (!target) return false;
        target.removeItem(key);
        return true;
      } catch {
        available = false;
        return false;
      }
    },
  };
}
