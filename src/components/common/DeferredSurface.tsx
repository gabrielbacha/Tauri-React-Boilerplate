import { Component, Suspense, useEffect, useState, type ReactNode } from "react";

class SurfaceBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div role="alert" className="p-4">
        This view could not load. <button onClick={() => window.location.reload()}>Reload window</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
/** Keep an opened dialog mounted so its close animation and focus restoration finish. */
export default function DeferredSurface({ active = true, children }: { active?: boolean; children: ReactNode }) {
  const [loaded, setLoaded] = useState(active);
  useEffect(() => {
    if (active) setLoaded(true);
  }, [active]);
  if (!active && !loaded) return null;
  return (
    <SurfaceBoundary>
      <Suspense
        fallback={
          <div role="status" className="p-4">
            Loading…
          </div>
        }
      >
        {children}
      </Suspense>
    </SurfaceBoundary>
  );
}
