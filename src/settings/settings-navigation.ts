export const SETTINGS_CATEGORIES = ["appearance", "updates", "permissions", "shortcuts", "advanced"] as const;
export type SettingsCategory = (typeof SETTINGS_CATEGORIES)[number];
export const CATEGORY_LABELS: Record<SettingsCategory, string> = {
  shortcuts: "Keyboard shortcuts",
  appearance: "Appearance",
  updates: "Updates",
  permissions: "Permissions",
  advanced: "Advanced",
};
export const SETTINGS_INDEX = [
  {
    id: "restore-windows",
    category: "appearance",
    label: "Restore previous windows on startup",
    description: "Reopen windows and saved documents from the last session",
    keywords: "session startup reopen",
  },
  {
    id: "keyboard-shortcuts",
    category: "shortcuts",
    label: "Keyboard shortcuts",
    description: "Record, clear, and reset app shortcuts",
    keywords: "keys bindings hotkeys customize",
  },
  {
    id: "theme",
    category: "appearance",
    label: "Theme",
    description: "Choose how the app looks on this device",
    keywords: "light dark system color",
  },
  {
    id: "interface-size",
    category: "appearance",
    label: "Interface size",
    description: "Scale text and controls throughout the app",
    keywords: "zoom font size",
  },
  {
    id: "motion",
    category: "appearance",
    label: "Motion",
    description: "Follow your system preference or choose how the interface animates",
    keywords: "animation reduced full",
  },
  {
    id: "automatic-checks",
    category: "updates",
    label: "Automatic checks",
    description: "Look for new releases when the app starts",
    keywords: "update startup",
  },
  {
    id: "software-update",
    category: "updates",
    label: "Software update",
    description: "Check for the latest available release",
    keywords: "download restart version install",
  },
  ...(["notifications", "camera", "microphone"] as const).map((id) => ({
    id,
    category: "permissions" as const,
    label: id[0].toUpperCase() + id.slice(1),
    description: "Manage permission access and reset decisions",
    keywords: "allow deny privacy",
  })),
  {
    id: "diagnostics",
    category: "advanced",
    label: "Diagnostics",
    description: "Application, system, runtime and renderer health",
    keywords: "protocol updater debug",
  },
  {
    id: "copy-report",
    category: "advanced",
    label: "Copy report",
    description: "Copy diagnostics to clipboard",
    keywords: "debug",
  },
  {
    id: "open-logs",
    category: "advanced",
    label: "Open logs",
    description: "View application logs",
    keywords: "debug",
  },
  {
    id: "reload-renderer",
    category: "advanced",
    label: "Reload renderer",
    description: "Restart the workspace renderer",
    keywords: "recovery",
  },
  {
    id: "reset-preferences",
    category: "advanced",
    label: "Reset preferences",
    description: "Restore default settings",
    keywords: "recovery appearance sidebar updates",
  },
] as const satisfies ReadonlyArray<{
  id: string;
  category: SettingsCategory;
  label: string;
  description: string;
  keywords: string;
}>;
export type SettingId = (typeof SETTINGS_INDEX)[number]["id"];
export function validateSettingsSearch(search: Record<string, unknown>): {
  section?: SettingsCategory;
  setting?: string;
} {
  const section = SETTINGS_CATEGORIES.find((value) => value === search.section) ?? "appearance";
  const setting = SETTINGS_INDEX.find((item) => item.id === search.setting && item.category === section)?.id;
  return { section, ...(setting ? { setting } : {}) };
}
export function searchSettings(query: string): (typeof SETTINGS_INDEX)[number][] {
  const words = query.toLowerCase().trim().split(/\s+/);
  return SETTINGS_INDEX.filter((item) =>
    words.every((word) =>
      `${item.label} ${item.description} ${item.keywords} ${item.category}`.toLowerCase().includes(word),
    ),
  );
}
export function focusSetting(id: string): void {
  const row = document.getElementById(`setting-${id}`);
  if (!row) return;
  row.scrollIntoView({ block: "nearest" });
  (row.querySelector<HTMLElement>('button:not(:disabled), select, input, [tabindex="0"]') ?? row).focus();
}
