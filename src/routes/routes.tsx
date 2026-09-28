import { createRoute } from "@tanstack/react-router";
import { lazy } from "react";

import { SHOWCASE_ENABLED } from "@/shared/features";
import { APP_ROUTES } from "@/shared/routes";

import DeferredSurface from "../components/common/DeferredSurface";
import StarterPage from "../pages/StarterPage";
const ShowcasePage = lazy(() => import("../pages/HomePage"));
const SettingsPage = lazy(() => import("../pages/SettingsPage"));
import { validateSettingsSearch } from "../settings/settings-navigation";
import { RootRoute } from "./__root";

const HomeRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: APP_ROUTES.home.path,
  component: SHOWCASE_ENABLED
    ? () => (
        <DeferredSurface>
          <ShowcasePage />
        </DeferredSurface>
      )
    : StarterPage,
});

const SettingsRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: APP_ROUTES.settings.path,
  validateSearch: validateSettingsSearch,
  component: () => (
    <DeferredSurface>
      <SettingsPage />
    </DeferredSurface>
  ),
});

export const rootTree = RootRoute.addChildren([HomeRoute, SettingsRoute]);
