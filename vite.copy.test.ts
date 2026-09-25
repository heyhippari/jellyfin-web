// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
    getStaticCopyTargets,
    resolveThemeDevelopmentUrl
} from './vite.copy';

describe('Vite static copy development paths', () => {
    it('leaves source-root assets to Vite in development and copies them in builds', () => {
        expect(getStaticCopyTargets('serve')).not.toEqual(expect.arrayContaining([
            expect.objectContaining({ src: 'assets' })
        ]));
        expect(getStaticCopyTargets('build')).toEqual(expect.arrayContaining([
            expect.objectContaining({ src: 'assets', dest: '.' }),
            expect.objectContaining({
                src: [ 'config.json', 'manifest.json', 'robots.txt', 'serviceworker.js' ],
                dest: '.'
            })
        ]));
    });

    it('rewrites stable theme CSS URLs to Vite SCSS inputs', async () => {
        await expect(resolveThemeDevelopmentUrl('/themes/dark/theme.css?version=1')).resolves.toBe(
            '/themes/dark/theme.scss?version=1'
        );
        await expect(resolveThemeDevelopmentUrl('/themes/../dark/theme.css')).resolves.toBeNull();
        await expect(resolveThemeDevelopmentUrl('/themes/%2e%2e/dark/theme.css')).resolves.toBeNull();
        await expect(resolveThemeDevelopmentUrl('/themes/unknown/theme.css')).resolves.toBeNull();
        await expect(resolveThemeDevelopmentUrl('/themes/%E0%A4%A/theme.css')).resolves.toBeNull();
    });
});
