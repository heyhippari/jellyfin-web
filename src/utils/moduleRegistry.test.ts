import { describe, expect, it, vi } from 'vitest';

import { createModuleRegistry, normalizeModuleKey } from './moduleRegistry';

describe('normalizeModuleKey', () => {
    it('normalizes separators, queries, and supported extensions', () => {
        expect(normalizeModuleKey('./folder\\page.html?raw')).toBe('folder/page');
    });

    it('optionally maps index modules to their containing directory', () => {
        expect(normalizeModuleKey('activity/index.tsx', true)).toBe('activity');
        expect(normalizeModuleKey('index.tsx', true)).toBe('');
    });
});

describe('createModuleRegistry', () => {
    const loadModule = async () => ({ default: 'loaded' });
    const modules: Record<string, typeof loadModule> = {};
    modules['../modules/example/index.ts'] = loadModule;
    const registry = createModuleRegistry(
        modules,
        {
            basePath: '../modules/',
            moduleType: 'test module',
            stripIndex: true
        }
    );

    it('loads modules by normalized logical path', async () => {
        await expect(registry.load('./example')).resolves.toEqual({ default: 'loaded' });
        expect(registry.has('example/index.ts')).toBe(true);
        expect(registry.keys).toEqual([ 'example' ]);
    });

    it('rejects unknown modules with the requested logical path', async () => {
        await expect(registry.load('missing/module')).rejects.toThrow(
            'Unknown test module: "missing/module"'
        );
    });

    it('does not invoke loaders until their module is requested', async () => {
        const lazyLoader = vi.fn(loadModule);
        const lazyModules: Record<string, typeof lazyLoader> = {};
        lazyModules['../modules/lazy.ts'] = lazyLoader;
        const lazyRegistry = createModuleRegistry(
            lazyModules,
            {
                basePath: '../modules/',
                moduleType: 'lazy module'
            }
        );

        expect(lazyLoader).not.toHaveBeenCalled();

        await lazyRegistry.load('lazy');

        expect(lazyLoader).toHaveBeenCalledOnce();
    });
});
