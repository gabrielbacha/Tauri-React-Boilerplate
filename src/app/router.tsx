import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router"

import { RootLayout } from "@/app/root-layout"
import { HomePage } from "@/app/pages/home"
import { SettingsPage } from "@/app/pages/settings"

const rootRoute = createRootRoute({
  component: RootLayout,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
})

const routeTree = rootRoute.addChildren([indexRoute, settingsRoute])

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
