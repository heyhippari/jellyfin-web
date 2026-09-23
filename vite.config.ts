// eslint-disable-next-line import/no-unresolved
import legacy from '@vitejs/plugin-legacy';
// eslint-disable-next-line import/no-unresolved
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

import { assertSupportedViteVersions } from './scripts/vite-version-guard.mjs';
import { classicScriptTransformPlugin } from './vite.classic-script';
import { staticCopyPlugin } from './vite.copy';
import { libarchiveWorkerPlugin } from './vite.libarchive';
import { createTsconfigPathsPlugin, repositoryRoot } from './vite.shared';

const require = createRequire(import.meta.url);
const { getBuildDefinitions } = require('./scripts/build-constants.cjs');

const packageJson = JSON.parse(
    readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8')
);

const versionGuard = (): Plugin => ({
    name: 'jellyfin-vite-version-guard',
    apply: 'build',
    config() {
        assertSupportedViteVersions();
    }
});

export default defineConfig(({ command, isPreview, mode }) => ({
    root: resolve(repositoryRoot, 'src'),
    base: './',
    define: getBuildDefinitions({
        devServer: command === 'serve' && !isPreview,
        packageJson
    }),
    plugins: [
        versionGuard(),
        libarchiveWorkerPlugin(),
        staticCopyPlugin(),
        createTsconfigPathsPlugin(),
        react(),
        legacy({
            targets: packageJson.browserslist,
            renderModernChunks: true,
            renderLegacyChunks: true,
            polyfills: true,
            modernPolyfills: false
        })
    ],
    build: {
        outDir: resolve(repositoryRoot, 'dist'),
        emptyOutDir: true,
        sourcemap: mode !== 'production',
        manifest: true,
        rollupOptions: {
            output: {
                entryFileNames: 'assets/[name]-[hash].js',
                chunkFileNames: 'assets/[name]-[hash].js',
                assetFileNames: 'assets/[name]-[hash][extname]'
            }
        }
    },
    worker: {
        format: 'iife',
        plugins: () => [
            classicScriptTransformPlugin({
                name: 'jellyfin-blurhash-worker-es5',
                targets: packageJson.browserslist,
                test: chunk => chunk.name === 'blurhash.worker'
            })
        ]
    }
}));
