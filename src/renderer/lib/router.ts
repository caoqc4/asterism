export type AppRoute = 'home' | 'tasks' | 'decisions' | 'runs' | 'settings';

const validRoutes = new Set<AppRoute>(['home', 'tasks', 'decisions', 'runs', 'settings']);

export function getRouteFromHash(hash: string): AppRoute {
  const normalized = hash.replace(/^#\/?/, '') as AppRoute;
  return validRoutes.has(normalized) ? normalized : 'home';
}

export function setRoute(route: AppRoute): void {
  window.location.hash = route;
}
