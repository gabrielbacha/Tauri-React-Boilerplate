import type { KnownDestination } from "./bindings";

export const KNOWN_DESTINATIONS = [
  "repository",
  "documentation",
  "license",
  "support",
] as const satisfies readonly KnownDestination[];
