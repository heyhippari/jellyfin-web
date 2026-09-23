import { describe, expect, it } from 'vitest';

import {
    getLibarchiveWorkerErrors,
    getServiceWorkerErrors
} from './audit-build-output.mjs';

describe('service-worker output audit', () => {
    it('rejects loading the service worker as a page script', () => {
        expect(getServiceWorkerErrors({
            importsSharedApplicationChunks: false,
            pageScriptReference: true
        })).toContain('serviceworker.js is referenced as a page script');
    });

    it('rejects service workers that share application chunks', () => {
        expect(getServiceWorkerErrors({
            importsSharedApplicationChunks: true,
            pageScriptReference: false
        })).toContain('serviceworker.js depends on shared application/runtime chunks');
    });

    it('accepts an isolated worker loaded only through registration', () => {
        expect(getServiceWorkerErrors({
            importsSharedApplicationChunks: false,
            pageScriptReference: false
        })).toEqual([]);
    });
});

describe('libarchive worker output audit', () => {
    it('accepts the copied worker without a bundled fallback', () => {
        expect(getLibarchiveWorkerErrors({
            bundledFallbackFiles: [],
            playerRequestedFiles: [ 'worker-bundle.js' ]
        })).toEqual([]);
    });

    it('rejects a bundled fallback worker', () => {
        expect(getLibarchiveWorkerErrors({
            bundledFallbackFiles: [ 'assets/worker-bundle-hash.js' ],
            playerRequestedFiles: [ 'worker-bundle.js' ]
        })).toContain(
            'libarchive.js fallback worker is bundled as assets/worker-bundle-hash.js'
        );
    });

    it('rejects a player that does not request the copied worker', () => {
        expect(getLibarchiveWorkerErrors({
            bundledFallbackFiles: [],
            playerRequestedFiles: [ 'worker-bundle-hash.js' ]
        })).toContain(
            'src/plugins/comicsPlayer/plugin.js must request only libraries/worker-bundle.js'
        );
    });
});
