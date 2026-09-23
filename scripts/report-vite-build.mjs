#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { auditBuildOutput } from './audit-build-output.mjs';

const runProductionBuild = projectRoot => {
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const result = spawnSync(npmCommand, [ 'run', 'build:production' ], {
        cwd: projectRoot,
        env: process.env,
        stdio: 'inherit'
    });

    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(`production build exited with status ${result.status}`);
    }
};

const formatNumber = value => value.toLocaleString('en-US');

const createMarkdownReport = (audit, performance) => [
    '# Vite build verification',
    '',
    `- Build-output audit: **${audit.status}**`,
    `- Lazy-loading contracts: **${performance.lazyContracts.status}**`,
    `- Performance budget: **${performance.budget.status}**`,
    '',
    'The figures below are separate browser-selected graphs. They deliberately do not use the combined differential-build `dist/` directory as a transfer-size metric.',
    '',
    '| Graph | Requests | Gzip bytes | Brotli bytes | CSS gzip bytes | CSS Brotli bytes |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...[ 'modern', 'legacy' ].map(name => {
        const graph = performance.initialGraphs[name];
        return `| ${name} | ${formatNumber(graph.requestCount)} | ${formatNumber(graph.gzipBytes)} | ${formatNumber(graph.brotliBytes)} | ${formatNumber(graph.css.gzipBytes)} | ${formatNumber(graph.css.brotliBytes)} |`;
    }),
    ''
].join('\n');

const projectRoot = process.cwd();
const reportDirectory = path.join(projectRoot, 'build-reports');
runProductionBuild(projectRoot);

const audit = await auditBuildOutput({
    projectRoot,
    distDirectory: path.join(projectRoot, 'dist')
});
if (audit.errors.length) {
    throw new Error(`output audit failed:\n${audit.errors.join('\n')}`);
}

const performancePath = path.join(reportDirectory, 'vite-performance-budget.json');
const performance = JSON.parse(await readFile(performancePath, 'utf8'));
if (performance.budget.status !== 'passed' || performance.lazyContracts.status !== 'passed') {
    throw new Error('Vite build verification requires a passing performance report');
}

await mkdir(reportDirectory, { recursive: true });
await Promise.all([
    writeFile(
        path.join(reportDirectory, 'build-output-audit.json'),
        `${JSON.stringify(audit, null, 2)}\n`
    ),
    writeFile(
        path.join(reportDirectory, 'vite-build-verification.md'),
        createMarkdownReport(audit, performance)
    )
]);

console.log('Vite build verification report written to build-reports');
