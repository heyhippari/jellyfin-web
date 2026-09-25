import fg from 'fast-glob';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

import { repositoryRoot } from './vite.shared';

const sourceRoot = path.resolve(repositoryRoot, 'src');
const themePattern = /^themes\/([A-Za-z0-9_-]+)\/theme\.scss$/;

const themeSources = fg.globSync('themes/**/*.scss', {
    cwd: sourceRoot,
    onlyFiles: true
}).filter(relativePath => !path.basename(relativePath).startsWith('_'));

export const themeInputs = Object.fromEntries(themeSources.map(relativePath => {
    const match = relativePath.match(themePattern);
    if (!match) throw new Error(`Unexpected theme entry path: ${relativePath}`);
    return [ `themes/${match[1]}/theme`, path.resolve(sourceRoot, relativePath) ];
}));

const removeThemeStubs = (): Plugin => ({
    name: 'jellyfin-remove-theme-stubs',
    enforce: 'post',
    generateBundle(_, bundle) {
        for (const [ fileName, output ] of Object.entries(bundle)) {
            if (output.type === 'chunk' && fileName.startsWith('.vite/theme-stubs/')) {
                delete bundle[fileName];
            }
        }
    }
});

export default defineConfig(({ mode }) => ({
    root: sourceRoot,
    base: './',
    plugins: [removeThemeStubs()],
    build: {
        outDir: path.resolve(repositoryRoot, 'dist'),
        emptyOutDir: false,
        copyPublicDir: false,
        cssCodeSplit: true,
        minify: mode === 'production',
        sourcemap: mode !== 'production',
        rollupOptions: {
            input: themeInputs,
            output: {
                entryFileNames: '.vite/theme-stubs/[name].js',
                chunkFileNames: '.vite/theme-stubs/[name]-[hash].js',
                assetFileNames: assetInfo => {
                    const themeCssName = assetInfo.names.find(name => (
                        name.startsWith('themes/') && name.endsWith('.css')
                    ));
                    if (themeCssName) return themeCssName;

                    const themeAssetName = assetInfo.originalFileNames
                        .map(fileName => path.isAbsolute(fileName) ? path.relative(sourceRoot, fileName) : fileName)
                        .find(fileName => /^themes\/[A-Za-z0-9_-]+\/[^/]+$/.test(fileName));
                    return themeAssetName || 'assets/[name]-[hash][extname]';
                }
            }
        }
    }
}));
