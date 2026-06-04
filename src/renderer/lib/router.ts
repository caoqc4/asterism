export type AppRoute = 'brief' | 'business' | 'chat' | 'decisions' | 'work-habits' | 'skills' | 'mcp' | 'model' | 'connections' | 'settings';

const validRoutes = new Set<AppRoute>(['brief', 'business', 'chat', 'decisions', 'work-habits', 'skills', 'mcp', 'model', 'connections', 'settings']);

export function getRouteFromHash(): AppRoute {
  const hash = window.location.hash;
  const raw = hash.replace(/^#\/?/, '');
  const normalized = (raw === 'context' || raw === 'tasks' ? 'brief' : raw) as AppRoute;
  return validRoutes.has(normalized) ? normalized : 'brief';
}

export function setRoute(route: AppRoute): void {
  window.location.hash = route;
}
