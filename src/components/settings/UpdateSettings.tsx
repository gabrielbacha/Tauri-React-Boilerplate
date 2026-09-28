import { useCallback, type ReactElement } from "react";

import { useDesktop } from "../../context/DesktopContext";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import { useFeedbackAction } from "../../hooks/useFeedbackAction";
import { RecoverableError } from "../common/ResourceState";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { SettingRow, SettingsSection } from "./SettingsPrimitives";

export default function UpdateSettings(): ReactElement | null {
  const { preferences, updatePreferences, updateState, checkForUpdates } = useDesktop();
  const { run, busy } = useFeedbackAction();
  const checkAction = useAsyncAction(
    useCallback(async () => {
      await checkForUpdates();
    }, [checkForUpdates]),
  );
  if (!preferences) return null;
  return (
    <SettingsSection title="Updates">
      <SettingRow
        settingId="automatic-checks"
        title="Automatic checks"
        description="Look for new releases when the app starts."
      >
        <Switch
          aria-label="Automatic update checks"
          disabled={busy}
          checked={preferences.checkForUpdatesAutomatically}
          onCheckedChange={(checked) =>
            void run("updates", () => updatePreferences({ checkForUpdatesAutomatically: checked }))
          }
        />
      </SettingRow>
      <SettingRow settingId="software-update" title="Software update" description={updateDescription(updateState)}>
        <Button
          size="sm"
          variant="outline"
          disabled={
            busy || checkAction.isRunning || updateState.status === "checking" || updateState.status === "downloading"
          }
          onClick={() =>
            updateState.status === "ready"
              ? void run("restart", () => window.desktop.updates.restart())
              : void checkAction.run()
          }
        >
          {updateState.status === "ready" ? "Restart to update" : checkAction.isRunning ? "Checking…" : "Check now"}
        </Button>
      </SettingRow>
      {checkAction.state === "error" || updateState.status === "error" ? (
        <RecoverableError message="Unable to check for updates." onRetry={() => void checkAction.run()} />
      ) : null}
    </SettingsSection>
  );
}

function updateDescription(state: { status: string; percent?: number | null; version?: string | null }): string {
  if (state.status === "ready") return `Version ${state.version ?? ""} is ready to install.`;
  if (state.status === "downloading") {
    return `Downloading${state.percent == null ? "…" : ` · ${Math.round(state.percent)}%`}`;
  }
  if (state.status === "checking") return "Checking for updates…";
  if (state.status === "error") return "The last update check failed.";
  return "Check for the latest available release.";
}
