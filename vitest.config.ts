/// <reference types="vitest" />
// eslint-disable-next-line import/no-unresolved
import { defineConfig } from 'vitest/config';

import { createTsconfigPathsPlugin } from './vite.shared';

export default defineConfig({
    plugins: [createTsconfigPathsPlugin()],
    test: {
        coverage: {
            include: ['src']
        },
        environment: 'jsdom',
        restoreMocks: true
    }
});
