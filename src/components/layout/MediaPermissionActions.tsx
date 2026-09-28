import { useEffect, useRef, useState, type ReactNode } from "react";

import type { PermissionStatus } from "@/shared/desktop-api";

import { Button } from "../ui/button";

export default function MediaPermissionActions({
  permission,
  disabled,
  onBusyChange,
  children,
}: {
  children?: ReactNode;
  permission: PermissionStatus;
  disabled: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const mounted = useRef(true);
  const pending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const granted = permission.decision === "session" || permission.decision === "always";
  async function run(): Promise<void> {
    if (pending.current) return;
    pending.current = true;
    onBusyChange?.(true);
    setBusy(true);
    setMessage("");
    try {
      const status = await window.desktop.permissions.request(permission.capability);
      if (status.decision !== "session" && status.decision !== "always") {
        if (mounted.current) setMessage("Access denied. Reset the app decision to request again.");
        return;
      }
      if (!mounted.current) return;
      if (permission.capability === "notifications") {
        setMessage("Application permission granted.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia(
        permission.capability === "camera" ? { video: true } : { audio: true },
      );
      try {
        if (mounted.current) setMessage("Device access verified. All tracks stopped; nothing recorded.");
      } finally {
        stream.getTracks().forEach((track) => track.stop());
      }
    } catch (error) {
      if (mounted.current)
        setMessage(
          error instanceof DOMException && error.name === "NotFoundError"
            ? "No device was found."
            : error instanceof DOMException && error.name === "NotAllowedError"
              ? "OS access is blocked. Review your system privacy settings; app Reset does not change OS permissions."
              : "Unable to access the device. Check OS permissions and whether another app is using it.",
        );
    } finally {
      pending.current = false;
      onBusyChange?.(false);
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div className="permission-controls">
      <div className="permission-actions">
        <Button
          size="sm"
          variant="outline"
          disabled={
            disabled ||
            busy ||
            permission.decision === "denied" ||
            (granted && permission.capability === "notifications")
          }
          onClick={() => void run()}
        >
          {busy ? "Checking…" : granted ? (permission.capability === "notifications" ? "Allowed" : "Test") : "Request"}
        </Button>
        {children}
      </div>
      {message ? (
        <p role="status" className="permission-feedback">
          {message}
        </p>
      ) : null}
    </div>
  );
}
