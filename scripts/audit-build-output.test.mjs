import { describe, expect, it } from 'vitest';

import { getServiceWorkerErrors } from './audit-build-output.mjs';

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
