import type { ReactElement, ReactNode } from "react";

import type { SettingId } from "../../settings/settings-navigation";

export function SettingsSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}): ReactElement {
  return (
    <section className="settings-section">
      <h2 className="sr-only">{title}</h2>
      {action ? <div className="settings-section-heading settings-section-actions">{action}</div> : null}
      <div className="settings-rows">{children}</div>
    </section>
  );
}

export function SettingRow({
  settingId,
  title,
  description,
  children,
}: {
  settingId: SettingId;
  title: string;
  description: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div id={`setting-${settingId}`} tabIndex={-1} className="setting-row">
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
