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
  const spaceRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/spaces/$spaceId',
    component: () => <App />,
  });
  const router = createRouter({ routeTree: rootRoute.addChildren([spaceRoute]) });

  return function AppRouter() {
    return <RouterProvider router={router} />;
  };
};
