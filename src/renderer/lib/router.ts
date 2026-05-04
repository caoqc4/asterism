export type AppRoute = 'brief' | 'tasks' | 'decisions' | 'context' | 'settings';

const validRoutes = new Set<AppRoute>(['brief', 'tasks', 'decisions', 'context', 'settings']);

export function getRouteFromHash(): AppRoute {
  const hash = window.location.hash;
  const normalized = hash.replace(/^#\/?/, '') as AppRoute;
  return validRoutes.has(normalized) ? normalized : 'brief';
}

export function setRoute(route: AppRoute): void {
  window.location.hash = route;
}
