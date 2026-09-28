import { useEffect } from "react";

import { useDesktop } from "../../context/DesktopContext";
import { CATEGORY_LABELS, focusSetting, type SettingsCategory } from "../../settings/settings-navigation";
import { LoadingState } from "../common/ResourceState";
import AdvancedSettings from "../settings/AdvancedSettings";
import AppearanceSettings from "../settings/AppearanceSettings";
import PermissionSettings from "../settings/PermissionSettings";
import UpdateSettings from "../settings/UpdateSettings";

export default function SettingsControls({
  section,
  setting,
  embedded = false,
}: {
  section: SettingsCategory;
  setting?: string;
  embedded?: boolean;
}) {
  useEffect(() => {
    if (setting) {
      const frame = requestAnimationFrame(() => focusSetting(setting));
      return () => cancelAnimationFrame(frame);
    }
    if (!embedded) document.querySelector(".settings-view")?.scrollTo(0, 0);
  }, [section, setting, embedded]);
  const { preferences } = useDesktop();
  if (!preferences) {
    return (
      <div className={embedded ? "embedded-settings" : "settings-view"}>
        <LoadingState label="Loading preferences…" />
      </div>
    );
  }
  return (
    <div className={embedded ? "embedded-settings" : "settings-view"}>
      {!embedded ? (
        <header className="settings-heading">
          <h1>{CATEGORY_LABELS[section]}</h1>
          <p>
            {
              {
                appearance: "Choose how the app looks and moves.",
                updates: "Manage software updates and automatic checks.",
                permissions: "Control access to notifications, camera, and microphone.",
                shortcuts: "Customize keyboard shortcuts.",
                advanced: "Inspect diagnostics and recover your workspace.",
              }[section]
            }
          </p>
        </header>
      ) : null}

      {section === "appearance" ? <AppearanceSettings /> : null}
      {section === "updates" ? <UpdateSettings /> : null}
      {section === "permissions" ? <PermissionSettings /> : null}
      {section === "advanced" ? <AdvancedSettings /> : null}
    </div>
  );
}
