import Search from "lucide-react/dist/esm/icons/search.mjs";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { useDialogReturnFocus } from "../../hooks/useDialogReturnFocus";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";

export interface PaletteCommand {
  id: string;
  label: string;
  keywords?: string;
  shortcut?: string;
  run: () => void | Promise<unknown>;
}
export function filterCommands(commands: PaletteCommand[], query: string): PaletteCommand[] {
  const terms = query.trim().toLowerCase().split(/\s+/);
  return commands.filter((command) =>
    terms.every((term) => `${command.label} ${command.keywords ?? ""}`.toLowerCase().includes(term)),
  );
}
export default function CommandPalette({
  open,
  onOpenChange,
  commands,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: PaletteCommand[];
}) {
  const returnFocus = useDialogReturnFocus();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const pending = useRef<PaletteCommand | null>(null);
  const results = filterCommands(commands, query);
  const selected = results[Math.min(index, Math.max(0, results.length - 1))];
  const select = (command: PaletteCommand): void => {
    pending.current = command;
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="command-palette"
        onOpenAutoFocus={() => {
          returnFocus.onOpenAutoFocus();
          setQuery("");
          setIndex(0);
        }}
        onCloseAutoFocus={(event) => {
          returnFocus.onCloseAutoFocus(event);
          const command = pending.current;
          pending.current = null;
          // Let the dialog finish restoring focus before commands navigate or open another overlay.
          if (command)
            window.setTimeout(() => {
              void Promise.resolve()
                .then(() => command.run())
                .catch(() => toast.error("Unable to run that command."));
            }, 0);
        }}
      >
        <DialogTitle className="sr-only">Commands</DialogTitle>
        <DialogDescription className="sr-only">
          Search actions. Use arrow keys to choose and Enter to run.
        </DialogDescription>
        <div className="command-search">
          <Search aria-hidden="true" size={18} />
          <input
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-label="Search commands"
            aria-autocomplete="list"
            aria-expanded={true}
            aria-controls="command-results"
            aria-activedescendant={selected ? `command-${selected.id}` : undefined}
            value={query}
            placeholder="Search commands…"
            onChange={(event) => {
              setQuery(event.target.value);
              setIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const next = results.length
                  ? (index + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length
                  : 0;
                setIndex(next);
                document.getElementById(`command-${results[next]?.id}`)?.scrollIntoView({ block: "nearest" });
              } else if (event.key === "Enter" && selected) {
                event.preventDefault();
                select(selected);
              }
            }}
          />
        </div>
        <div id="command-results" role="listbox" aria-label="Commands" className="command-results">
          {results.map((command) => (
            <button
              key={command.id}
              id={`command-${command.id}`}
              type="button"
              role="option"
              aria-selected={command === selected}
              tabIndex={-1}
              className="command-option"
              onClick={() => select(command)}
            >
              <span>{command.label}</span>
              {command.shortcut ? <kbd>{command.shortcut}</kbd> : null}
            </button>
          ))}
          {!results.length ? (
            <p className="command-empty" role="status">
              No matching commands
            </p>
          ) : null}
        </div>
        <div className="command-footer">
          ↑↓ Navigate <span>↵ Run</span>
          <span>Esc Close</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
