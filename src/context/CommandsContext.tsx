import { createContext, useContext } from "react";

import type { CommandId } from "@/shared/commands";
export const CommandsContext = createContext<(id: CommandId) => void>(() => {});
export const useCommands = (): ((id: CommandId) => void) => useContext(CommandsContext);
