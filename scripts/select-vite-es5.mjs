#!/usr/bin/env node

import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LEGACY_ENTRY_SOURCE = 'index-legacy.html';
const LEGACY_POLYFILL_SOURCE = '../vite/legacy-polyfills-legacy';
const BLURHASH_WORKER_PATTERN = /^assets\/blurhash\.worker-[^/]+\.js$/;

// These scripts are shipped byte-for-byte from their packages. Jellyfin owns
// their stable URLs and verifies their runtime dependencies, but not their
// syntax transformation. The libbitsub module-worker helper is likewise an
// upstream ESM asset rather than a Jellyfin classic script.
export const THIRD_PARTY_SCRIPT_EXCLUSIONS = [
    'libraries/pdf.worker.js (copied from pdfjs-dist)',
    'libraries/worker-bundle.js (copied module worker from libarchive.js)',
    'libraries/subtitles-octopus-worker.js (copied from @jellyfin/libass-wasm)',
    'libraries/subtitles-octopus-worker-legacy.js (copied from @jellyfin/libass-wasm)',
    'assets/libbitsub-*.js (third-party libbitsub module-worker helper)'
];

const assertManifestEntry = (manifest, key) => {
    const entry = manifest[key];
    if (!entry || typeof entry !== 'object') {
        throw new Error(`Legacy manifest graph references missing entry ${JSON.stringify(key)}.`);
    }
    if (typeof entry.file !== 'string' || !entry.file.endsWith('.js')) {
        throw new Error(`Legacy manifest entry ${JSON.stringify(key)} has no JavaScript file.`);
    }
    return entry;
};

const findEntryKey = (manifest, source, label) => {
    const keys = Object.entries(manifest)
        .filter(([, entry ]) => entry?.isEntry === true && entry.src === source)
        .map(([ key ]) => key);
    if (keys.length !== 1) {
        throw new Error(`Expected exactly one ${label}; found ${keys.length}.`);
    }
    return keys[0];
};

const collectReachableFiles = (manifest, rootKey) => {
    const pending = [ rootKey ];
    const visited = new Set();
    const files = new Set();

    while (pending.length) {
        const key = pending.pop();
        if (visited.has(key)) continue;
        visited.add(key);

        const entry = assertManifestEntry(manifest, key);
        if (!entry.file.includes('-legacy-')) {
            throw new Error(
                `Legacy manifest graph reached non-legacy output ${JSON.stringify(entry.file)}.`
            );
        }
        files.add(entry.file);

        for (const reference of [ ...(entry.imports || []), ...(entry.dynamicImports || []) ]) {
            if (typeof reference !== 'string') {
                throw new Error(`Legacy manifest entry ${JSON.stringify(key)} has an invalid reference.`);
            }
            pending.push(reference);
        }
    }

    return files;
};

const assertOutputFilesExist = async (distDirectory, relativePaths) => {
    for (const relativePath of relativePaths) {
        try {
            await access(path.join(distDirectory, relativePath));
        } catch {
            throw new Error(`Selected ES5 output is missing: ${relativePath}.`);
        }
    }
};

const findBlurHashWorker = async distDirectory => {
    const assetsDirectory = path.join(distDirectory, 'assets');
    const matches = (await readdir(assetsDirectory))
        .map(fileName => `assets/${fileName}`)
        .filter(fileName => BLURHASH_WORKER_PATTERN.test(fileName));
    if (matches.length !== 1) {
        throw new Error(`Expected exactly one final BlurHash worker; found ${matches.length}.`);
    }
    return matches[0];
};

export const selectViteEs5Files = async ({
    distDirectory = path.resolve('dist'),
    manifest
} = {}) => {
    const resolvedDistDirectory = path.resolve(distDirectory);
    const parsedManifest = manifest || JSON.parse(await readFile(
        path.join(resolvedDistDirectory, '.vite/manifest.json'),
        'utf8'
    ));
    if (!parsedManifest || typeof parsedManifest !== 'object' || Array.isArray(parsedManifest)) {
        throw new Error('Vite manifest must be an object.');
    }

    const applicationEntryKey = findEntryKey(
        parsedManifest,
        LEGACY_ENTRY_SOURCE,
        'legacy application entry'
    );
    const applicationFiles = collectReachableFiles(parsedManifest, applicationEntryKey);
    if (!applicationFiles.size) throw new Error('The reachable legacy application graph is empty.');

    const polyfillEntryKey = findEntryKey(
        parsedManifest,
        LEGACY_POLYFILL_SOURCE,
        'legacy polyfill entry'
    );
    const polyfillEntry = assertManifestEntry(parsedManifest, polyfillEntryKey);
    if (!polyfillEntry.file.includes('-legacy-')) {
        throw new Error(`Legacy polyfill entry is not a legacy output: ${polyfillEntry.file}.`);
    }

    const legacyFiles = [ ...applicationFiles, polyfillEntry.file ].sort();
    const classicWorkerFiles = [
        await findBlurHashWorker(resolvedDistDirectory),
        'serviceworker.js'
    ].sort();
    const files = [ ...legacyFiles, ...classicWorkerFiles ];
    await assertOutputFilesExist(resolvedDistDirectory, files);

    return {
        applicationFiles: [ ...applicationFiles ].sort(),
        classicWorkerFiles,
        files,
        legacyFiles,
        polyfillFile: polyfillEntry.file,
        thirdPartyExclusions: THIRD_PARTY_SCRIPT_EXCLUSIONS
    };
};

const runEsCheck = async ({ distDirectory, files }) => {
    const executable = path.resolve('node_modules/es-check/lib/cli/index.js');
    const absoluteFiles = files.map(file => path.join(distDirectory, file));
    const child = spawn(process.execPath, [ executable, 'es5', ...absoluteFiles ], {
        stdio: 'inherit'
    });
    const exitCode = await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', code => resolve(code ?? 1));
    });
    if (exitCode !== 0) throw new Error(`es-check exited with status ${exitCode}.`);
};

const isMainModule = process.argv[1]
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
    const distDirectory = path.resolve('dist');
    const selection = await selectViteEs5Files({ distDirectory });
    console.log(
        `Vite legacy ES5 check: ${selection.files.length} generated files `
        + `(${selection.applicationFiles.length} legacy application chunks, 1 legacy polyfill chunk, `
        + `${selection.classicWorkerFiles.length} Jellyfin classic workers).`
    );
    for (const file of selection.files) console.log(`  checking ${file}`);
    console.log('Explicit third-party script exclusions:');
    for (const exclusion of selection.thirdPartyExclusions) console.log(`  ${exclusion}`);
    await runEsCheck({ distDirectory, files: selection.files });
}
