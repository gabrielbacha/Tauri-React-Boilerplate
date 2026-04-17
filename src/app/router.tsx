import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router"

import { RootLayout } from "@/app/root-layout"
import { DashboardPage } from "@/app/pages/dashboard"
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

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard",
  component: DashboardPage,
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
})

const routeTree = rootRoute.addChildren([indexRoute, dashboardRoute, settingsRoute])

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
