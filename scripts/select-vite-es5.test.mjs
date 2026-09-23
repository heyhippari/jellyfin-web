import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { selectViteEs5Files } from './select-vite-es5.mjs';

const temporaryDirectories = [];

const createFixture = async (manifest, files) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'jellyfin-vite-es5-'));
    temporaryDirectories.push(directory);
    await mkdir(path.join(directory, 'assets'), { recursive: true });
    for (const file of files) {
        const filePath = path.join(directory, file);
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, 'var fixture = true;');
    }
    return { directory, manifest };
};

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map(directory => (
        rm(directory, { force: true, recursive: true })
    )));
});

const fixtureManifest = {
    'index-legacy.html': {
        file: 'assets/index-legacy-app.js',
        src: 'index-legacy.html',
        isEntry: true,
        imports: [ '_shared-legacy.js' ],
        dynamicImports: [ 'feature-legacy.js' ]
    },
    '_shared-legacy.js': {
        file: 'assets/shared-legacy-chunk.js'
    },
    'feature-legacy.js': {
        file: 'assets/feature-legacy-chunk.js',
        imports: [ '_shared-legacy.js' ]
    },
    '../vite/legacy-polyfills-legacy': {
        file: 'assets/polyfills-legacy-runtime.js',
        src: '../vite/legacy-polyfills-legacy',
        isEntry: true
    },
    'index.html': {
        file: 'assets/index-modern.js',
        src: 'index.html',
        isEntry: true,
        dynamicImports: [ 'feature.js' ]
    },
    'feature.js': {
        file: 'assets/feature-modern.js'
    }
};

const fixtureFiles = [
    'assets/index-legacy-app.js',
    'assets/shared-legacy-chunk.js',
    'assets/feature-legacy-chunk.js',
    'assets/polyfills-legacy-runtime.js',
    'assets/index-modern.js',
    'assets/feature-modern.js',
    'assets/blurhash.worker-fixture.js',
    'serviceworker.js'
];

describe('Vite ES5 output selector', () => {
    it('selects the complete legacy graph, polyfills, and owned classic workers only', async () => {
        const fixture = await createFixture(fixtureManifest, fixtureFiles);
        const selection = await selectViteEs5Files({
            distDirectory: fixture.directory,
            manifest: fixture.manifest
        });

        expect(selection.applicationFiles).toEqual([
            'assets/feature-legacy-chunk.js',
            'assets/index-legacy-app.js',
            'assets/shared-legacy-chunk.js'
        ]);
        expect(selection.polyfillFile).toBe('assets/polyfills-legacy-runtime.js');
        expect(selection.classicWorkerFiles).toEqual([
            'assets/blurhash.worker-fixture.js',
            'serviceworker.js'
        ]);
        expect(selection.files).not.toContain('assets/index-modern.js');
        expect(selection.files).not.toContain('assets/feature-modern.js');
    });

    it('rejects an empty legacy graph', async () => {
        const fixture = await createFixture({}, [
            'assets/blurhash.worker-fixture.js',
            'serviceworker.js'
        ]);

        await expect(selectViteEs5Files({
            distDirectory: fixture.directory,
            manifest: fixture.manifest
        })).rejects.toThrow('Expected exactly one legacy application entry; found 0.');
    });

    it('rejects a graph whose selected output file is missing', async () => {
        const fixture = await createFixture(
            fixtureManifest,
            fixtureFiles.filter(file => file !== 'assets/feature-legacy-chunk.js')
        );

        await expect(selectViteEs5Files({
            distDirectory: fixture.directory,
            manifest: fixture.manifest
        })).rejects.toThrow('Selected ES5 output is missing: assets/feature-legacy-chunk.js.');
    });

    it('rejects a graph that references a missing manifest entry', async () => {
        const manifest = structuredClone(fixtureManifest);
        manifest['index-legacy.html'].imports.push('missing-legacy.js');
        const fixture = await createFixture(manifest, fixtureFiles);

        await expect(selectViteEs5Files({
            distDirectory: fixture.directory,
            manifest: fixture.manifest
        })).rejects.toThrow('Legacy manifest graph references missing entry "missing-legacy.js".');
    });
});
