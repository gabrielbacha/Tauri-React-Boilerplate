import { createMemoryHistory, createRouter } from "@tanstack/react-router";

import { APP_ROUTES } from "@/shared/routes";

import { rootTree } from "./routes";

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const history = createMemoryHistory({
  initialEntries: [APP_ROUTES.home.path],
});
export const router = createRouter({ routeTree: rootTree, history: history });
