export const shouldBlockNavigation = (dirtySources: string[], currentPath: string, nextPath: string): boolean =>
  dirtySources.length > 0 && currentPath !== nextPath;
