import type { RouteObject } from 'react-router-dom';

import { AppType } from 'constants/appType';

import {
    dashboardRouteRegistry,
    legacyRouteRegistry,
    modernRouteRegistry
} from './routeRegistry';

export interface AsyncRoute {
    /** The URL path for this route. */
    path: string
    /**
     * The relative path to the page component in the routes directory.
     * Will fallback to using the `path` value if not specified.
     */
    page?: string
    /** The app that this page is part of. */
    type?: AppType
}

type LazyRouteModule = Awaited<
    ReturnType<NonNullable<RouteObject['lazy']>>
>;

const importRoute = (page: string, type: AppType) => {
    switch (type) {
        case AppType.Dashboard:
            return dashboardRouteRegistry.load(page);
        case AppType.Modern:
            return modernRouteRegistry.load(page);
        case AppType.Legacy:
            return legacyRouteRegistry.load(page);
        default:
            throw new Error(`Unsupported async route app type: "${type}"`);
    }
};

export const toAsyncPageRoute = ({
    path,
    page,
    type = AppType.Legacy
}: AsyncRoute): RouteObject => {
    return {
        path,
        lazy: async () => {
            const {
                // If there is a default export, use it as the Component for compatibility
                default: Component,
                ...route
            } = await importRoute(page ?? path, type);

            return {
                Component,
                ...route
            } as LazyRouteModule;
        }
    };
};
