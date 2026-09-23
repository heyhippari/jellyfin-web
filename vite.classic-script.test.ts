import type { OutputBundle, OutputOptions } from 'rollup';
import { describe, expect, it } from 'vitest';

import {
    transformClassicScript,
    legacyPolyfillEs5Plugin,
    transformLegacyPolyfillBundle
} from './vite.classic-script';

const targets = [ 'Chrome 27', 'iOS > 10' ];

describe('classic script Babel transform', () => {
    it('uses the legacy browser targets for final classic-script syntax', async () => {
        const output = await transformClassicScript(
            'const double = value => value * 2; self.result = double(3);',
            'fixture.js',
            targets
        );

        expect(output).not.toMatch(/\bconst\b|=>/);

        const workerGlobal: { result?: number } = {};
        // eslint-disable-next-line sonarjs/code-eval -- Executes only the local synthetic Babel fixture.
        Function('self', output)(workerGlobal);
        expect(workerGlobal.result).toBe(6);
    });

    it('transforms the Vite-generated legacy polyfill chunk after generation', async () => {
        const bundle = {
            'assets/polyfills-legacy-fixture.js': {
                code: 'let value = 1; self.result = value;',
                fileName: 'assets/polyfills-legacy-fixture.js',
                imports: [],
                isDynamicEntry: false,
                isEntry: true,
                isImplicitEntry: false,
                moduleIds: [],
                modules: {},
                name: 'polyfills',
                referencedFiles: [],
                type: 'chunk'
            }
        } satisfies OutputBundle;

        await transformLegacyPolyfillBundle(bundle, targets);

        expect(bundle['assets/polyfills-legacy-fixture.js'].code).not.toMatch(/\blet\b/);
    });

    it('rejects a bundle without exactly one legacy polyfill chunk', async () => {
        await expect(transformLegacyPolyfillBundle({}, targets)).rejects.toThrow(
            'Expected exactly one Vite legacy polyfill chunk; found 0.'
        );
    });

    it('only transforms the SystemJS legacy output', async () => {
        const plugin = legacyPolyfillEs5Plugin(targets);
        const generateBundle = plugin.generateBundle;
        if (typeof generateBundle === 'function' || !generateBundle) {
            throw new Error('Expected an object-form generateBundle hook.');
        }

        await generateBundle.handler.call({}, { format: 'es' } as OutputOptions, {});
        expect(plugin.name).toBe('jellyfin-legacy-polyfill-es5');
    });
});
