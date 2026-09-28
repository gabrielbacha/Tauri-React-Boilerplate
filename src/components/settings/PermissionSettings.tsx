import { useState, type ReactElement } from "react";

import type { PermissionCapability } from "@/shared/desktop-api";

import { useDesktop } from "../../context/DesktopContext";
import { useFeedbackAction } from "../../hooks/useFeedbackAction";
import MediaPermissionActions from "../layout/MediaPermissionActions";
import { Button } from "../ui/button";
import { SettingsSection } from "./SettingsPrimitives";

export default function PermissionSettings(): ReactElement {
  const { permissions } = useDesktop();
  const { run, pending } = useFeedbackAction();
  const [mediaBusy, setMediaBusy] = useState(false);
  const busy = pending !== null || mediaBusy;
  const resetPermission = (capability: PermissionCapability): void => {
    void run(capability, () => window.desktop.permissions.reset(capability), "Permission decision reset");
  };

  return (
    <SettingsSection
      title="Permissions"
      action={
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || permissions.every((permission) => permission.decision === "prompt")}
          onClick={() =>
            void run("permissions", () => window.desktop.permissions.reset(), "Permission decisions reset")
          }
        >
          Reset all
        </Button>
      }
    >
      {permissions.map((permission) => (
        <div
          key={permission.capability}
          id={`setting-${permission.capability}`}
          tabIndex={-1}
          className="permission-row"
          role="group"
          aria-labelledby={`permission-${permission.capability}`}
        >
          <div className="permission-details">
            <h3 id={`permission-${permission.capability}`}>{capitalize(permission.capability)}</h3>
            <p>In this app · {permissionDescription(permission.decision)}</p>
          </div>
          <MediaPermissionActions permission={permission} disabled={busy} onBusyChange={setMediaBusy}>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || permission.decision === "prompt"}
              onClick={() => resetPermission(permission.capability)}
            >
              {pending === permission.capability ? "Resetting…" : "Reset"}
            </Button>
          </MediaPermissionActions>
        </div>
      ))}
      <p className="permission-note">
        Reset clears this app’s decisions only. Device tests briefly access your camera or microphone, then stop
        immediately.
      </p>
    </SettingsSection>
  );
}

function capitalize(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function permissionDescription(decision: string): string {
  return (
    {
      prompt: "Ask when needed",
      session: "Allowed for this session",
      always: "Always allowed",
      denied: "Access blocked",
    }[decision] ?? decision
  );
}
