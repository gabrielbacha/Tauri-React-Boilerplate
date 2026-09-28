import ChevronDown from "lucide-react/dist/esm/icons/chevron-down.mjs";
import Search from "lucide-react/dist/esm/icons/search.mjs";
import { useState, type ReactElement, type ReactNode } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";

interface SelectOption<Value extends string> {
  value: Value;
  label: string;
}

interface SelectMenuProps<Value extends string> {
  /** The trigger's data-id; select menus appear in repeated places. */
  "data-id"?: string;
  label: string;
  value: Value;
  options: readonly SelectOption<Value>[];
  displayValue?: string;
  icon?: ReactNode;
  disabled?: boolean;
  /** Show a search field; by default only lists longer than SEARCH_THRESHOLD get one. Property pickers always do. */
  searchable?: boolean;
  onValueChange: (value: Value) => void;
}

/** Lists longer than this get a search field, so a property is found by typing rather than scrolling. */
const SEARCH_THRESHOLD = 8;

export function SelectMenu<Value extends string>({
  "data-id": dataId,
  label,
  value,
  options,
  displayValue,
  icon,
  disabled,
  searchable: searchableProp,
  onValueChange,
}: SelectMenuProps<Value>): ReactElement {
  const selected = options.find((option) => option.value === value);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const searchable = searchableProp ?? options.length > SEARCH_THRESHOLD;
  const needle = query.trim().toLowerCase();
  const shown = needle ? options.filter((option) => option.label.toLowerCase().includes(needle)) : options;
  const choose = (option: SelectOption<Value>): void => {
    if (option.value !== value) onValueChange(option.value);
  };
  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setQuery("");
      }}
    >
      <DropdownMenuTrigger asChild>
        <button type="button" className="select-trigger" data-id={dataId} aria-label={label} disabled={disabled}>
          {icon ? (
            <span className="select-icon" aria-hidden="true">
              {icon}
            </span>
          ) : null}
          <span className="select-value">{displayValue ?? selected?.label ?? label}</span>
          <ChevronDown aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="select-menu" aria-label={label}>
        {searchable ? (
          <label className="select-search">
            <Search aria-hidden="true" />
            <input
              aria-label={`Search ${label.toLowerCase()}`}
              placeholder="Search"
              value={query}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- Typing narrows the list as soon as it opens.
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                // Letters go to the field, not to the menu's type-ahead; arrows still move through items.
                if (!["ArrowDown", "ArrowUp", "Escape", "Tab"].includes(event.key)) event.stopPropagation();
                if (event.key === "Enter" && shown[0]) {
                  event.preventDefault();
                  choose(shown[0]);
                  setOpen(false);
                }
              }}
            />
          </label>
        ) : null}
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => {
            const option = options.find((item) => item.value === next);
            if (option && option.value !== value) onValueChange(option.value);
          }}
        >
          {shown.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value} textValue={option.label}>
              <span className="select-option-label">{option.label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {searchable && !shown.length ? <p className="select-empty">No matches</p> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
