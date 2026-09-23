// eslint-disable-next-line import/no-unresolved
import legacy from '@vitejs/plugin-legacy';
// eslint-disable-next-line import/no-unresolved
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

import { assertSupportedViteVersions } from './scripts/vite-version-guard.mjs';
import { classicScriptTransformPlugin, legacyPolyfillEs5Plugin } from './vite.classic-script';
import { staticCopyPlugin } from './vite.copy';
import { libarchiveWorkerPlugin } from './vite.libarchive';
import { createTsconfigPathsPlugin, repositoryRoot } from './vite.shared';

const require = createRequire(import.meta.url);
const { getBuildDefinitions } = require('./scripts/build-constants.cjs');

const packageJson = JSON.parse(
    readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8')
);

// date-fns locales are selected lazily at runtime. Vite's dev dependency scan
// cannot discover those imports, so prebundle the CommonJS entry points that
// dateFnsLocale.ts can request.
const DATE_FNS_LOCALE_MODULES = [
    'af', 'ar-DZ', 'be', 'bg', 'bn', 'ca', 'cs', 'cy', 'da', 'de', 'el',
    'en-GB', 'en-US', 'eo', 'es', 'et', 'eu', 'fa-IR', 'fi', 'fr', 'fr-CA',
    'gl', 'he', 'hi', 'hr', 'hu', 'id', 'is', 'it', 'ja', 'kk', 'ko', 'lt',
    'lv', 'ms', 'nb', 'nl', 'nn', 'pl', 'pt', 'pt-BR', 'ro', 'ru', 'sk',
    'sl', 'sv', 'ta', 'th', 'tr', 'uk', 'vi', 'zh-CN', 'zh-HK', 'zh-TW'
].map(locale => `date-fns/locale/${locale}/index.js`);

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
    optimizeDeps: {
        include: DATE_FNS_LOCALE_MODULES
    },
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
            // DOM APIs are not discovered by preset-env's usage analysis. Keep
            // them in Vite's nomodule-only polyfill graph; modern browsers load
            // them only through feature detection in lib/legacy/index.ts.
            // AbortController must follow fetch because it patches fetch.
            additionalLegacyPolyfills: [
                'element-closest-polyfill',
                'fast-text-encoding',
                'intersection-observer',
                'classlist.js',
                'whatwg-fetch',
                'abortcontroller-polyfill',
                'resize-observer-polyfill',
                'proxy-polyfill',
                // Legacy async transforms can need regenerator-runtime. Defining
                // globalThis first avoids its CSP-incompatible Function fallback.
                'core-js/proposals/global-this'
            ],
            modernPolyfills: false
        }),
        legacyPolyfillEs5Plugin(packageJson.browserslist)
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
