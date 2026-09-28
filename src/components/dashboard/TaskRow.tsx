import File from "lucide-react/dist/esm/icons/file.mjs";
import MoreHorizontal from "lucide-react/dist/esm/icons/more-horizontal.mjs";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw.mjs";
import Trash2 from "lucide-react/dist/esm/icons/trash-2.mjs";
import X from "lucide-react/dist/esm/icons/x.mjs";
import { useState, type ReactElement } from "react";
import { toast } from "sonner";

import type { BackgroundTask } from "@/shared/desktop-api";
import { isActiveTask } from "@/shared/tasks";

import { useAsyncAction } from "../../hooks/useAsyncAction";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Hint } from "../ui/tooltip";

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
};

export function TaskRow({ task }: { task: BackgroundTask }): ReactElement {
  const [compare, setCompare] = useState(false);
  const [expected, setExpected] = useState("");
  const { runAction, isRunning: pending } = useAsyncAction();
  const act = async (action: () => Promise<unknown>): Promise<void> => {
    await runAction(task.id, action, {
      onError: () => {
        toast.error("That task action could not be completed.");
      },
    });
  };
  const running = isActiveTask(task);
  const name = task.result?.fileName ?? task.title.replace(/^Hash /, "");
  return (
    <article id={`task-${task.id}`} className="task-feed-item" aria-busy={pending}>
      <div className="task-file-icon">
        <File aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate" title={name}>
              {name}
            </h2>
            <p>
              {task.message}
              {task.result ? ` · ${formatBytes(task.result.size)}` : ""}
            </p>
          </div>
          <span className="task-status" data-status={task.status}>
            {task.status}
          </span>
          <DropdownMenu>
            <Hint label="Task actions" side="top">
              <DropdownMenuTrigger asChild>
                <button type="button" className="task-menu-button" aria-label={`Actions for ${name}`}>
                  <MoreHorizontal aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
            </Hint>
            <DropdownMenuContent align="end" className="w-40">
              {task.result ? (
                <>
                  <DropdownMenuItem
                    disabled={pending}
                    onSelect={() =>
                      void act(async () => {
                        await window.desktop.tasks.copyDigest(task.id);
                        toast.success("SHA-256 copied");
                      })
                    }
                  >
                    Copy SHA-256
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setCompare((open) => !open)}>Compare digest</DropdownMenuItem>
                </>
              ) : null}
              {task.canCancel ? (
                <DropdownMenuItem
                  disabled={pending}
                  onSelect={() => void act(() => window.desktop.tasks.cancel(task.id))}
                >
                  <X /> Cancel
                </DropdownMenuItem>
              ) : null}
              {task.canRetry ? (
                <DropdownMenuItem
                  disabled={pending}
                  onSelect={() => void act(() => window.desktop.tasks.retry(task.id))}
                >
                  <RefreshCw /> Retry
                </DropdownMenuItem>
              ) : null}
              {!task.canCancel ? (
                <DropdownMenuItem
                  disabled={pending}
                  onSelect={() => void act(() => window.desktop.tasks.dismiss(task.id))}
                >
                  <Trash2 /> Dismiss
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {running ? (
          <div className="task-progress-row">
            <div
              role="progressbar"
              aria-label="File hash progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(task.progress * 100)}
              className="task-progress"
            >
              <span style={{ width: `${Math.round(task.progress * 100)}%` }} />
            </div>
            <span>{Math.round(task.progress * 100)}%</span>
          </div>
        ) : null}
        {task.result ? <code className="task-digest">{task.result.sha256}</code> : null}
        {compare && task.result ? (
          <div>
            <label>
              Expected SHA-256
              <input
                aria-label="Expected SHA-256"
                value={expected}
                onChange={(event) => setExpected(event.target.value)}
                maxLength={256}
                className="w-full"
              />
            </label>
            <p role="status">
              {!expected
                ? "Paste a digest to compare."
                : !/^[0-9a-f]{64}$/i.test(expected.trim())
                  ? "Enter 64 hexadecimal characters."
                  : expected.trim().toLowerCase() === task.result.sha256
                    ? "Digests match"
                    : "Digests do not match"}
            </p>
          </div>
        ) : null}
      </div>
    </article>
  );
}
