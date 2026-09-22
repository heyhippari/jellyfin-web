// @vitest-environment node

import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    resolveStaticSource,
    resolveThemeDevelopmentUrl
} from './vite.copy';
import { repositoryRoot } from './vite.shared';

describe('Vite static copy development paths', () => {
    it('resolves copied libraries and assets to their source files', async () => {
        await expect(resolveStaticSource('/libraries/worker-bundle.js?cache=1')).resolves.toBe(
            path.resolve(repositoryRoot, 'node_modules/libarchive.js/dist/worker-bundle.js')
        );
        await expect(resolveStaticSource('/assets/img/avatar.png')).resolves.toBe(
            path.resolve(repositoryRoot, 'src/assets/img/avatar.png')
        );
        await expect(resolveStaticSource('/config.json?cache=1')).resolves.toBe(
            path.resolve(repositoryRoot, 'src/config.json')
        );
    });

    it('leaves Vite module requests to the transform pipeline', async () => {
        await expect(resolveStaticSource('/config.json?import')).resolves.toBeNull();
        await expect(resolveStaticSource('/assets/img/avatar.png?import')).resolves.toBeNull();
    });

    it.each([
        '/assets/../config.json',
        '/assets/%2e%2e/config.json',
        '/assets/..%2fconfig.json',
        '/libraries/../package.json',
        '/libraries/%2e%2e/package.json',
        '/assets/%E0%A4%A'
    ])('rejects unsafe or malformed path %s', async requestPath => {
        await expect(resolveStaticSource(requestPath)).resolves.toBeNull();
    });

    it('rewrites stable theme CSS URLs to Vite SCSS inputs', async () => {
        await expect(resolveThemeDevelopmentUrl('/themes/dark/theme.css?version=1')).resolves.toBe(
            '/themes/dark/theme.scss?version=1'
        );
        await expect(resolveThemeDevelopmentUrl('/themes/../dark/theme.css')).resolves.toBeNull();
        await expect(resolveThemeDevelopmentUrl('/themes/unknown/theme.css')).resolves.toBeNull();
    });
});
