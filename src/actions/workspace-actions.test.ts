import { describe, expect, it, vi } from "vitest";

import { createWorkspaceActions } from "./workspace-actions";

describe("workspace actions", () => {
  it("provides stable actions and shared shortcut bindings", () => {
    const handlers = {
      workspace: vi.fn<() => void>(),
      settings: vi.fn<() => void>(),
      toggleSidebar: vi.fn<() => void>(),
      toggleDetails: vi.fn<() => void>(),
      commandPalette: vi.fn<() => void>(),
    };
    const actions = createWorkspaceActions(handlers);
    actions.workspace.run();
    expect(handlers.workspace).toHaveBeenCalledOnce();
    expect(actions.toggleSidebar.label).toBe("Toggle sidebar");
  });
});
