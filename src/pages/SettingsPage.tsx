import { useLocation } from "@tanstack/react-router";

import SettingsControls from "../components/layout/SettingsControls";
import ShortcutSettings from "../components/layout/ShortcutSettings";
import { validateSettingsSearch } from "../settings/settings-navigation";
export default function SettingsPage() {
  const location = useLocation();
  const { section = "appearance", setting } = validateSettingsSearch(location.search);
  if (section === "shortcuts")
    return (
      <div className="settings-view">
        <header className="settings-heading">
          <h1>Keyboard shortcuts</h1>
          <p>Make the app work with your keys.</p>
        </header>
        <ShortcutSettings />
      </div>
    );
  return <SettingsControls section={section} setting={setting} />;
}
