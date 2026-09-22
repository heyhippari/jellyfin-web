import path from 'node:path';
import { defineConfig, type OutputBundle, type Plugin } from 'vite';

import { repositoryRoot } from './vite.shared';

const verifySelfContainedServiceWorker = (): Plugin => ({
    name: 'jellyfin-verify-self-contained-service-worker',
    generateBundle: {
        order: 'post',
        handler(_, bundle: OutputBundle) {
            const chunks = Object.values(bundle).filter(output => output.type === 'chunk');
            if (chunks.length !== 1 || chunks[0].fileName !== 'serviceworker.js') {
                throw new Error('The service-worker build must emit only serviceworker.js.');
            }
            if (chunks[0].imports.length || chunks[0].dynamicImports.length) {
                throw new Error('serviceworker.js must not import shared or dynamic chunks.');
            }
        }
    }
});

export default defineConfig({
    root: path.resolve(repositoryRoot, 'src'),
    base: './',
    plugins: [verifySelfContainedServiceWorker()],
    build: {
        outDir: path.resolve(repositoryRoot, 'dist'),
        emptyOutDir: false,
        copyPublicDir: false,
        rollupOptions: {
            input: path.resolve(repositoryRoot, 'src/serviceworker.js'),
            output: {
                format: 'iife',
                inlineDynamicImports: true,
                entryFileNames: 'serviceworker.js'
            }
        }
    }
});
