export type ModuleLoader<T> = () => Promise<T>;

export interface ModuleRegistry<T> {
    readonly keys: readonly string[];
    has: (logicalPath: string) => boolean;
    load: (logicalPath: string) => Promise<T>;
}

interface ModuleRegistryOptions {
    /** Prefix included in every key returned by import.meta.glob. */
    basePath: string;
    /** Human-readable module type used in unknown-key errors. */
    moduleType: string;
    /** Treat a trailing /index module as its containing directory. */
    stripIndex?: boolean;
}

const MODULE_EXTENSION = /\.(?:[cm]?[jt]sx?|html|json)$/;

export const normalizeModuleKey = (
    path: string,
    stripIndex = false
) => {
    let key = path.split('\\').join('/');
    const queryIndex = key.indexOf('?');
    const hashIndex = key.indexOf('#');
    const suffixIndexes = [ queryIndex, hashIndex ].filter(index => index >= 0);

    if (suffixIndexes.length > 0) {
        key = key.slice(0, Math.min(...suffixIndexes));
    }

    if (key.startsWith('./')) key = key.slice(2);
    if (key.startsWith('/')) key = key.slice(1);

    key = key.replace(MODULE_EXTENSION, '');
    while (key.endsWith('/')) key = key.slice(0, -1);

    if (stripIndex) {
        if (key === 'index') {
            key = '';
        } else if (key.endsWith('/index')) {
            key = key.slice(0, -'/index'.length);
        }
    }

    return key;
};

export const createModuleRegistry = <T>(
    modules: Record<string, ModuleLoader<T>>,
    { basePath, moduleType, stripIndex = false }: ModuleRegistryOptions
): ModuleRegistry<T> => {
    const loaders: Record<string, ModuleLoader<T>> = {};

    Object.entries(modules).forEach(([ sourcePath, loader ]) => {
        if (!sourcePath.startsWith(basePath)) {
            throw new Error(`Invalid ${moduleType} registry path: "${sourcePath}"`);
        }

        const key = normalizeModuleKey(sourcePath.slice(basePath.length), stripIndex);
        if (Object.prototype.hasOwnProperty.call(loaders, key)) {
            throw new Error(`Duplicate ${moduleType} registry key: "${key}"`);
        }

        loaders[key] = loader;
    });

    const getLoader = (logicalPath: string) => {
        const key = normalizeModuleKey(logicalPath, stripIndex);
        const loader = loaders[key];

        if (!loader) {
            throw new Error(`Unknown ${moduleType}: "${logicalPath}"`);
        }

        return loader;
    };

    return {
        keys: Object.freeze(Object.keys(loaders).sort((a, b) => a.localeCompare(b))),
        has: logicalPath => {
            const key = normalizeModuleKey(logicalPath, stripIndex);
            return Object.prototype.hasOwnProperty.call(loaders, key);
        },
        load: async logicalPath => getLoader(logicalPath)()
    };
};
