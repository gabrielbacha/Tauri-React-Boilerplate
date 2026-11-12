// @vitest-environment jsdom
import { expect, it, vi } from "vitest";

import { collectDisposers, DisposableScope } from "./disposable-scope";

it("closes successful registrations on failure and closes late registrations", async () => {
  const first = vi.fn<() => void>();
  const late = vi.fn<() => void>();
  let finish!: (dispose: () => void) => void;
  let reject!: (error: Error) => void;
  const pending = collectDisposers([
    Promise.resolve(first),
    new Promise((_, fail) => {
      reject = fail;
    }),
    new Promise((done) => {
      finish = done;
    }),
  ]);
  await Promise.resolve();
  reject(new Error("registration failed"));
  await expect(pending).rejects.toThrow("registration failed");
  expect(first).toHaveBeenCalledTimes(1);
  finish(late);
  await Promise.resolve();
  expect(late).toHaveBeenCalledTimes(1);
});

it("closes an unfinished registration when its owner unmounts", async () => {
  const scope = new DisposableScope();
  const late = vi.fn<() => void>();
  let finish!: (dispose: () => void) => void;
  const pending = collectDisposers(
    [
      new Promise((done) => {
        finish = done;
      }),
    ],
    scope,
  );
  scope.dispose();
  finish(late);
  const dispose = await pending;
  dispose();
  expect(late).toHaveBeenCalledTimes(1);
});

it("continues cleanup if one native unlistener throws", () => {
  const scope = new DisposableScope();
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  const next = vi.fn<() => void>();
  scope.add(() => {
    throw new Error("native failure");
  });
  scope.add(next);
  scope.dispose();
  scope.dispose();
  expect(next).toHaveBeenCalledTimes(1);
  warning.mockRestore();
});
