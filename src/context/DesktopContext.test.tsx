// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { BackgroundTask, DesktopApi } from "@/shared/desktop-api";

import { useInterfacePreferences } from "../preferences/interface-preferences";
import { DesktopProvider, useDesktop, useTasks } from "./DesktopContext";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.classList.remove("dark");
});
it("reacts to system appearance while keeping task events out of shell consumers", async () => {
  let themeChange = (): void => {};
  let taskChange: (tasks: BackgroundTask[]) => void = vi.fn<(tasks: BackgroundTask[]) => void>();
  const media = {
    matches: false,
    addEventListener: vi.fn<(type: string, listener: () => void) => void>((_type, listener) => {
      themeChange = listener;
    }),
    removeEventListener: vi.fn<(type: string, listener: () => void) => void>(),
  };
  vi.stubGlobal("matchMedia", () => media);
  const subscribe = (): (() => void) => () => {};
  window.desktop = {
    app: { getInfo: async () => ({ name: "Test", version: "1", protocol: "test" }) },
    preferences: {
      migrateInterface: async () => ({
        zoom: 1,
        motion: "system",
        theme: "system",
        sidebarCollapsed: false,
        checkForUpdatesAutomatically: false,
      }),
      onChanged: subscribe,
    },
    updates: { getState: async () => ({ status: "idle" }), onStateChanged: subscribe },
    permissions: { list: async () => [], onChanged: subscribe },
    tasks: {
      list: async () => [],
      onChanged: (fn: typeof taskChange) => {
        taskChange = fn;
        return () => {};
      },
    },
  } as unknown as DesktopApi;
  let shellRenders = 0;
  function Shell() {
    shellRenders++;
    const { resolvedTheme } = useDesktop();
    return <span>{resolvedTheme}</span>;
  }
  function Tasks() {
    const tasks = useTasks();
    return <span>Tasks: {tasks.length}</span>;
  }
  render(
    <DesktopProvider>
      <Shell />
      <Tasks />
    </DesktopProvider>,
  );
  await waitFor(() => expect(media.addEventListener).toHaveBeenCalled());
  const initialRenders = shellRenders;
  act(() => taskChange([{ id: "test" } as BackgroundTask]));
  expect(screen.getByText("Tasks: 1")).toBeTruthy();
  expect(shellRenders).toBe(initialRenders);
  act(() => {
    media.matches = true;
    themeChange();
  });
  expect(screen.getByText("dark")).toBeTruthy();
  expect(document.documentElement.classList.contains("dark")).toBe(true);
});

it("keeps newer subscription events when startup snapshots resolve late", async () => {
  const oldPreferences = {
    zoom: 1,
    motion: "system",
    theme: "light",
    sidebarCollapsed: false,
    checkForUpdatesAutomatically: false,
  } as const;
  const latestPreferences = { ...oldPreferences, zoom: 1.25, motion: "reduced", theme: "dark" } as const;
  let resolve!: (value: typeof oldPreferences) => void;
  const promise = new Promise<typeof oldPreferences>((done) => {
    resolve = done;
  });
  const initial = { promise, resolve };
  let preferencesChanged = (_value: typeof latestPreferences): void => {};
  let tasksChanged = (_value: BackgroundTask[]): void => {};
  let updatesChanged = (_value: { status: "checking" }): void => {};
  let permissionsChanged = (_value: { capability: string; decision: string }[]): void => {};
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn<() => void>(),
    removeEventListener: vi.fn<() => void>(),
  }));
  window.desktop = {
    app: { getInfo: async () => ({ name: "Test" }) },
    preferences: {
      migrateInterface: () => initial.promise,
      onChanged: (fn: typeof preferencesChanged) => {
        preferencesChanged = fn;
        return () => {};
      },
    },
    tasks: {
      list: async () => [],
      onChanged: (fn: typeof tasksChanged) => {
        tasksChanged = fn;
        return () => {};
      },
    },
    updates: {
      getState: async () => ({ status: "idle" }),
      onStateChanged: (fn: typeof updatesChanged) => {
        updatesChanged = fn;
        return () => {};
      },
    },
    permissions: {
      list: async () => [],
      onChanged: (fn: typeof permissionsChanged) => {
        permissionsChanged = fn;
        return () => {};
      },
    },
  } as unknown as DesktopApi;
  function State() {
    const { preferences, updateState, permissions } = useDesktop();
    const tasks = useTasks();
    const interfacePreferences = useInterfacePreferences();
    return <div>{JSON.stringify({ preferences, updateState, permissions, tasks, interfacePreferences })}</div>;
  }
  render(
    <DesktopProvider>
      <State />
    </DesktopProvider>,
  );
  act(() => {
    preferencesChanged(latestPreferences);
    tasksChanged([{ id: "new" } as BackgroundTask]);
    updatesChanged({ status: "checking" });
    permissionsChanged([{ capability: "camera", decision: "granted" }]);
  });
  expect(screen.getByRole("status").textContent).toBe("Loading workspace…");
  await act(async () => {
    initial.resolve(oldPreferences);
    await initial.promise;
  });
  const value = JSON.parse(screen.getByText(/interfacePreferences/).textContent!);
  expect(value.preferences).toEqual(latestPreferences);
  expect(value.interfacePreferences).toEqual({ zoom: 1.25, motion: "reduced" });
  expect(value.tasks).toEqual([{ id: "new" }]);
  expect(value.updateState).toEqual({ status: "checking" });
  expect(value.permissions).toEqual([{ capability: "camera", decision: "granted" }]);
});
