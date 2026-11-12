import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface DirtyRegistry {
  currentSources: () => string[];
  register: (source: string, dirty: boolean) => void;
  unregister: (source: string) => void;
}

// Two contexts: the registry never changes, so the many components that only register their own
// dirty state do not re-render each time some other source becomes dirty or clean.
const DirtyRegistryContext = createContext<DirtyRegistry | null>(null);
const DirtySourcesContext = createContext<string[] | null>(null);

export function DirtyStateProvider({ children }: { children: ReactNode }) {
  const registry = useRef(new Map<string, boolean>());
  const [sources, setSources] = useState<string[]>([]);

  const publish = useCallback(() => {
    setSources([...registry.current].filter(([, dirty]) => dirty).map(([source]) => source));
  }, []);
  const register = useCallback(
    (source: string, dirty: boolean) => {
      registry.current.set(source, dirty);
      publish();
    },
    [publish],
  );
  const unregister = useCallback(
    (source: string) => {
      registry.current.delete(source);
      publish();
    },
    [publish],
  );

  useEffect(() => {
    void window.desktop.lifecycle.setDirtyState({ sources });
  }, [sources]);

  const currentSources = useCallback(
    () => [...registry.current].filter(([, dirty]) => dirty).map(([source]) => source),
    [],
  );
  const registryValue = useMemo(
    () => ({ currentSources, register, unregister }),
    [currentSources, register, unregister],
  );
  return (
    <DirtyRegistryContext.Provider value={registryValue}>
      <DirtySourcesContext.Provider value={sources}>{children}</DirtySourcesContext.Provider>
    </DirtyRegistryContext.Provider>
  );
}

export const useDirtyRegistry = (): DirtyRegistry => {
  const context = useContext(DirtyRegistryContext);
  if (!context) throw new Error("useDirtyRegistry must be used inside DirtyStateProvider.");
  return context;
};

/** The sources with unsaved changes. Re-renders whenever that list changes. */
export const useDirtySources = (): string[] => {
  const context = useContext(DirtySourcesContext);
  if (!context) throw new Error("useDirtySources must be used inside DirtyStateProvider.");
  return context;
};

export const useDirtyState = (source: string, dirty: boolean): void => {
  const { register, unregister } = useDirtyRegistry();
  useLayoutEffect(() => {
    register(source, dirty);
    return () => unregister(source);
  }, [dirty, register, source, unregister]);
};
