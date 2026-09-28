import type { BackgroundTask } from "./desktop-api";

type TaskStatus = Pick<BackgroundTask, "status">;

export function isActiveTask(task: TaskStatus): boolean {
  return task.status === "queued" || task.status === "running";
}

export function isCompletedTask(task: TaskStatus): boolean {
  return task.status === "completed";
}
