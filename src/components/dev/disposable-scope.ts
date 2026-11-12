/** A setup can fail or be closed before native registrations finish. */
export class DisposableScope {
  closed = false;
  private disposers = new Set<() => void>();

  add(dispose: () => void): void {
    if (this.closed) this.closeListener(dispose);
    else this.disposers.add(dispose);
  }

  private closeListener(dispose: () => void): void {
    try {
      // Tauri unlisteners return promises, although effects use void disposers.
      const result: unknown = dispose();
      void Promise.resolve(result).catch((error) => console.warn("Listener cleanup failed", error));
    } catch (error) {
      console.warn("Listener cleanup failed", error);
    }
  }

  dispose = (): void => {
    if (this.closed) return;
    this.closed = true;
    const disposers = [...this.disposers];
    this.disposers.clear();
    for (const dispose of disposers) {
      this.closeListener(dispose);
    }
  };
}

export async function collectDisposers(
  registrations: Promise<() => void>[],
  scope = new DisposableScope(),
): Promise<() => void> {
  try {
    await Promise.all(registrations.map(async (registration) => scope.add(await registration)));
    return scope.dispose;
  } catch (error) {
    scope.dispose();
    throw error;
  }
}
