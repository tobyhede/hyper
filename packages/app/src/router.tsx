import type { ComponentType } from 'react';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';

export const createAppRouter = (App: ComponentType) => {
  const rootRoute = createRootRoute({
    component: () => <Outlet />,
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <App />,
  });
  const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute]) });

  return function AppRouter() {
    return <RouterProvider router={router} />;
  };
};
