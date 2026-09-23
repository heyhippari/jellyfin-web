#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

import { parseHtmlReferences, resolveLocalReference } from './audit-build-output.mjs';

const DEFAULT_BUDGET_FILE = 'vite-performance-budget.json';
const DEFAULT_REPORT_FILE = 'build-reports/vite-performance-budget.json';

const sum = (assets, property) => assets.reduce((total, asset) => total + asset[property], 0);

const parseArguments = argv => {
    const options = {
        budget: DEFAULT_BUDGET_FILE,
        dist: 'dist',
        report: DEFAULT_REPORT_FILE
    };

    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--budget' || argument === '--dist' || argument === '--report') {
            options[argument.slice(2)] = argv[index + 1];
            index += 1;
        } else if (argument === '--no-report') {
            options.report = null;
        } else {
            throw new Error(`unknown argument: ${argument}`);
        }
    }

    for (const [ name, value ] of Object.entries(options)) {
        if (value !== null && (!value || value.startsWith('--'))) {
            throw new Error(`--${name} requires a path`);
        }
    }
    return options;
};

const getGraphName = file => file.includes('-legacy-') || file.includes('legacy-') ? 'legacy' : 'modern';

const createFileIndex = manifest => {
    const files = new Map();
    for (const [ key, entry ] of Object.entries(manifest)) {
        files.set(entry.file, { key, entry });
    }
    return files;
};

// eslint-disable-next-line sonarjs/cognitive-complexity -- HTML uses distinct modern and legacy loading conventions.
const getExternalGraphEntries = (references, html, distDirectory) => {
    const modern = [];
    const legacy = [];
    const css = [];

    for (const reference of references) {
        const resolved = resolveLocalReference(reference.url, distDirectory);
        if (!resolved || resolved.error) continue;
        if (reference.kind === 'stylesheet') css.push(resolved.relativePath);
        if (reference.kind !== 'script') continue;

        if (reference.attributes.type?.toLowerCase() === 'module') {
            // Vite's small inline feature-detection modules have no src.
            modern.push(resolved.relativePath);
        } else if (Object.hasOwn(reference.attributes, 'nomodule') || reference.attributes['data-src']) {
            const dataSource = reference.attributes['data-src'];
            if (dataSource) {
                const dataResolved = resolveLocalReference(dataSource, distDirectory);
                if (dataResolved && !dataResolved.error) legacy.push(dataResolved.relativePath);
            } else {
                legacy.push(resolved.relativePath);
            }
        }
    }

    // The legacy entry is deliberately an inline nomodule script with its URL
    // in data-src so that it can call System.import after the polyfill loads.
    // It is not a regular HTML reference and therefore is absent from the
    // output-audit parser's script list.
    const legacyEntryMatch = /<script\b[^>]*\bid=["']vite-legacy-entry["'][^>]*\bdata-src=["']([^"']+)["']/i.exec(html);
    if (legacyEntryMatch) {
        const dataResolved = resolveLocalReference(legacyEntryMatch[1], distDirectory);
        if (dataResolved && !dataResolved.error) legacy.push(dataResolved.relativePath);
    }

    return {
        legacy: [ ...new Set([ ...legacy, ...css ]) ].sort(),
        modern: [ ...new Set([ ...modern, ...css ]) ].sort()
    };
};

const collectManifestGraph = (startingFiles, manifest, files) => {
    const collected = new Set(startingFiles);
    const pending = [ ...startingFiles ];

    while (pending.length) {
        const file = pending.pop();
        const manifestRecord = files.get(file);
        if (!manifestRecord) continue;
        const dependencies = [
            ...(manifestRecord.entry.imports || []),
            ...(manifestRecord.entry.css || [])
        ];
        for (const dependency of dependencies) {
            const dependencyFile = manifest[dependency]?.file || dependency;
            if (!collected.has(dependencyFile)) {
                collected.add(dependencyFile);
                pending.push(dependencyFile);
            }
        }
    }

    return [ ...collected ].sort();
};

const measureAssets = async (distDirectory, paths) => {
    const assets = await Promise.all(paths.map(async relativePath => {
        const contents = await readFile(path.join(distDirectory, relativePath));
        return {
            path: relativePath,
            rawBytes: contents.byteLength,
            gzipBytes: gzipSync(contents, { level: 9 }).byteLength,
            brotliBytes: brotliCompressSync(contents, {
                // Quality 6 is stable and representative while keeping this
                // CI gate fast enough for the two large differential graphs.
                params: { [constants.BROTLI_PARAM_QUALITY]: 6 }
            }).byteLength
        };
    }));
    const cssAssets = assets.filter(asset => asset.path.endsWith('.css'));
    return {
        assets,
        brotliBytes: sum(assets, 'brotliBytes'),
        css: {
            assetCount: cssAssets.length,
            brotliBytes: sum(cssAssets, 'brotliBytes'),
            gzipBytes: sum(cssAssets, 'gzipBytes'),
            rawBytes: sum(cssAssets, 'rawBytes')
        },
        gzipBytes: sum(assets, 'gzipBytes'),
        rawBytes: sum(assets, 'rawBytes'),
        requestCount: assets.length
    };
};

const measureAsyncChunks = async (distDirectory, manifest, graphName, initialFiles) => {
    const initial = new Set(initialFiles);
    const candidates = Object.values(manifest)
        .filter(entry => entry.isDynamicEntry && !initial.has(entry.file))
        .filter(entry => getGraphName(entry.file) === graphName)
        .map(entry => entry.file)
        .filter((file, index, files) => files.indexOf(file) === index);
    const largestPaths = (await Promise.all(candidates.map(async relativePath => ({
        path: relativePath,
        rawBytes: (await readFile(path.join(distDirectory, relativePath))).byteLength
    }))))
        .filter(asset => asset.path.endsWith('.js'))
        .sort((left, right) => right.rawBytes - left.rawBytes)
        .slice(0, 5)
        .map(asset => asset.path);
    return (await measureAssets(distDirectory, largestPaths)).assets
        .sort((left, right) => right.rawBytes - left.rawBytes);
};

const assertLazyContracts = (manifest, initialFiles) => {
    const initial = new Set([ ...initialFiles.modern, ...initialFiles.legacy ]);
    const contracts = {
        'locale JSON': /strings\/.+\.json$/,
        'route controllers': /(apps\/.+\/(routes|controllers)\/|components\/viewManager\/)/,
        'MUI date picker': /@mui\/x-date-pickers|date-pickers/i,
        HLS: /hls[-.]/i,
        'PDF.js': /pdf[-.]/i,
        'optional player/plugin': /(plugins\/|components\/playback\/)/
    };
    const failures = [];

    for (const [ label, pattern ] of Object.entries(contracts)) {
        const matched = Object.entries(manifest).filter(([ key, entry ]) => pattern.test(key) || pattern.test(entry.file));
        const lazy = matched.filter(([, entry]) => entry.isDynamicEntry && !initial.has(entry.file));
        const eagerlyLoaded = matched.filter(([, entry]) => initial.has(entry.file));
        // The application does not currently import the optional date-picker.
        // If it is added, it must be a lazy entry; all other contracts are
        // present today and therefore must continue to have one.
        if (!lazy.length && label !== 'MUI date picker') failures.push(`${label} has no lazy manifest entry`);
        if (eagerlyLoaded.length) {
            failures.push(`${label} is in an initial graph: ${eagerlyLoaded.map(([, entry]) => entry.file).join(', ')}`);
        }
    }
    return failures;
};

// eslint-disable-next-line sonarjs/cognitive-complexity -- Validates the deliberately nested budget schema verbatim.
const getBudgetFailures = (budget, metrics) => {
    const failures = [];
    const compare = (label, current, maximum) => {
        if (current > maximum) failures.push(`${label}: ${current.toLocaleString('en-US')} exceeds ${maximum.toLocaleString('en-US')}`);
    };
    for (const graphName of [ 'modern', 'legacy' ]) {
        const graphBudget = budget.initialGraphs[graphName];
        const graph = metrics.initialGraphs[graphName];
        for (const property of [ 'rawBytes', 'gzipBytes', 'brotliBytes', 'requestCount' ]) {
            if (graphBudget[property] !== undefined) compare(`${graphName} initial ${property}`, graph[property], graphBudget[property]);
        }
        if (graphBudget.css) {
            for (const property of [ 'rawBytes', 'gzipBytes', 'brotliBytes', 'assetCount' ]) {
                if (graphBudget.css[property] !== undefined) compare(`${graphName} initial CSS ${property}`, graph.css[property], graphBudget.css[property]);
            }
        }
        const largestAsyncBudget = graphBudget.largestAsyncChunks || {};
        for (const asset of metrics.largestAsyncChunks[graphName]) {
            if (largestAsyncBudget.rawBytes !== undefined) compare(`${graphName} async ${asset.path} rawBytes`, asset.rawBytes, largestAsyncBudget.rawBytes);
            if (largestAsyncBudget.gzipBytes !== undefined) compare(`${graphName} async ${asset.path} gzipBytes`, asset.gzipBytes, largestAsyncBudget.gzipBytes);
            if (largestAsyncBudget.brotliBytes !== undefined) compare(`${graphName} async ${asset.path} brotliBytes`, asset.brotliBytes, largestAsyncBudget.brotliBytes);
        }
    }
    return failures;
};

export const measureVitePerformance = async ({ distDirectory }) => {
    const html = await readFile(path.join(distDirectory, 'index.html'), 'utf8');
    const manifest = JSON.parse(await readFile(path.join(distDirectory, '.vite/manifest.json'), 'utf8'));
    const entries = getExternalGraphEntries(parseHtmlReferences(html), html, distDirectory);
    const files = createFileIndex(manifest);
    const initialFiles = {
        modern: collectManifestGraph(entries.modern, manifest, files),
        legacy: collectManifestGraph(entries.legacy, manifest, files)
    };
    const initialGraphs = {
        modern: await measureAssets(distDirectory, initialFiles.modern),
        legacy: await measureAssets(distDirectory, initialFiles.legacy)
    };
    const largestAsyncChunks = {
        modern: await measureAsyncChunks(distDirectory, manifest, 'modern', initialFiles.modern),
        legacy: await measureAsyncChunks(distDirectory, manifest, 'legacy', initialFiles.legacy)
    };
    const lazyFailures = assertLazyContracts(manifest, initialFiles);

    return {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        initialGraphs,
        initialFiles,
        largestAsyncChunks,
        lazyContracts: {
            failures: lazyFailures,
            status: lazyFailures.length ? 'failed' : 'passed'
        },
        selection: {
            legacy: 'nomodule entry and polyfills, their static manifest closure, and shared HTML stylesheets',
            modern: 'module entry, its static manifest closure, and HTML stylesheets'
        }
    };
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const options = parseArguments(process.argv.slice(2));
    const projectRoot = process.cwd();
    const distDirectory = path.resolve(projectRoot, options.dist);
    const budget = JSON.parse(await readFile(path.resolve(projectRoot, options.budget), 'utf8'));
    const report = await measureVitePerformance({ distDirectory });
    const budgetFailures = getBudgetFailures(budget, report);
    report.budget = { file: options.budget, failures: budgetFailures, status: budgetFailures.length ? 'failed' : 'passed' };

    if (options.report) {
        const { mkdir, writeFile } = await import('node:fs/promises');
        const reportPath = path.resolve(projectRoot, options.report);
        await mkdir(path.dirname(reportPath), { recursive: true });
        await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    }

    const failures = [ ...report.lazyContracts.failures, ...budgetFailures ];
    if (failures.length) throw new Error(`Vite performance budget failed:\n${failures.join('\n')}`);
    console.log(`Vite performance budget passed: modern ${report.initialGraphs.modern.requestCount} requests, legacy ${report.initialGraphs.legacy.requestCount} requests.`);
}
