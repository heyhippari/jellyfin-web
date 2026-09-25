import { stat } from 'node:fs/promises';
import path from 'node:path';
import { normalizePath, type ConfigEnv, type Plugin } from 'vite';
import { viteStaticCopy, type Target } from 'vite-plugin-static-copy';

import {
    COPIED_ROOT_FILES,
    FAVICON_FILES,
    LIBRARY_COPIES
} from './scripts/static-build-contract.mjs';
import { repositoryRoot } from './vite.shared';

const sourceRoot = path.resolve(repositoryRoot, 'src');

const externalCopyTargets: Target[] = [
    {
        src: FAVICON_FILES.map(fileName => normalizePath(path.resolve(
            repositoryRoot,
            'node_modules/@jellyfin/ux-web/favicons',
            fileName
        ))),
        dest: 'favicons',
        rename: { stripBase: true }
    },
    ...LIBRARY_COPIES.map(({ source, target }) => ({
        src: normalizePath(path.resolve(repositoryRoot, 'node_modules', source)),
        dest: 'libraries',
        rename: {
            name: target,
            stripBase: true
        }
    }))
];

const buildCopyTargets: Target[] = [
    {
        src: 'assets',
        dest: '.'
    },
    {
        src: COPIED_ROOT_FILES,
        dest: '.'
    },
    ...externalCopyTargets
];

export const getStaticCopyTargets = (command: ConfigEnv['command']) => (
    command === 'build' ? buildCopyTargets : externalCopyTargets
);

export const resolveThemeDevelopmentUrl = async (requestUrl: string) => {
    let pathname: string;
    let search: string;
    try {
        // eslint-disable-next-line sonarjs/no-clear-text-protocols -- Synthetic URL used only to parse a local request.
        const url = new URL(requestUrl, 'http://vite.invalid');
        pathname = decodeURIComponent(url.pathname);
        search = url.search;
    } catch {
        return null;
    }

    const match = pathname.match(/^\/themes\/([A-Za-z0-9_-]+)\/theme\.css$/);
    if (!match) return null;

    const source = path.resolve(sourceRoot, 'themes', match[1], 'theme.scss');
    try {
        if (!(await stat(source)).isFile()) return null;
    } catch {
        return null;
    }

    return `/themes/${match[1]}/theme.scss${search}`;
};

const themeDevelopmentPlugin = (): Plugin => ({
    name: 'jellyfin-theme-development-url',
    apply: 'serve',
    configureServer(server) {
        server.middlewares.use(async (request, _response, next) => {
            if (!request.url || ![ 'GET', 'HEAD' ].includes(request.method || '')) {
                next();
                return;
            }

            try {
                const themeUrl = await resolveThemeDevelopmentUrl(request.url);
                if (themeUrl) request.url = themeUrl;
                next();
            } catch (error) {
                next(error as Error);
            }
        });
    }
});

export const staticCopyPlugins = (command: ConfigEnv['command']): Plugin[] => [
    themeDevelopmentPlugin(),
    ...viteStaticCopy({
        targets: getStaticCopyTargets(command)
    })
];
