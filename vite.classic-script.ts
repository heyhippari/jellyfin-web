import { transformAsync } from '@babel/core';
import presetEnv from '@babel/preset-env';
import type { OutputBundle, OutputChunk } from 'rollup';
import type { Plugin } from 'vite';

interface ClassicScriptTransformOptions {
    name: string
    targets: string[]
    test: (chunk: OutputChunk) => boolean
}

const LEGACY_POLYFILL_FILE = /(?:^|\/)polyfills-legacy-[^/]+\.js$/;

export const transformClassicScript = async (
    code: string,
    filename: string,
    targets: string[]
) => {
    const result = await transformAsync(code, {
        babelrc: false,
        browserslistConfigFile: false,
        comments: false,
        compact: true,
        configFile: false,
        filename,
        presets: [[ presetEnv, {
            bugfixes: true,
            modules: false,
            targets,
            useBuiltIns: false
        } ]],
        sourceMaps: false
    });

    if (!result?.code) {
        throw new Error(`Babel did not produce transformed output for ${filename}.`);
    }

    return result.code;
};

/**
 * Vite's legacy plugin intentionally skips worker builds. Transform only the
 * explicitly selected, Jellyfin-owned classic script after Rollup has made it
 * self-contained.
 */
export const classicScriptTransformPlugin = ({
    name,
    targets,
    test
}: ClassicScriptTransformOptions): Plugin => {
    let transformedChunks = 0;

    return {
        name,
        apply: 'build',
        async renderChunk(code, chunk, outputOptions) {
            if (!test(chunk)) return null;
            if (outputOptions.format !== 'iife') {
                throw new Error(`${chunk.fileName} must be emitted as a classic IIFE script.`);
            }

            transformedChunks += 1;
            return {
                code: await transformClassicScript(code, chunk.fileName, targets),
                map: null
            };
        },
        generateBundle() {
            if (transformedChunks !== 1) {
                throw new Error(
                    `${name} expected to transform exactly one classic script; `
                    + `transformed ${transformedChunks}.`
                );
            }
        }
    };
};

export const transformLegacyPolyfillBundle = async (
    bundle: OutputBundle,
    targets: string[]
) => {
    const polyfillChunks = Object.values(bundle).filter((output): output is OutputChunk => (
        output.type === 'chunk' && LEGACY_POLYFILL_FILE.test(output.fileName)
    ));

    if (polyfillChunks.length !== 1) {
        throw new Error(
            `Expected exactly one Vite legacy polyfill chunk; found ${polyfillChunks.length}.`
        );
    }

    const polyfillChunk = polyfillChunks[0];
    polyfillChunk.code = await transformClassicScript(
        polyfillChunk.code,
        polyfillChunk.fileName,
        targets
    );
};

/**
 * Vite's legacy plugin generates its polyfill entry through a separate build,
 * bypassing the Babel pass it applies to legacy application chunks. Transform
 * that one generated classic script after plugin-legacy adds it to the bundle.
 * https://github.com/vitejs/vite/issues/10284
 */
export const legacyPolyfillEs5Plugin = (targets: string[]): Plugin => ({
    name: 'jellyfin-legacy-polyfill-es5',
    apply: 'build',
    generateBundle: {
        order: 'post',
        async handler(outputOptions, bundle) {
            if (outputOptions.format !== 'system') return;
            await transformLegacyPolyfillBundle(bundle, targets);
        }
    }
});
