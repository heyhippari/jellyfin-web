import { createModuleRegistry } from 'utils/moduleRegistry';

interface ControllerModule {
    default: new (...args: unknown[]) => unknown;
    [exportName: string]: unknown;
}

const dashboardControllerRegistry = createModuleRegistry<ControllerModule>(
    import.meta.glob<ControllerModule>('../../apps/dashboard/controllers/**/*.{js,ts}'),
    {
        basePath: '../../apps/dashboard/controllers/',
        moduleType: 'dashboard controller'
    }
);

const dashboardViewRegistry = createModuleRegistry<string>(
    import.meta.glob<string>('../../apps/dashboard/controllers/**/*.html', {
        query: '?raw',
        import: 'default'
    }),
    {
        basePath: '../../apps/dashboard/controllers/',
        moduleType: 'dashboard view'
    }
);

const wizardControllerRegistry = createModuleRegistry<ControllerModule>(
    import.meta.glob<ControllerModule>('../../apps/wizard/controllers/**/*.{js,ts}'),
    {
        basePath: '../../apps/wizard/controllers/',
        moduleType: 'wizard controller'
    }
);

const wizardViewRegistry = createModuleRegistry<string>(
    import.meta.glob<string>('../../apps/wizard/controllers/**/*.html', {
        query: '?raw',
        import: 'default'
    }),
    {
        basePath: '../../apps/wizard/controllers/',
        moduleType: 'wizard view'
    }
);

const legacyControllerRegistry = createModuleRegistry<ControllerModule>(
    import.meta.glob<ControllerModule>('../../apps/legacy/controllers/**/*.{js,ts}'),
    {
        basePath: '../../apps/legacy/controllers/',
        moduleType: 'legacy controller'
    }
);

const legacyViewRegistry = createModuleRegistry<string>(
    import.meta.glob<string>('../../apps/legacy/controllers/**/*.html', {
        query: '?raw',
        import: 'default'
    }),
    {
        basePath: '../../apps/legacy/controllers/',
        moduleType: 'legacy view'
    }
);

export const viewRegistries = {
    dashboard: {
        controllers: dashboardControllerRegistry,
        views: dashboardViewRegistry
    },
    wizard: {
        controllers: wizardControllerRegistry,
        views: wizardViewRegistry
    },
    legacy: {
        controllers: legacyControllerRegistry,
        views: legacyViewRegistry
    }
} as const;
