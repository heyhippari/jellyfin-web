import { afterEach, describe, expect, it, vi } from 'vitest';

const workerInstances: Array<{ options: WorkerOptions | undefined }> = [];

class BlurhashWorker {
    options: WorkerOptions | undefined;

    constructor(_url: string | URL, options?: WorkerOptions) {
        this.options = options;
        workerInstances.push(this);
    }

    addEventListener(): void {
        // The constructor contract is the only behavior exercised here.
    }
}

vi.mock('../lazyLoader/lazyLoaderIntersectionObserver', () => ({
    lazyChildren: vi.fn()
}));

vi.mock('../../scripts/settings/userSettings', () => ({
    enableBlurhash: vi.fn(() => true)
}));

describe('legacy image BlurHash worker', () => {
    afterEach(() => {
        vi.resetModules();
        vi.unstubAllGlobals();
        workerInstances.length = 0;
    });

    it('uses a module worker so Vite can load the decoder dependency in development', async () => {
        vi.stubGlobal('Worker', BlurhashWorker);

        await import('./imageLoader');

        expect(workerInstances).toHaveLength(1);
        expect(workerInstances[0].options).toEqual({ type: 'module' });
    });
});
