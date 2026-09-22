import { describe, expect, it } from 'vitest';

import {
    assertSupportedViteMajor,
    assertSupportedViteVersions,
    getResolvedPackageVersion
} from './vite-version-guard.mjs';

describe('Vite version guard', () => {
    it('accepts the checked-in Vite 7 toolchain', () => {
        expect(() => assertSupportedViteVersions()).not.toThrow();
        expect(getResolvedPackageVersion('vite')).toMatch(/^7\./);
        expect(getResolvedPackageVersion('@vitejs/plugin-legacy')).toMatch(/^7\./);
    });

    it.each([
        ['vite', '8.0.0'],
        ['@vitejs/plugin-legacy', '8.1.0']
    ])('rejects %s major version 8', (packageName, version) => {
        expect(() => assertSupportedViteMajor(packageName, version))
            .toThrow(/ES5 output contract/);
    });
});
