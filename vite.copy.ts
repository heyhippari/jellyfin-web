import { createReadStream } from 'node:fs';
import {
    copyFile,
    cp,
    mkdir,
    realpath,
    stat
} from 'node:fs/promises';
import path from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

import {
    COPIED_ROOT_FILES,
    FAVICON_FILES,
    LIBRARY_COPIES
} from './scripts/static-build-contract.mjs';
import { repositoryRoot } from './vite.shared';

const CONTENT_TYPES = new Map([
    [ '.ico', 'image/x-icon' ],
    [ '.js', 'text/javascript; charset=utf-8' ],
    [ '.json', 'application/json; charset=utf-8' ],
    [ '.png', 'image/png' ],
    [ '.svg', 'image/svg+xml' ],
    [ '.txt', 'text/plain; charset=utf-8' ],
    [ '.wasm', 'application/wasm' ],
    [ '.woff2', 'font/woff2' ]
]);

interface StaticFile {
    source: string
    target: string
}

const assetsSource = path.resolve(repositoryRoot, 'src/assets');

const staticFiles: StaticFile[] = [
    ...COPIED_ROOT_FILES.map(fileName => ({
        source: path.resolve(repositoryRoot, 'src', fileName),
        target: fileName
    })),
    ...FAVICON_FILES.map(fileName => ({
        source: path.resolve(repositoryRoot, 'node_modules/@jellyfin/ux-web/favicons', fileName),
        target: `favicons/${fileName}`
    })),
    ...LIBRARY_COPIES.map(({ source, target }) => ({
        source: path.resolve(repositoryRoot, 'node_modules', source),
        target: `libraries/${target}`
    }))
];

const staticFilesByUrl = new Map(
    staticFiles.map(file => [ `/${file.target}`, file.source ])
);

const isPathInside = (parent: string, child: string) => {
    const relativePath = path.relative(parent, child);
    return relativePath === '' || (
        !relativePath.startsWith(`..${path.sep}`)
        && relativePath !== '..'
        && !path.isAbsolute(relativePath)
    );
};

const parseRequestPath = (requestUrl: string) => {
    const rawPath = requestUrl.split(/[?#]/, 1)[0];
    let pathname: string;
    try {
        pathname = decodeURIComponent(rawPath);
    } catch {
        return null;
    }

    if (
        !pathname.startsWith('/')
        || pathname.includes('\0')
        || pathname.includes('\\')
        || pathname.split('/').includes('..')
    ) {
        return null;
    }

    return pathname;
};

const resolveExistingFile = async (sourceRoot: string, candidate: string) => {
    if (!isPathInside(sourceRoot, candidate)) return null;

    try {
        const [ resolvedRoot, resolvedFile, fileStats ] = await Promise.all([
            realpath(sourceRoot),
            realpath(candidate),
            stat(candidate)
        ]);
        if (!fileStats.isFile() || !isPathInside(resolvedRoot, resolvedFile)) return null;
        return resolvedFile;
    } catch {
        return null;
    }
};

export const resolveStaticSource = async (requestUrl: string) => {
    try {
        // Vite appends this query when a source file belongs to the module graph.
        // Let Vite transform JSON and asset imports instead of serving their raw bytes.
        // eslint-disable-next-line sonarjs/no-clear-text-protocols -- Synthetic URL used only to parse a local request.
        if (new URL(requestUrl, 'http://vite.invalid').searchParams.has('import')) return null;
    } catch {
        return null;
    }

    const pathname = parseRequestPath(requestUrl);
    if (!pathname) return null;

    const exactSource = staticFilesByUrl.get(pathname);
    if (exactSource) return resolveExistingFile(path.dirname(exactSource), exactSource);

    if (!pathname.startsWith('/assets/')) return null;
    const relativePath = pathname.slice('/assets/'.length);
    return resolveExistingFile(assetsSource, path.resolve(assetsSource, relativePath));
};

export const resolveThemeDevelopmentUrl = async (requestUrl: string) => {
    const pathname = parseRequestPath(requestUrl);
    const match = pathname?.match(/^\/themes\/([A-Za-z0-9_-]+)\/theme\.css$/);
    if (!match) return null;

    const source = path.resolve(repositoryRoot, 'src/themes', match[1], 'theme.scss');
    const sourceRoot = path.resolve(repositoryRoot, 'src/themes');
    if (!await resolveExistingFile(sourceRoot, source)) return null;

    const queryIndex = requestUrl.indexOf('?');
    const query = queryIndex < 0 ? '' : requestUrl.slice(queryIndex);
    return `/themes/${match[1]}/theme.scss${query}`;
};

const validateSources = async () => {
    const assetStats = await stat(assetsSource);
    if (!assetStats.isDirectory()) throw new Error(`Static asset source is not a directory: ${assetsSource}`);

    for (const file of staticFiles) {
        const fileStats = await stat(file.source);
        if (!fileStats.isFile()) throw new Error(`Static file source is not a file: ${file.source}`);
    }
};

const copyStaticFiles = async (outDir: string) => {
    await cp(assetsSource, path.resolve(outDir, 'assets'), {
        recursive: true,
        force: true
    });

    for (const file of staticFiles) {
        const target = path.resolve(outDir, file.target);
        await mkdir(path.dirname(target), { recursive: true });
        await copyFile(file.source, target);
    }
};

export const staticCopyPlugin = (): Plugin => {
    let config: ResolvedConfig;

    return {
        name: 'jellyfin-static-copy',
        enforce: 'post',
        async configResolved(resolvedConfig) {
            config = resolvedConfig;
            await validateSources();
        },
        configureServer(server) {
            server.middlewares.use(async (request, response, next) => {
                if (!request.url || ![ 'GET', 'HEAD' ].includes(request.method || '')) {
                    next();
                    return;
                }

                try {
                    const themeUrl = await resolveThemeDevelopmentUrl(request.url);
                    if (themeUrl) {
                        request.url = themeUrl;
                        next();
                        return;
                    }

                    const source = await resolveStaticSource(request.url);
                    if (!source) {
                        next();
                        return;
                    }

                    const fileStats = await stat(source);
                    response.statusCode = 200;
                    response.setHeader('Content-Length', fileStats.size);
                    response.setHeader(
                        'Content-Type',
                        CONTENT_TYPES.get(path.extname(source).toLowerCase()) || 'application/octet-stream'
                    );
                    if (request.method === 'HEAD') {
                        response.end();
                    } else {
                        createReadStream(source).pipe(response);
                    }
                } catch (error) {
                    next(error as Error);
                }
            });
        },
        async writeBundle() {
            await copyStaticFiles(config.build.outDir);
        }
    };
};
