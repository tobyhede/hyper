import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { App } from './App';

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: App,
});

const routeTree = rootRoute.addChildren([indexRoute]);

// Not exported: `AppRouter` below is the only consumer, and `typeof router` in
// the module augmentation reads the local binding. Exporting it made this file
// export both a component and a value, which costs Fast Refresh — the module
// stops hot-reloading and full-reloads instead.
const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export function AppRouter() {
  return <RouterProvider router={router} />;
}
