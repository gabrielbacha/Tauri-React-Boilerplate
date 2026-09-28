import { useLocation, useRouter } from "@tanstack/react-router";
import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left.mjs";
import Keyboard from "lucide-react/dist/esm/icons/keyboard.mjs";
import Palette from "lucide-react/dist/esm/icons/palette.mjs";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw.mjs";
import Search from "lucide-react/dist/esm/icons/search.mjs";
import Shield from "lucide-react/dist/esm/icons/shield.mjs";
import SlidersHorizontal from "lucide-react/dist/esm/icons/sliders-horizontal.mjs";
import X from "lucide-react/dist/esm/icons/x.mjs";
import { useState } from "react";

import {
  CATEGORY_LABELS,
  SETTINGS_CATEGORIES,
  focusSetting,
  searchSettings,
  validateSettingsSearch,
  type SettingsCategory,
} from "../../settings/settings-navigation";
import { Hint } from "../ui/tooltip";
const icons = {
  shortcuts: Keyboard,
  appearance: Palette,
  updates: RefreshCw,
  permissions: Shield,
  advanced: SlidersHorizontal,
};
export default function SettingsNavigation({ onBack, onNavigate }: { onBack: () => void; onNavigate: () => void }) {
  const location = useLocation();
  const router = useRouter();
  const { section = "appearance" } = validateSettingsSearch(location.search);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const results = searchSettings(query);
  const go = async (category: SettingsCategory, setting?: string): Promise<void> => {
    await router.navigate({ to: "/settings", search: { section: category, setting } });
    onNavigate();
    if (setting) requestAnimationFrame(() => focusSetting(setting));
  };
  return (
    <div className="settings-navigation">
      <button className="settings-back no-drag" type="button" onClick={onBack}>
        <ArrowLeft aria-hidden="true" />
        Back to app
      </button>
      <div className="settings-search">
        <Search aria-hidden="true" />
        <input
          type="search"
          aria-label="Search settings"
          placeholder="Search settings"
          value={query}
          aria-controls={query ? "settings-search-results" : undefined}
          aria-activedescendant={query && results[active] ? `settings-result-${results[active].id}` : undefined}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Escape" && query) {
              event.preventDefault();
              setQuery("");
            }
            if ((event.key === "ArrowDown" || event.key === "ArrowUp") && results.length) {
              event.preventDefault();
              const next = (active + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length;
              setActive(next);
              document.getElementById(`settings-result-${results[next].id}`)?.scrollIntoView({ block: "nearest" });
            }
            if (event.key === "Enter" && query && results[active]) {
              event.preventDefault();
              const item = results[active];
              void go(item.category as SettingsCategory, item.id);
            }
          }}
        />
        {query ? (
          <Hint label="Clear search" side="bottom">
            <button
              type="button"
              className="shell-icon-button"
              aria-label="Clear search"
              onClick={() => {
                setQuery("");
                document.querySelector<HTMLInputElement>('[aria-label="Search settings"]')?.focus();
              }}
            >
              <X />
            </button>
          </Hint>
        ) : null}
      </div>
      {query ? (
        <div
          id="settings-search-results"
          className="settings-search-results"
          role="listbox"
          aria-label="Matching settings"
        >
          {results.map((item, index) => (
            <button
              type="button"
              role="option"
              aria-selected={active === index}
              id={`settings-result-${item.id}`}
              key={item.id}
              className="settings-result"
              onClick={() => void go(item.category as SettingsCategory, item.id)}
            >
              <span>{item.label}</span>
              <small>{CATEGORY_LABELS[item.category as SettingsCategory]}</small>
            </button>
          ))}
          {!results.length ? (
            <p role="status" className="settings-no-results">
              No matching settings
            </p>
          ) : null}
        </div>
      ) : (
        <nav aria-label="Settings categories" className="sidebar-nav">
          {SETTINGS_CATEGORIES.map((category) => {
            const Icon = icons[category];
            return (
              <button
                type="button"
                key={category}
                className="sidebar-nav-item"
                data-active={section === category}
                aria-current={section === category ? "page" : undefined}
                onClick={() => void go(category)}
              >
                <Icon aria-hidden="true" />
                <span>{CATEGORY_LABELS[category]}</span>
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}
