import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import tsconfigPaths from 'vite-tsconfig-paths';

export const repositoryRoot = dirname(fileURLToPath(import.meta.url));

export const createTsconfigPathsPlugin = () => tsconfigPaths({
    projects: [resolve(repositoryRoot, 'tsconfig.json')]
});
