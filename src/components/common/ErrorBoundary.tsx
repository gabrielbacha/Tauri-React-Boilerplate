import { Component, type ErrorInfo, type ReactNode } from "react";

import { Button } from "../ui/button";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  public state: State = { error: null };

  public static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  public componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Renderer error", error, info);
  }

  public render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-950 p-6 text-stone-100">
        <section className="w-full max-w-md rounded-2xl border border-stone-800 bg-stone-900 p-8 shadow-2xl">
          <p className="mb-2 text-xs font-semibold tracking-[0.2em] text-amber-400 uppercase">Renderer recovered</p>
          <h1 className="font-display text-3xl">Something interrupted the interface.</h1>
          <p className="mt-3 text-sm leading-6 text-stone-400">
            Reload the interface to recover. Unsaved edits may be lost. Exported files are unaffected.
          </p>
          {import.meta.env.DEV ? (
            <pre className="mt-4 max-h-28 overflow-auto rounded-lg bg-black/30 p-3 text-xs text-red-300">
              {this.state.error.message}
            </pre>
          ) : null}
          <div className="mt-6 flex gap-3">
            <Button onClick={() => window.location.reload()}>Reload window</Button>
            <Button variant="outline" onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
          </div>
        </section>
      </main>
    );
  }
}
