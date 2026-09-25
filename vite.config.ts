// eslint-disable-next-line import/no-unresolved
import legacy from '@vitejs/plugin-legacy';
// eslint-disable-next-line import/no-unresolved
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

import { classicScriptTransformPlugin, legacyPolyfillEs5Plugin } from './vite.classic-script';
import { staticCopyPlugins } from './vite.copy';
import { libarchiveWorkerPlugin } from './vite.libarchive';
import { createTsconfigPathsPlugin, repositoryRoot } from './vite.shared';

const packageJson = JSON.parse(
    readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8')
);

const getCommitSha = () => {
    try {
        // eslint-disable-next-line sonarjs/no-os-command-from-path
        return execFileSync('git', [ 'describe', '--always', '--dirty' ], {
            encoding: 'utf8'
        }).trim();
    } catch (error) {
        console.warn('Failed to determine the current git revision.', error);
        return '';
    }
};

const getBuildDefinitions = (devServer: boolean) => ({
    __COMMIT_SHA__: JSON.stringify(getCommitSha()),
    __JF_BUILD_VERSION__: JSON.stringify(
        devServer ? 'Dev Server' : process.env.JELLYFIN_VERSION || 'Release'
    ),
    __PACKAGE_JSON_NAME__: JSON.stringify(packageJson.name),
    __PACKAGE_JSON_VERSION__: JSON.stringify(packageJson.version),
    __USE_SYSTEM_FONTS__: Boolean(JSON.parse(process.env.USE_SYSTEM_FONTS || '0')),
    __DEV_SERVER__: devServer
});

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

export default defineConfig(({ command, isPreview, mode }) => ({
    root: resolve(repositoryRoot, 'src'),
    base: './',
    define: getBuildDefinitions(command === 'serve' && !isPreview),
    optimizeDeps: {
        include: DATE_FNS_LOCALE_MODULES
    },
    plugins: [
        libarchiveWorkerPlugin(),
        ...staticCopyPlugins(command),
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
        minify: mode === 'production',
        sourcemap: mode !== 'production',
        manifest: true
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
