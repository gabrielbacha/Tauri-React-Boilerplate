/** Adapt an async host listener to the synchronous renderer subscription shape, with explicit readiness. */
export function createAsyncSubscription<T>(register: (callback: (event: T) => void) => Promise<() => void>): {
  subscribe: (listener: (event: T) => void) => () => void;
  ready: () => Promise<void>;
} {
  const listeners = new Set<(event: T) => void>();
  let pending: Promise<void> | null = null;
  let cleanup: (() => void) | null = null;
  const ready = (): Promise<void> => {
    if (!pending)
      pending = register((event) => {
        for (const listener of listeners) listener(event);
      }).then((release) => {
        if (listeners.size) cleanup = release;
        else {
          release();
          pending = null;
        }
      });
    return pending;
  };
  return {
    ready,
    subscribe(listener) {
      listeners.add(listener);
      void ready().catch(() => {}); // The owner awaits ready() and reports startup failure.
      return () => {
        listeners.delete(listener);
        if (!listeners.size && cleanup) {
          cleanup();
          cleanup = null;
          pending = null;
        }
      };
    },
  };
}
