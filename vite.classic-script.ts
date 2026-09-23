import { transformAsync } from '@babel/core';
import presetEnv from '@babel/preset-env';
import type { OutputChunk } from 'rollup';
import type { Plugin } from 'vite';

interface ClassicScriptTransformOptions {
    name: string
    targets: string[]
    test: (chunk: OutputChunk) => boolean
}

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
