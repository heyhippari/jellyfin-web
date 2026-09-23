import path from 'node:path';
import type { Plugin } from 'vite';

import { repositoryRoot } from './vite.shared';

const libarchiveEntry = path.resolve(
    repositoryRoot,
    'node_modules/libarchive.js/dist/libarchive.js'
);
const fallbackWorkerPattern = /\bnew\s+URL\s*\(\s*(['"]\.\/worker-bundle\.js['"])\s*,\s*import\.meta\.url\s*\)/g;

const stripQuery = (id: string) => id.split('?', 1)[0];

export const suppressLibarchiveFallbackWorker = (code: string, id: string) => {
    if (path.resolve(stripQuery(id)) !== libarchiveEntry) return null;

    const matches = [ ...code.matchAll(fallbackWorkerPattern) ];
    if (matches.length !== 1) {
        throw new Error(
            'Expected exactly one libarchive.js fallback worker URL; '
            + `found ${matches.length}.`
        );
    }

    const match = matches[0];
    const start = match.index;
    if (start === undefined) throw new Error('Cannot locate the libarchive.js fallback worker URL.');

    const replacement = `new URL(/* @vite-ignore */ ${match[1]}, import.meta.url)`;
    return {
        code: code.slice(0, start) + replacement + code.slice(start + match[0].length),
        map: null
    };
};

export const libarchiveWorkerPlugin = (): Plugin => ({
    name: 'jellyfin-libarchive-worker',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
        return suppressLibarchiveFallbackWorker(code, id);
    }
});
