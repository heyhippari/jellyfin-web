export const COPIED_ROOT_FILES = [
    'config.json',
    'manifest.json',
    'robots.txt',
    'serviceworker.js'
];

export const FAVICON_FILES = [
    'favicon.ico',
    'touchicon.png',
    'touchicon72.png',
    'touchicon114.png',
    'touchicon144.png',
    'touchicon512.png'
];

export const LIBRARY_COPIES = [
    {
        source: 'native-promise-only/npo.js',
        target: 'npo.js'
    },
    {
        source: 'libarchive.js/dist/worker-bundle.js',
        target: 'worker-bundle.js'
    },
    {
        source: 'libarchive.js/dist/libarchive.wasm',
        target: 'libarchive.wasm'
    },
    {
        source: '@jellyfin/libass-wasm/dist/js/default.woff2',
        target: 'default.woff2'
    },
    {
        source: '@jellyfin/libass-wasm/dist/js/subtitles-octopus-worker.js',
        target: 'subtitles-octopus-worker.js'
    },
    {
        source: '@jellyfin/libass-wasm/dist/js/subtitles-octopus-worker.wasm',
        target: 'subtitles-octopus-worker.wasm'
    },
    {
        source: '@jellyfin/libass-wasm/dist/js/subtitles-octopus-worker-legacy.js',
        target: 'subtitles-octopus-worker-legacy.js'
    },
    {
        source: 'pdfjs-dist/build/pdf.worker.js',
        target: 'pdf.worker.js'
    }
];
