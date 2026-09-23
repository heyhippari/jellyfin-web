import type { ComponentType } from 'react';
import type {
    ActionFunction,
    LoaderFunction,
    ShouldRevalidateFunction
} from 'react-router-dom';

import { createModuleRegistry } from 'utils/moduleRegistry';

export interface RouteModule {
    default?: ComponentType;
    Component?: ComponentType | null;
    ErrorBoundary?: ComponentType | null;
    action?: ActionFunction;
    loader?: LoaderFunction;
    shouldRevalidate?: ShouldRevalidateFunction;
    handle?: unknown;
}

export const dashboardRouteRegistry = createModuleRegistry<RouteModule>(
    import.meta.glob<RouteModule>('../../apps/dashboard/routes/**/*.tsx'),
    {
        basePath: '../../apps/dashboard/routes/',
        moduleType: 'dashboard route',
        stripIndex: true
    }
);

export const modernRouteRegistry = createModuleRegistry<RouteModule>(
    import.meta.glob<RouteModule>('../../apps/modern/routes/**/*.tsx'),
    {
        basePath: '../../apps/modern/routes/',
        moduleType: 'modern route',
        stripIndex: true
    }
);

export const legacyRouteRegistry = createModuleRegistry<RouteModule>(
    import.meta.glob<RouteModule>('../../apps/legacy/routes/**/*.tsx'),
    {
        basePath: '../../apps/legacy/routes/',
        moduleType: 'legacy route',
        stripIndex: true
    }
);
