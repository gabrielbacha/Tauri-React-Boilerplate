export const APP_ROUTES = {
  home: { path: "/", label: "Workspace" },
  settings: { path: "/settings", label: "Settings" },
} as const;
export type AppRouteId = keyof typeof APP_ROUTES;
export type AppRoutePath = (typeof APP_ROUTES)[AppRouteId]["path"];

export function isAppRoutePath(value: unknown): value is AppRoutePath {
  return Object.values(APP_ROUTES).some((route) => route.path === value);
}
export function restoreRoute(value: unknown): AppRoutePath {
  return isAppRoutePath(value) ? value : APP_ROUTES.home.path;
}
