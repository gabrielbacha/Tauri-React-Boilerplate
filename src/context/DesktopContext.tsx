import { useLayoutEffect, createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import type { AppInfo, AppPreferences, BackgroundTask, PermissionStatus, UpdateState } from "@/shared/desktop-api";

import { acceptInterfacePreferences, initializeInterfacePreferences } from "../preferences/interface-preferences";

interface DesktopContextValue {
  appInfo: AppInfo | null;
  resolvedTheme: "light" | "dark";
  preferences: AppPreferences | null;
  updateState: UpdateState;
  permissions: PermissionStatus[];
  updatePreferences: (patch: Partial<AppPreferences>) => Promise<void>;
  checkForUpdates: () => Promise<void>;
}

const TasksContext = createContext<BackgroundTask[]>([]);

const DesktopContext = createContext<DesktopContextValue | null>(null);

export function DesktopProvider({ children }: { children: ReactNode }) {
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  );
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [preferences, setPreferences] = useState<AppPreferences | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState>({ status: "idle" });
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);
  const [permissions, setPermissions] = useState<PermissionStatus[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [initializationError, setInitializationError] = useState<Error | null>(null);
  const theme = preferences?.theme;

  useEffect(() => {
    let active = true;
    const received = { preferences: false, updates: false, tasks: false, permissions: false };
    const removePreferences = window.desktop.preferences.onChanged((next) => {
      if (!active) return;
      received.preferences = true;
      acceptInterfacePreferences(next);
      setPreferences(next);
    });
    const removeUpdates = window.desktop.updates.onStateChanged((next) => {
      if (!active) return;
      received.updates = true;
      setUpdateState(next);
    });
    const removeTasks = window.desktop.tasks.onChanged((next) => {
      if (!active) return;
      received.tasks = true;
      setTasks(next);
    });
    const removePermissions = window.desktop.permissions.onChanged((next) => {
      if (!active) return;
      received.permissions = true;
      setPermissions(next);
    });
    void Promise.all([
      window.desktop.app.getInfo(),
      initializeInterfacePreferences(),
      window.desktop.updates.getState(),
      window.desktop.tasks.list(),
      window.desktop.permissions.list(),
    ])
      .then(([info, savedPreferences, savedUpdateState, savedTasks, savedPermissions]) => {
        if (!active) return;
        setAppInfo(info);
        if (!received.preferences) {
          acceptInterfacePreferences(savedPreferences);
          setPreferences(savedPreferences);
        }
        if (!received.updates) setUpdateState(savedUpdateState);
        if (!received.tasks) setTasks(savedTasks);
        if (!received.permissions) setPermissions(savedPermissions);
        document.title = info.name;
        setInitialized(true);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setInitializationError(error instanceof Error ? error : new Error("Unable to initialize the desktop bridge."));
      });

    return () => {
      active = false;
      removePreferences();
      removeUpdates();
      removeTasks();
      removePermissions();
    };
  }, []);

  useLayoutEffect(() => {
    if (!theme) return undefined;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = (): void => {
      const dark = theme === "dark" || (theme === "system" && media.matches);
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
      setResolvedTheme(dark ? "dark" : "light");
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [theme]);

  const value = useMemo<DesktopContextValue>(
    () => ({
      appInfo,
      resolvedTheme,
      preferences,
      updateState,
      permissions,
      updatePreferences: async (patch) => {
        const updated = await window.desktop.preferences.update(patch);
        setPreferences(updated);
      },
      checkForUpdates: async () => {
        setUpdateState(await window.desktop.updates.check());
      },
    }),
    [appInfo, resolvedTheme, preferences, updateState, permissions],
  );

  if (initializationError) throw initializationError;

  if (!initialized || !preferences)
    return (
      <div role="status" className="p-6">
        Loading workspace…
      </div>
    );

  return (
    <DesktopContext.Provider value={value}>
      <TasksContext.Provider value={tasks}>{children}</TasksContext.Provider>
    </DesktopContext.Provider>
  );
}

export const useDesktop = (): DesktopContextValue => {
  const value = useContext(DesktopContext);
  if (!value) throw new Error("useDesktop must be used inside DesktopProvider.");
  return value;
};

export const useTasks = (): BackgroundTask[] => useContext(TasksContext);
