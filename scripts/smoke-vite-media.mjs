#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker as ThreadWorker } from 'node:worker_threads';

import { JSDOM } from 'jsdom';
import { build } from 'vite';

const SMOKE_MODULE_ID = '\0jellyfin-vite-media-smoke';
const RESULT_KEY = '__jellyfinViteMediaSmoke';
const FIXTURE_BASE = '/web/';

const MINIMAL_PDF = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << >> /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 0 >>
stream

endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000219 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
268
%%EOF`;

const smokeModuleSource = `
import jQuery from 'jquery';
import { DOMParser } from '@xmldom/xmldom';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import * as pdfWorker from 'pdfjs-dist/build/pdf.worker.js';
import { Archive } from 'libarchive.js';
import SubtitlesOctopus from '@jellyfin/libass-wasm';

globalThis.${RESULT_KEY} = {
    Archive,
    DOMParser,
    GlobalWorkerOptions,
    SubtitlesOctopus,
    getDocument,
    jQuery,
    pdfWorker
};
`;

const buildDependencyFixture = async projectRoot => {
    const result = await build({
        configFile: false,
        logLevel: 'silent',
        root: projectRoot,
        plugins: [{
            name: 'jellyfin-vite-media-smoke-fixture',
            resolveId(id) {
                if (id === 'virtual:jellyfin-vite-media-smoke') return SMOKE_MODULE_ID;
            },
            load(id) {
                if (id === SMOKE_MODULE_ID) return smokeModuleSource;
            }
        }],
        build: {
            minify: true,
            write: false,
            rollupOptions: {
                input: 'virtual:jellyfin-vite-media-smoke',
                output: {
                    format: 'es',
                    inlineDynamicImports: true
                }
            }
        }
    });
    if (Array.isArray(result)) throw new Error('Dependency fixture unexpectedly emitted multiple builds.');
    const chunks = result.output.filter(output => output.type === 'chunk');
    if (chunks.length !== 1) {
        throw new Error(`Dependency fixture expected one chunk; found ${chunks.length}.`);
    }
    return chunks[0].code;
};

const createCanvasContext = () => ({
    clearRect: () => undefined,
    drawImage: () => undefined,
    getImageData: () => ({ data: new Uint8ClampedArray([ 0, 0, 0, 0 ]) }),
    putImageData: () => undefined,
    createImageData: (width, height) => ({
        data: new Uint8ClampedArray(width * height * 4),
        height,
        width
    })
});

const createPdfCanvasContext = canvas => new Proxy({
    canvas,
    getTransform: () => ({
        a: 1,
        b: 0,
        c: 0,
        d: 1,
        e: 0,
        f: 0,
        invertSelf() { return this; }
    })
}, {
    get(target, property) {
        return property in target ? target[property] : () => undefined;
    },
    set(target, property, value) {
        target[property] = value;
        return true;
    }
});

class FixtureImageData {
    constructor(data, width, height) {
        this.data = data;
        this.height = height;
        this.width = width;
    }
}

class FixtureWorker {
    static instances = [];

    constructor(url, options) {
        this.url = String(url);
        this.options = options;
        this.messages = [];
        FixtureWorker.instances.push(this);
    }

    addEventListener() { return undefined; }
    removeEventListener() { return undefined; }
    terminate() { return undefined; }

    postMessage(message) {
        this.messages.push(message);
    }
}

const createWorkerThreadWrapper = targetUrl => `
(async () => {
    const { parentPort } = await import('node:worker_threads');
    const { readFile, readFileSync } = await import('node:fs');
    const listeners = [];
    const pendingMessages = [];
    globalThis.self = globalThis;
    globalThis.location = { href: ${JSON.stringify(targetUrl)} };
    globalThis.addEventListener = (type, listener) => {
        if (type === 'message') listeners.push(listener);
    };
    globalThis.removeEventListener = () => undefined;
    parentPort.on('message', data => {
        const event = { data, origin: '' };
        if (!listeners.length && !globalThis.onmessage) {
            pendingMessages.push(event);
            return;
        }
        for (const listener of listeners) listener(event);
        globalThis.onmessage?.(event);
    });
    globalThis.postMessage = (data, transfer) => parentPort.postMessage(data, transfer);
    globalThis.XMLHttpRequest = class {
        open(method, url) {
            this.url = new URL(url, ${JSON.stringify(targetUrl)});
        }
        send() {
            try {
                const data = readFileSync(this.url);
                this.status = 200;
                this.response = this.responseType === 'arraybuffer'
                    ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
                    : data.toString();
                this.responseText = data.toString();
                this.onload?.();
            } catch (error) {
                this.status = 404;
                this.onerror?.(error);
            }
        }
    };
    const nativeFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
        const url = new URL(String(input), ${JSON.stringify(targetUrl)});
        if (url.protocol === 'file:') {
            const data = await new Promise((resolve, reject) => {
                readFile(url, (error, value) => error ? reject(error) : resolve(value));
            });
            return new Response(data, {
                status: 200,
                headers: {
                    'content-type': url.pathname.endsWith('.wasm')
                        ? 'application/wasm'
                        : 'application/octet-stream'
                }
            });
        }
        return nativeFetch(input, init);
    };
    await import(${JSON.stringify(targetUrl)});
    for (const event of pendingMessages) {
        for (const listener of listeners) listener(event);
        globalThis.onmessage?.(event);
    }
    parentPort.postMessage({ target: 'fixture-imported' });
})().catch(error => {
    postMessage({ target: 'fixture-error', content: error.stack || error.message });
});
`;

class BrowserWorkerThreadAdapter {
    constructor(filePath) {
        const targetUrl = pathToFileURL(filePath).href;
        this.worker = new ThreadWorker(createWorkerThreadWrapper(targetUrl), {
            eval: true,
            execArgv: [ '--no-warnings' ]
        });
        this.listeners = new Map();
    }

    addEventListener(type, listener) {
        const wrapped = type === 'message' ? data => listener({ data }) : listener;
        this.listeners.set(listener, wrapped);
        this.worker.on(type, wrapped);
    }

    removeEventListener(type, listener) {
        const wrapped = this.listeners.get(listener);
        if (wrapped) this.worker.off(type, wrapped);
    }

    postMessage(data, transfer) {
        this.worker.postMessage(data, transfer);
    }

    start() { return undefined; }
    terminate() { return this.worker.terminate(); }
}

const createStoredTar = (fileName, contents) => {
    const header = new Uint8Array(512);
    const encoder = new TextEncoder();
    const write = (offset, length, value) => {
        header.set(encoder.encode(value).subarray(0, length), offset);
    };
    const writeOctal = (offset, length, value) => {
        write(offset, length, value.toString(8).padStart(length - 1, '0'));
    };
    const data = encoder.encode(contents);
    write(0, 100, fileName);
    writeOctal(100, 8, 0o644);
    writeOctal(108, 8, 0);
    writeOctal(116, 8, 0);
    writeOctal(124, 12, data.length);
    writeOctal(136, 12, 0);
    header.fill(0x20, 148, 156);
    header[156] = '0'.charCodeAt(0);
    write(257, 6, 'ustar');
    write(263, 2, '00');
    const checksum = header.reduce((sum, value) => sum + value, 0);
    write(148, 8, `${checksum.toString(8).padStart(6, '0')}\0 `);

    const dataBlocks = Math.ceil(data.length / 512);
    const archive = new Uint8Array(512 + dataBlocks * 512 + 1024);
    archive.set(header);
    archive.set(data, 512);
    return archive;
};

const installBrowserFixture = () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
        // eslint-disable-next-line sonarjs/no-clear-text-protocols -- Synthetic local browser URL.
        url: 'http://fixture.invalid/web/'
    });
    const previous = new Map();
    const globals = {
        document: dom.window.document,
        ImageData: FixtureImageData,
        navigator: dom.window.navigator,
        window: dom.window,
        Worker: FixtureWorker
    };
    for (const [ key, value ] of Object.entries(globals)) {
        previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
        Object.defineProperty(globalThis, key, {
            configurable: true,
            value,
            writable: true
        });
    }
    dom.window.Worker = FixtureWorker;
    dom.window.ImageData = FixtureImageData;
    dom.window.HTMLCanvasElement.prototype.getContext = () => createCanvasContext();
    dom.window.requestAnimationFrame = callback => setTimeout(callback, 0);
    dom.window.cancelAnimationFrame = timer => clearTimeout(timer);

    return () => {
        dom.window.close();
        for (const [ key, descriptor ] of previous) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete globalThis[key];
        }
    };
};

const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

const verifyCopiedWorkerPayloads = async distDirectory => {
    const library = fileName => path.join(distDirectory, 'libraries', fileName);
    const [
        archiveWorker,
        archiveWasm,
        pdfWorker,
        subtitleWorker,
        subtitleWasm,
        legacySubtitleWorker
    ] = await Promise.all([
        readFile(library('worker-bundle.js'), 'utf8'),
        readFile(library('libarchive.wasm')),
        readFile(library('pdf.worker.js'), 'utf8'),
        readFile(library('subtitles-octopus-worker.js'), 'utf8'),
        readFile(library('subtitles-octopus-worker.wasm')),
        readFile(library('subtitles-octopus-worker-legacy.js'), 'utf8')
    ]);

    assert(archiveWorker.includes('libarchive.wasm'), 'libarchive worker does not request libarchive.wasm.');
    assert(
        subtitleWorker.includes('subtitles-octopus-worker.wasm'),
        'libass worker does not request subtitles-octopus-worker.wasm.'
    );
    assert(
        legacySubtitleWorker.includes('wasmBinary=[]'),
        'libass legacy worker is not the expected self-contained fallback.'
    );
    assert(
        pdfWorker.includes('WorkerMessageHandler'),
        'PDF.js worker does not expose WorkerMessageHandler.'
    );
    await Promise.all([
        WebAssembly.compile(archiveWasm),
        WebAssembly.compile(subtitleWasm)
    ]);
    // These Emscripten payloads are copied byte-for-byte and execute only in a
    // real browser worker. Their URL selection and initialization contract is
    // exercised below through the public SubtitlesOctopus adapter; executing
    // them in a Node worker thread selects an unsupported Emscripten loader.
};

const verifyDependencyRuntime = async (dependencies, distDirectory) => {
    const {
        Archive,
        DOMParser,
        GlobalWorkerOptions,
        SubtitlesOctopus,
        getDocument,
        jQuery,
        pdfWorker
    } = dependencies;

    assert(typeof jQuery === 'function', 'Vite did not expose the jQuery CommonJS export.');
    assert(jQuery('<div>').length === 1, 'The converted jQuery export is not callable.');
    assert(
        new DOMParser().parseFromString('<root/>', 'text/xml').documentElement.nodeName === 'root',
        'Vite did not expose the XML DOM parser export.'
    );

    globalThis.pdfjsWorker = pdfWorker;
    GlobalWorkerOptions.workerSrc = `${FIXTURE_BASE}libraries/pdf.worker.js`;
    const documentTask = getDocument({ data: new TextEncoder().encode(MINIMAL_PDF) });
    const pdfDocument = await documentTask.promise;
    const page = await pdfDocument.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const renderCanvas = document.createElement('canvas');
    renderCanvas.width = viewport.width;
    renderCanvas.height = viewport.height;
    await page.render({
        canvasContext: createPdfCanvasContext(renderCanvas),
        viewport
    }).promise;
    assert(
        pdfDocument.numPages === 1 && viewport.width === 100 && viewport.height === 100,
        'The converted PDF.js build could not open the PDF rendering fixture.'
    );
    await pdfDocument.destroy();

    Archive.init({ workerUrl: `${FIXTURE_BASE}libraries/worker-bundle.js` });
    const archiveWorker = Archive.getWorker(Archive._options);
    assert(
        archiveWorker.url === `${FIXTURE_BASE}libraries/worker-bundle.js`
        && archiveWorker.options?.type === 'module',
        'The converted libarchive adapter did not start its configured copied module worker.'
    );
    archiveWorker.terminate();

    Archive.init({
        getWorker: () => new BrowserWorkerThreadAdapter(
            path.join(distDirectory, 'libraries/worker-bundle.js')
        )
    });
    const archive = await Archive.open(new Blob([
        createStoredTar('001.jpg', 'comic-page-fixture')
    ]));
    await archive.extractFiles();
    const extractedFiles = await archive.getFilesArray();
    assert(
        extractedFiles.length === 1
        && extractedFiles[0].file.name === '001.jpg'
        && await extractedFiles[0].file.text() === 'comic-page-fixture',
        'The copied libarchive worker and WASM did not extract the comics fixture.'
    );
    await archive.close();

    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const modernRenderer = new SubtitlesOctopus({
        canvas,
        fallbackFont: `${FIXTURE_BASE}libraries/default.woff2`,
        legacyWorkerUrl: `${FIXTURE_BASE}libraries/subtitles-octopus-worker-legacy.js`,
        subContent: '[Script Info]',
        workerUrl: `${FIXTURE_BASE}libraries/subtitles-octopus-worker.js`
    });
    const modernWorker = modernRenderer.worker;
    assert(
        modernWorker.url === `${FIXTURE_BASE}libraries/subtitles-octopus-worker.js`
        && modernWorker.messages.some(message => message.target === 'worker-init'),
        'The converted libass adapter did not initialize the copied WASM worker.'
    );
    modernRenderer.dispose();

    const nativeWebAssembly = globalThis.WebAssembly;
    Object.defineProperty(globalThis, 'WebAssembly', {
        configurable: true,
        value: undefined,
        writable: true
    });
    try {
        const legacyRenderer = new SubtitlesOctopus({
            canvas,
            fallbackFont: `${FIXTURE_BASE}libraries/default.woff2`,
            legacyWorkerUrl: `${FIXTURE_BASE}libraries/subtitles-octopus-worker-legacy.js`,
            subContent: '[Script Info]',
            workerUrl: `${FIXTURE_BASE}libraries/subtitles-octopus-worker.js`
        });
        assert(
            legacyRenderer.worker.url
                === `${FIXTURE_BASE}libraries/subtitles-octopus-worker-legacy.js`,
            'The converted libass adapter did not select the copied legacy worker fallback.'
        );
        legacyRenderer.dispose();
    } finally {
        Object.defineProperty(globalThis, 'WebAssembly', {
            configurable: true,
            value: nativeWebAssembly,
            writable: true
        });
    }
};

export const runViteMediaSmoke = async ({
    projectRoot = process.cwd(),
    distDirectory = path.join(projectRoot, 'dist')
} = {}) => {
    await verifyCopiedWorkerPayloads(distDirectory);
    const restoreBrowser = installBrowserFixture();
    try {
        const code = await buildDependencyFixture(projectRoot);
        const dataUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
        await import(dataUrl);
        await verifyDependencyRuntime(globalThis[RESULT_KEY], distDirectory);
    } finally {
        delete globalThis[RESULT_KEY];
        delete globalThis.pdfjsWorker;
        restoreBrowser();
    }

    return {
        packages: [
            '@jellyfin/libass-wasm',
            '@xmldom/xmldom',
            'jquery',
            'libarchive.js',
            'pdfjs-dist'
        ],
        status: 'passed'
    };
};

const isMainModule = process.argv[1]
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
    const report = await runViteMediaSmoke();
    console.log(
        `Vite media dependency smoke: ${report.status.toUpperCase()} `
        + `(${report.packages.join(', ')})`
    );
}
