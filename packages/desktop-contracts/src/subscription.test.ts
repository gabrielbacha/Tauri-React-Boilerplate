import { expect, it, vi } from "vitest";

import { createAsyncSubscription } from "./subscription";
it("async host registration has one owner and late completion is released after unmount", async () => {
  let resolve!: (release: () => void) => void;
  const register = vi.fn<(callback: (event: string) => void) => Promise<() => void>>(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const owner = createAsyncSubscription(register);
  const listener = vi.fn<(event: string) => void>();
  const release = vi.fn<() => void>();
  const unsubscribe = owner.subscribe(listener);
  const ready = owner.ready();
  expect(register).toHaveBeenCalledOnce();
  unsubscribe();
  resolve(release);
  await ready;
  expect(release).toHaveBeenCalledOnce();
});

it("failed registration remains failed until a new owner is created", async () => {
  const register = vi
    .fn<(callback: (event: string) => void) => Promise<() => void>>()
    .mockRejectedValueOnce(new Error("registration"))
    .mockResolvedValue(() => {});
  const first = createAsyncSubscription(register);
  const unsubscribe = first.subscribe(() => {});
  await expect(first.ready()).rejects.toThrow("registration");
  await expect(first.ready()).rejects.toThrow("registration");
  expect(register).toHaveBeenCalledOnce();
  unsubscribe();
  const retry = createAsyncSubscription(register);
  const stop = retry.subscribe(() => {});
  await retry.ready();
  expect(register).toHaveBeenCalledTimes(2);
  stop();
});
