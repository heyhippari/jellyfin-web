// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { suppressLibarchiveFallbackWorker } from './vite.libarchive';
import { repositoryRoot } from './vite.shared';

const libarchiveEntry = path.resolve(
    repositoryRoot,
    'node_modules/libarchive.js/dist/libarchive.js'
);

describe('libarchive fallback worker transform', () => {
    it('keeps the package fallback at runtime without adding it to Vite\'s asset graph', async () => {
        const source = await readFile(libarchiveEntry, 'utf8');
        const transformed = suppressLibarchiveFallbackWorker(source, libarchiveEntry);

        expect(transformed?.code).toContain(
            'new URL(/* @vite-ignore */ "./worker-bundle.js", import.meta.url)'
        );
    });

    it('does not transform other modules', () => {
        expect(suppressLibarchiveFallbackWorker(
            'new URL("./worker-bundle.js", import.meta.url)',
            path.resolve(repositoryRoot, 'src/example.js')
        )).toBeNull();
    });

    it('fails when the pinned dependency changes its fallback expression', () => {
        expect(() => suppressLibarchiveFallbackWorker(
            'export const changed = true;',
            libarchiveEntry
        )).toThrow('Expected exactly one libarchive.js fallback worker URL; found 0.');
    });
});
