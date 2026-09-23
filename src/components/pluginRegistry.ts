import { createModuleRegistry } from 'utils/moduleRegistry';

interface PluginModule {
    default: new (...args: unknown[]) => unknown;
}

export const builtInPluginRegistry = createModuleRegistry<PluginModule>(
    import.meta.glob<PluginModule>('../plugins/**/plugin.{js,ts}'),
    {
        basePath: '../plugins/',
        moduleType: 'built-in plugin'
    }
);
