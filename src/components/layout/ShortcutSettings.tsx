import { useLayoutEffect, useEffect, useRef, useState } from "react";

import {
  COMMANDS,
  COMMAND_IDS,
  commandAvailable,
  bindingLabel,
  effectiveBinding,
  keyEventBinding,
  type CommandId,
} from "@/shared/commands";
import { errorMessage } from "@/shared/errors";

import { useDesktop } from "../../context/DesktopContext";
import { Button } from "../ui/button";

export default function ShortcutSettings() {
  const { preferences, appInfo } = useDesktop();
  const [query, setQuery] = useState("");
  const [recording, setRecording] = useState<CommandId | null>(null);
  const [candidate, setCandidate] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const alive = useRef(true);
  const busy = useRef(false);
  const attempt = useRef(0);
  const returnFocus = useRef<CommandId | null>(null);
  const buttons = useRef<Partial<Record<CommandId, HTMLButtonElement | null>>>({});
  useLayoutEffect(() => {
    if (!recording && returnFocus.current) {
      buttons.current[returnFocus.current]?.focus();
      returnFocus.current = null;
    }
  }, [recording]);
  const mac = window.desktop.window.platform === "darwin";
  const invalidateAttempt = (): void => {
    attempt.current++;
  };
  const stop = (): void => {
    invalidateAttempt();
    setRecording(null);
    setCandidate(null);
    void window.desktop.shortcuts.record(false).catch(() => {});
  };
  useEffect(() => {
    alive.current = true;
    const blur = (): void => stop();
    window.addEventListener("blur", blur);
    return () => {
      alive.current = false;
      invalidateAttempt();
      window.removeEventListener("blur", blur);
      void window.desktop.shortcuts.record(false).catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!recording) return;
    const capture = (event: KeyboardEvent): void => {
      if (event.key === "Tab" && !event.metaKey && !event.ctrlKey && !event.altKey) return;
      if (
        candidate &&
        (event.key === "Enter" || event.key === " ") &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        event.target instanceof HTMLButtonElement
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat || event.isComposing) return;
      if (event.key === "Escape") {
        stop();
        return;
      }
      if (["Meta", "Control", "Alt", "Shift"].includes(event.key)) return;
      try {
        setCandidate(keyEventBinding(event, mac));
        setError("");
      } catch (caught) {
        setError(errorMessage(caught, "Unsupported shortcut."));
      }
    };
    window.addEventListener("keydown", capture, true);
    return () => window.removeEventListener("keydown", capture, true);
  }, [recording, mac, candidate]);
  async function edit(id: CommandId): Promise<void> {
    if (busy.current) return;
    busy.current = true;
    const started = ++attempt.current;
    setError("");
    try {
      await window.desktop.shortcuts.record(true);
      if (!alive.current || started !== attempt.current) {
        await window.desktop.shortcuts.record(false);
        return;
      }
      returnFocus.current = id;
      setCandidate(null);
      setRecording(id);
    } catch {
      setError("Unable to record. Focus the app and try again.");
    } finally {
      busy.current = false;
    }
  }
  async function save(action: () => Promise<unknown>): Promise<void> {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      await action();
      if (alive.current) stop();
    } catch (caught) {
      if (alive.current) setError(errorMessage(caught, "Unable to save shortcut."));
    } finally {
      busy.current = false;
      if (alive.current) setSaving(false);
    }
  }
  const ids = COMMAND_IDS.filter((id) => commandAvailable(id, appInfo?.packaged ?? false)).filter((id) => {
    const binding = effectiveBinding(id, preferences?.shortcuts);
    return `${COMMANDS[id].label} ${COMMANDS[id].group} ${binding ?? "unassigned"} ${bindingLabel(binding, mac)}`
      .toLowerCase()
      .includes(query.toLowerCase().trim());
  });
  return (
    <section aria-label="Keyboard shortcut bindings" className="shortcut-settings">
      <div className="shortcut-search-row">
        <input
          aria-label="Search keyboard shortcuts"
          placeholder="Search actions or keys…"
          value={query}
          disabled={!!recording}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={saving || !!recording}
          onClick={() => void save(() => window.desktop.shortcuts.reset())}
        >
          Reset all shortcuts
        </Button>
      </div>
      <p className="shortcut-help">
        Click a binding to record a key combination. Escape cancels. Editing and system shortcuts are reserved.
      </p>
      {error ? (
        <p role="alert" className="shortcut-error">
          {error}
        </p>
      ) : null}
      {ids.map((id) => (
        <div key={id} className="shortcut-row" role="group" aria-label={COMMANDS[id].label}>
          <div>
            <h3>{COMMANDS[id].label}</h3>
            <p>{COMMANDS[id].group}</p>
          </div>
          {recording === id ? (
            <div className="shortcut-edit">
              <span role="status">{candidate ? bindingLabel(candidate, mac) : "Press a key combination…"}</span>
              <Button
                size="sm"
                disabled={!candidate || saving}
                onClick={() => candidate && void save(() => window.desktop.shortcuts.set(id, candidate))}
              >
                Save shortcut
              </Button>
              <Button size="sm" variant="ghost" disabled={saving} onClick={stop}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="shortcut-edit">
              <Button
                variant="outline"
                size="sm"
                disabled={!!recording || saving}
                ref={(element) => {
                  buttons.current[id] = element;
                }}
                aria-label={`Edit ${COMMANDS[id].label} shortcut`}
                onClick={() => void edit(id)}
              >
                <kbd>{bindingLabel(effectiveBinding(id, preferences?.shortcuts), mac) || "Unassigned"}</kbd>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!!recording || saving || !effectiveBinding(id, preferences?.shortcuts)}
                onClick={() => void save(() => window.desktop.shortcuts.set(id, null))}
              >
                Clear
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!!recording || saving || preferences?.shortcuts?.[id] === undefined}
                onClick={() => void save(() => window.desktop.shortcuts.reset(id))}
              >
                Reset
              </Button>
            </div>
          )}
        </div>
      ))}
      {!ids.length ? <p role="status">No matching shortcuts.</p> : null}
    </section>
  );
}
