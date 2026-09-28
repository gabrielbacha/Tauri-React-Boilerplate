import Monitor from "lucide-react/dist/esm/icons/monitor.mjs";
import Moon from "lucide-react/dist/esm/icons/moon.mjs";
import Sun from "lucide-react/dist/esm/icons/sun.mjs";
import type { ReactElement } from "react";

import type { ThemeMode } from "@/shared/desktop-api";

import { useDesktop } from "../../context/DesktopContext";
import { useFeedbackAction } from "../../hooks/useFeedbackAction";
import { setInterfacePreferences, useInterfacePreferences, ZOOM_LEVELS } from "../../preferences/interface-preferences";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { SelectMenu } from "../ui/select-menu";
import { Switch } from "../ui/switch";
import { SettingRow, SettingsSection } from "./SettingsPrimitives";

const themes: Array<{ value: ThemeMode; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
  { value: "dark", label: "Dark", icon: Moon },
];
export default function AppearanceSettings(): ReactElement | null {
  const { preferences, updatePreferences } = useDesktop();
  const interfacePreferences = useInterfacePreferences();
  const { run, busy } = useFeedbackAction();
  if (!preferences) return null;
  return (
    <SettingsSection title="Appearance">
      <SettingRow
        settingId="restore-windows"
        title="Restore previous windows on startup"
        description="Reopen window layouts and saved documents. Unsaved edits are not restored."
      >
        <Switch
          aria-label="Restore previous windows on startup"
          checked={preferences.restoreWindows}
          disabled={busy}
          onCheckedChange={(checked) => void run("restore", () => updatePreferences({ restoreWindows: checked }))}
        />
      </SettingRow>
      <SettingRow settingId="theme" title="Theme" description="Choose how the app looks on this device.">
        <RadioGroup
          aria-label="Appearance"
          className="theme-segment"
          value={preferences.theme}
          disabled={busy}
          onValueChange={(theme) => void run("theme", () => updatePreferences({ theme: theme as ThemeMode }))}
        >
          {themes.map(({ value, label, icon: Icon }) => (
            <label key={value} className="theme-option" data-active={preferences.theme === value}>
              <RadioGroupItem className="sr-only" value={value} />
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </label>
          ))}
        </RadioGroup>
      </SettingRow>
      <SettingRow
        settingId="interface-size"
        title="Interface size"
        description="Scale text and controls throughout the app."
      >
        <SelectMenu
          data-id="interface-size-select"
          label="Interface size"
          value={String(interfacePreferences.zoom)}
          disabled={busy}
          onValueChange={(value) => void run("interface", async () => setInterfacePreferences({ zoom: Number(value) }))}
          options={ZOOM_LEVELS.map((zoom) => ({
            value: String(zoom),
            label: `${Math.round(zoom * 100)}%${zoom === 1 ? " (default)" : ""}`,
          }))}
        />
      </SettingRow>
      <SettingRow
        settingId="motion"
        title="Motion"
        description="Follow your system preference or choose how the interface animates."
      >
        <SelectMenu<"system" | "reduced" | "full">
          data-id="motion-select"
          label="Motion"
          value={interfacePreferences.motion}
          disabled={busy}
          onValueChange={(motion) => void run("interface", async () => setInterfacePreferences({ motion }))}
          options={[
            { value: "system", label: "Follow system" },
            { value: "reduced", label: "Reduced" },
            { value: "full", label: "Full" },
          ]}
        />
      </SettingRow>
    </SettingsSection>
  );
}
