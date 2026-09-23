import { describe, expect, it } from 'vitest';

import { ASYNC_ADMIN_ROUTES } from 'apps/dashboard/routes/_asyncRoutes';
import { LEGACY_ADMIN_ROUTES, METADATA_MANAGER_ROUTE } from 'apps/dashboard/routes/_legacyRoutes';
import { homeTabControllerRegistry } from 'apps/legacy/controllers/homeTabRegistry';
import { ASYNC_PUBLIC_ROUTES as LEGACY_ASYNC_PUBLIC_ROUTES } from 'apps/legacy/routes/asyncRoutes/public';
import { ASYNC_USER_ROUTES as LEGACY_ASYNC_USER_ROUTES } from 'apps/legacy/routes/asyncRoutes/user';
import { LEGACY_PUBLIC_ROUTES } from 'apps/legacy/routes/legacyRoutes/public';
import { LEGACY_USER_ROUTES } from 'apps/legacy/routes/legacyRoutes/user';
import { ASYNC_PUBLIC_ROUTES as MODERN_ASYNC_PUBLIC_ROUTES } from 'apps/modern/routes/asyncRoutes/public';
import { ASYNC_USER_ROUTES as MODERN_ASYNC_USER_ROUTES } from 'apps/modern/routes/asyncRoutes/user';
import { LEGACY_PUBLIC_ROUTES as MODERN_LEGACY_PUBLIC_ROUTES } from 'apps/modern/routes/legacyRoutes/public';
import { LEGACY_USER_ROUTES as MODERN_LEGACY_USER_ROUTES } from 'apps/modern/routes/legacyRoutes/user';
import { VIDEO_PAGE_PROPS } from 'apps/modern/routes/video/view';
import { WIZARD_ROUTES } from 'apps/wizard/routes/_legacyRoutes';
import config from 'config.json';
import { AppType } from 'constants/appType';
import { builtInPluginRegistry } from 'components/pluginRegistry';
import type { AsyncRoute } from 'components/router/AsyncRoute';
import type { LegacyRoute } from 'components/router/LegacyRoute';
import {
    dashboardRouteRegistry,
    legacyRouteRegistry,
    modernRouteRegistry
} from 'components/router/routeRegistry';
import { viewRegistries } from 'components/viewManager/viewRegistry';
import locales from 'lib/globalize/locales';
import { translationRegistry } from 'lib/globalize/translationRegistry';

const asyncRouteTables: ReadonlyArray<readonly [string, readonly AsyncRoute[]]> = [
    [ 'dashboard', ASYNC_ADMIN_ROUTES ],
    [ 'legacy public', LEGACY_ASYNC_PUBLIC_ROUTES ],
    [ 'legacy user', LEGACY_ASYNC_USER_ROUTES ],
    [ 'modern public', MODERN_ASYNC_PUBLIC_ROUTES ],
    [ 'modern user', MODERN_ASYNC_USER_ROUTES ]
];

const legacyRouteTables: ReadonlyArray<readonly [string, readonly LegacyRoute[]]> = [
    [ 'dashboard', LEGACY_ADMIN_ROUTES ],
    [ 'dashboard metadata manager', [ METADATA_MANAGER_ROUTE ] ],
    [ 'legacy public', LEGACY_PUBLIC_ROUTES ],
    [ 'legacy user', LEGACY_USER_ROUTES ],
    [ 'modern public', MODERN_LEGACY_PUBLIC_ROUTES ],
    [ 'modern user', MODERN_LEGACY_USER_ROUTES ],
    [ 'modern video', [{ path: 'video', pageProps: VIDEO_PAGE_PROPS }] ],
    [ 'wizard', WIZARD_ROUTES ]
];

const getRouteRegistry = (type = AppType.Legacy) => {
    switch (type) {
        case AppType.Dashboard:
            return dashboardRouteRegistry;
        case AppType.Modern:
            return modernRouteRegistry;
        case AppType.Legacy:
            return legacyRouteRegistry;
        default:
            throw new Error(`Unsupported route type in registry contract: "${type}"`);
    }
};

const getViewRegistries = (type = AppType.Legacy) => {
    switch (type) {
        case AppType.Dashboard:
            return viewRegistries.dashboard;
        case AppType.Wizard:
            return viewRegistries.wizard;
        case AppType.Legacy:
            return viewRegistries.legacy;
        default:
            throw new Error(`Unsupported view type in registry contract: "${type}"`);
    }
};

describe('lazy module registry contracts', () => {
    it.each(asyncRouteTables)('contains every route in the %s route table', (tableName, routes) => {
        routes.forEach(route => {
            const logicalPath = route.page ?? route.path;
            expect(
                getRouteRegistry(route.type).has(logicalPath),
                `${tableName} route "${logicalPath}" is missing from its registry`
            ).toBe(true);
        });
    });

    it.each(legacyRouteTables)('contains every controller and view in the %s route table', (tableName, routes) => {
        routes.forEach(({ pageProps }) => {
            const registries = getViewRegistries(pageProps.appType);

            expect(
                registries.controllers.has(pageProps.controller),
                `${tableName} controller "${pageProps.controller}" is missing from its registry`
            ).toBe(true);
            expect(
                registries.views.has(pageProps.view),
                `${tableName} view "${pageProps.view}" is missing from its registry`
            ).toBe(true);
        });
    });

    it('contains every configured built-in plugin', () => {
        config.plugins.forEach(plugin => {
            expect(
                builtInPluginRegistry.has(plugin),
                `configured plugin "${plugin}" is missing from its registry`
            ).toBe(true);
        });
    });

    it('contains every translation metadata path', () => {
        locales.forEach(({ path }) => {
            expect(
                translationRegistry.has(path),
                `translation "${path}" is missing from its registry`
            ).toBe(true);
        });
    });

    it('contains both declared home-tab controllers', () => {
        expect(homeTabControllerRegistry.has('hometab')).toBe(true);
        expect(homeTabControllerRegistry.has('favorites')).toBe(true);
    });
});
