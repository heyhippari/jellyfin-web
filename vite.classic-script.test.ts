import { describe, expect, it } from 'vitest';

import { transformClassicScript } from './vite.classic-script';

const targets = [ 'Chrome 27', 'iOS > 10' ];

describe('classic script Babel transform', () => {
    it('uses the legacy browser targets for final classic-script syntax', async () => {
        const output = await transformClassicScript(
            'const double = value => value * 2; self.result = double(3);',
            'fixture.js',
            targets
        );

        expect(output).not.toMatch(/\bconst\b|=>/);

        const workerGlobal: { result?: number } = {};
        // eslint-disable-next-line sonarjs/code-eval -- Executes only the local synthetic Babel fixture.
        Function('self', output)(workerGlobal);
        expect(workerGlobal.result).toBe(6);
    });
});
