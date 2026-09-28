// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAsyncAction } from "./useAsyncAction";

afterEach(cleanup);

function Harness({ action }: { action: () => Promise<string> }) {
  const asyncAction = useAsyncAction(action);
  return (
    <>
      <button onClick={() => void asyncAction.run()}>Run</button>
      <button onClick={asyncAction.reset}>Reset</button>
      <output>{asyncAction.state}</output>
    </>
  );
}

describe("useAsyncAction", () => {
  it("prevents duplicate execution while running", async () => {
    let resolve!: (value: string) => void;
    const action = vi.fn<() => Promise<string>>(() => new Promise<string>((done) => (resolve = done)));
    render(<Harness action={action} />);
    fireEvent.click(screen.getByText("Run"));
    fireEvent.click(screen.getByText("Run"));
    expect(action).toHaveBeenCalledTimes(1);
    expect(screen.getByText("running")).toBeTruthy();
    resolve("done");
    await waitFor(() => expect(screen.getByText("success")).toBeTruthy());
  });

  it("exposes recoverable errors and reset", async () => {
    render(<Harness action={() => Promise.reject(new Error("failed"))} />);
    fireEvent.click(screen.getByText("Run"));
    await waitFor(() => expect(screen.getByText("error")).toBeTruthy());
    fireEvent.click(screen.getByText("Reset"));
    expect(screen.getByText("idle")).toBeTruthy();
  });
});

it("distinguishes void success, errors, and same-tick duplicate suppression", async () => {
  const { result } = renderHook(() => useAsyncAction());
  let finish!: () => void;
  const operation = vi.fn<() => Promise<void>>(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const onSuccess = vi.fn<() => void>();
  const onError = vi.fn<(error: Error) => void>();
  await act(async () => {
    const first = result.current.runAction("reload", operation, { onSuccess, onError });
    expect(await result.current.runAction("reload", operation, { onSuccess, onError })).toEqual({
      status: "skipped",
    });
    finish();
    expect(await first).toEqual({ status: "success", value: undefined });
  });
  expect(operation).toHaveBeenCalledTimes(1);
  expect(onSuccess).toHaveBeenCalledTimes(1);
  expect(onError).not.toHaveBeenCalled();
  const failure = new Error("Reload failed");
  await act(async () => {
    const outcome = await result.current.runAction(
      "reload",
      async () => {
        throw failure;
      },
      { onError },
    );
    expect(outcome).toEqual({ status: "error", error: failure });
  });
  expect(onError).toHaveBeenCalledWith(failure);
  expect(result.current.pendingId).toBeNull();
});
