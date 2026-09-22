import fg from 'fast-glob';
import path from 'node:path';
import { defineConfig, type OutputBundle, type Plugin } from 'vite';

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

const removeVerifiedThemeStubs = (): Plugin => ({
    name: 'jellyfin-remove-theme-stubs',
    enforce: 'post',
    generateBundle: {
        order: 'post',
        handler(_, bundle: OutputBundle) {
            for (const entryName of Object.keys(themeInputs)) {
                const cssFile = `${entryName}.css`;
                const cssAsset = bundle[cssFile];
                if (cssAsset?.type !== 'asset') {
                    throw new Error(`Theme build did not emit ${cssFile}; refusing to remove JavaScript stubs.`);
                }
            }

            const themeSourcePaths = new Set(Object.values(themeInputs));
            for (const [ fileName, output ] of Object.entries(bundle)) {
                if (output.type === 'chunk' && output.facadeModuleId && themeSourcePaths.has(output.facadeModuleId)) {
                    delete bundle[fileName];
                }
            }
        }
    }
});

export default defineConfig({
    root: sourceRoot,
    base: './',
    plugins: [removeVerifiedThemeStubs()],
    build: {
        outDir: path.resolve(repositoryRoot, 'dist'),
        emptyOutDir: false,
        copyPublicDir: false,
        cssCodeSplit: true,
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
});
