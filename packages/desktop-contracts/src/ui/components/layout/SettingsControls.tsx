import { LoadingState } from "@desktop/components/common/ResourceState";
import AdvancedSettings from "@desktop/components/settings/AdvancedSettings";
import AppearanceSettings from "@desktop/components/settings/AppearanceSettings";
import PermissionSettings from "@desktop/components/settings/PermissionSettings";
import UpdateSettings from "@desktop/components/settings/UpdateSettings";
import { useDesktop } from "@desktop/context/DesktopContext";
import { CATEGORY_LABELS, focusSetting, type SettingsCategory } from "@desktop/settings/settings-navigation";
import { useEffect } from "react";

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
