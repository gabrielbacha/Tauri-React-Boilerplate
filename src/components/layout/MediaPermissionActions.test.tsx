// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { DesktopApi } from "@/shared/desktop-api";

import MediaPermissionActions from "./MediaPermissionActions";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("stops late media tracks after unmount", async () => {
  const stop = vi.fn<() => void>();
  let resolveStream: (stream: MediaStream) => void = () => {};
  const getUserMedia = vi.fn<() => Promise<MediaStream>>(
    () =>
      new Promise((resolve) => {
        resolveStream = resolve;
      }),
  );
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  window.desktop = {
    permissions: { request: async () => ({ capability: "camera", decision: "session" }) },
  } as unknown as DesktopApi;
  const view = render(
    <MediaPermissionActions permission={{ capability: "camera", decision: "session" }} disabled={false} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Test" }));
  await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
  view.unmount();
  await act(async () => resolveStream({ getTracks: () => [{ stop }] } as unknown as MediaStream));
  expect(stop).toHaveBeenCalledOnce();
});
it("explains when the operating system blocks the device", async () => {
  const getUserMedia = vi.fn<() => Promise<MediaStream>>(() =>
    Promise.reject(new DOMException("Permission denied", "NotAllowedError")),
  );
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  window.desktop = {
    permissions: { request: async () => ({ capability: "microphone", decision: "always" }) },
  } as unknown as DesktopApi;
  render(<MediaPermissionActions permission={{ capability: "microphone", decision: "always" }} disabled={false} />);
  fireEvent.click(screen.getByRole("button", { name: "Test" }));
  await screen.findByText(/OS access is blocked/);
  expect(getUserMedia).toHaveBeenCalledOnce();
});
