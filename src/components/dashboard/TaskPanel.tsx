import type { ReactElement } from "react";

import type { BackgroundTask } from "@/shared/desktop-api";
import { isCompletedTask } from "@/shared/tasks";

import { Button } from "../ui/button";
import DemoPanel from "./DemoPanel";
import { TaskRow } from "./TaskRow";

export default function TaskPanel({
  tasks,
  pending,
  run,
}: {
  tasks: BackgroundTask[];
  pending: boolean;
  run: (action: () => Promise<unknown>) => Promise<void>;
}): ReactElement {
  return (
    <DemoPanel
      title="Files & background tasks"
      description="Calculate a SHA-256 digest locally. Files stay on your device."
      wide
    >
      <div className="demo-actions">
        <Button size="sm" disabled={pending} onClick={() => void run(() => window.desktop.tasks.startFileHash())}>
          Choose file to hash
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !tasks.some(isCompletedTask)}
          onClick={() => void run(() => window.desktop.tasks.clearCompleted())}
        >
          Clear completed
        </Button>
        <span className="demo-note">
          {tasks.length} retained · {tasks.filter((task) => task.canCancel).length} active
        </span>
      </div>
      {tasks.length ? (
        <div className="task-feed" aria-label="File task activity">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
      ) : (
        <p className="demo-empty">Choose a file to see progress, cancellation, and digest comparison here.</p>
      )}
      <p className="demo-note">
        Jobs and recent results survive app restarts. Interrupted safe jobs restart from the beginning. With permission,
        completed tasks notify you while this window is unfocused.
      </p>
    </DemoPanel>
  );
}
