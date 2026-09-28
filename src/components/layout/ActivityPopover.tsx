import Bell from "lucide-react/dist/esm/icons/bell.mjs";
import CheckCircle2 from "lucide-react/dist/esm/icons/check-circle-2.mjs";
import Workflow from "lucide-react/dist/esm/icons/workflow.mjs";
import { useState, type ReactElement } from "react";
import { toast } from "sonner";

import { isActiveTask } from "@/shared/tasks";

import { useDesktop, useTasks } from "../../context/DesktopContext";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Hint } from "../ui/tooltip";

export default function ActivityPopover(): ReactElement {
  const { permissions, updateState } = useDesktop();
  const tasks = useTasks();
  const [requestingNotifications, setRequestingNotifications] = useState(false);
  const activeTasks = tasks.filter(isActiveTask);
  const notificationPermission = permissions.find((permission) => permission.capability === "notifications");
  const hasAttention = activeTasks.length > 0 || updateState.status === "ready";

  const enableNotifications = async (): Promise<void> => {
    setRequestingNotifications(true);
    try {
      const status = await window.desktop.permissions.request("notifications");
      if (status.decision === "session" || status.decision === "always") {
        void new Notification("Notifications are ready", {
          body: "Background work can now notify you when it finishes.",
        });
        toast.success("Notifications enabled");
      } else {
        toast.info("Notification access was not enabled.");
      }
    } catch {
      toast.error("Unable to request notification access.");
    } finally {
      setRequestingNotifications(false);
    }
  };

  return (
    <Popover>
      <Hint label="Notifications" side="bottom">
        <PopoverTrigger asChild>
          <button type="button" className="shell-icon-button" aria-label="Activity">
            <Bell aria-hidden="true" />
            {hasAttention ? <span className="notification-dot" /> : null}
          </button>
        </PopoverTrigger>
      </Hint>
      <PopoverContent align="end" side="bottom" className="activity-popover">
        <div className="px-1 pb-2">
          <h2 className="text-sm font-semibold">Activity</h2>
          <p className="mt-1 text-xs text-muted-foreground">Background work and updates</p>
        </div>
        <div className="activity-list">
          {activeTasks.length ? (
            activeTasks.slice(0, 3).map((task) => (
              <div key={task.id} className="activity-item">
                <Workflow aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{task.title.replace(/^Hash /, "")}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {Math.round(task.progress * 100)}% · {task.message}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="activity-item">
              <CheckCircle2 aria-hidden="true" />
              <div>
                <p className="text-xs font-medium">No active work</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Background tasks will appear here.</p>
              </div>
            </div>
          )}
          {updateState.status === "ready" ? (
            <div className="activity-item">
              <span className="activity-indicator" />
              <div>
                <p className="text-xs font-medium">Update ready</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Version {updateState.version} can be installed.</p>
              </div>
            </div>
          ) : null}
        </div>
        {notificationPermission?.decision === "prompt" || notificationPermission?.decision === "denied" ? (
          <button
            type="button"
            className="activity-action"
            disabled={requestingNotifications}
            onClick={() => void enableNotifications()}
          >
            {requestingNotifications ? "Requesting…" : "Enable desktop notifications"}
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
