import React from 'react';
import { CENTRAL_ROUTE_REGISTRY, findRegisteredRoute } from './routeRegistry';
import { RouteErrorBoundary } from './error/RouteErrorBoundary';

export interface RouteDefinitionsProps {
  currentPath?: string;
  children: React.ReactNode;
}

export const RouteDefinitions: React.FC<RouteDefinitionsProps> = ({
  currentPath = '/',
  children,
}) => {
  const activeRoute = findRegisteredRoute(currentPath) ?? CENTRAL_ROUTE_REGISTRY[0];
  return <RouteErrorBoundary routeId={activeRoute.id}>{children}</RouteErrorBoundary>;
};
