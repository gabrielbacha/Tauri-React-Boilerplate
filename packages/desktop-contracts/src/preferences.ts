import { z } from "zod";
export const themeModeSchema = z.enum(["system", "light", "dark"]);

import { ZOOM_LEVELS } from "./interface-options";
export const interfacePreferencesSchema = z.object({
  zoom: z.number().refine((value) => ZOOM_LEVELS.some((level) => level === value)),
  motion: z.enum(["system", "reduced", "full"]),
});

import { COMMAND_IDS } from "./commands";
export const shortcutOverridesSchema = z.partialRecord(z.enum(COMMAND_IDS), z.string().max(80).nullable());

export const appPreferencesSchema = z.object({
  shortcuts: shortcutOverridesSchema.optional(),
  zoom: interfacePreferencesSchema.shape.zoom,
  motion: interfacePreferencesSchema.shape.motion,
  theme: themeModeSchema,
  sidebarCollapsed: z.boolean(),
  checkForUpdatesAutomatically: z.boolean(),
  restoreWindows: z.boolean().default(false),
});

export type ThemeMode = z.infer<typeof themeModeSchema>;
export type AppPreferences = z.infer<typeof appPreferencesSchema>;
