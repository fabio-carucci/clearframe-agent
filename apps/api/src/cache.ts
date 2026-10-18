/**
 * Memoizes an async loader for `ttlMs`. A rejected load is dropped at once, so the next call
 * retries instead of failing for the rest of the container's life.
 */
export function cachedFor<T>(ttlMs: number, load: () => Promise<T>, now = Date.now) {
  let entry: { value: Promise<T>; loadedAt: number } | undefined;
  return (): Promise<T> => {
    if (!entry || now() - entry.loadedAt > ttlMs) {
      const value = load().catch((error: unknown) => {
        entry = undefined;
        throw error;
      });
      entry = { value, loadedAt: now() };
    }
    return entry.value;
  };
}
