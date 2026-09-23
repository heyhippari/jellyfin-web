import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const manifest = JSON.parse(
    readFileSync(new URL('../dist/.vite/manifest.json', import.meta.url), 'utf8')
);

assert.match(
    html,
    /<script type="module" crossorigin src="\.\/assets\/index-[^"]+\.js"><\/script>/,
    'Vite output must contain a content-hashed modern module entry.'
);
assert.match(
    html,
    /<link rel="stylesheet" crossorigin href="\.\/assets\/index-[^"]+\.css">/,
    'Vite output must contain a content-hashed stylesheet injected from the module graph.'
);
assert.match(
    html,
    /<script nomodule crossorigin id="vite-legacy-polyfill" src="\.\/assets\/polyfills-legacy-[^"]+\.js"><\/script>/,
    'Vite output must contain the conditional legacy polyfill graph.'
);
assert.match(
    html,
    /<script nomodule crossorigin id="vite-legacy-entry" data-src="\.\/assets\/index-legacy-[^"]+\.js">System\.import/,
    'Vite output must contain the conditional SystemJS legacy entry.'
);
assert.doesNotMatch(
    html,
    /vite-modern-polyfill/,
    'Vite output must not contain a modern polyfill chunk.'
);
assert.equal(manifest['index.html']?.isEntry, true, 'The Vite manifest must identify index.html as an entry.');

const lazyRegistrySources = [
    'apps/dashboard/routes/activity/index.tsx',
    'apps/modern/routes/home.tsx',
    'apps/legacy/routes/search.tsx',
    'apps/dashboard/controllers/livetvtuner.js',
    'apps/dashboard/controllers/livetvtuner.html?raw',
    'apps/wizard/controllers/start/index.js',
    'apps/wizard/controllers/start/index.html?raw',
    'apps/legacy/controllers/list.js',
    'apps/legacy/controllers/list.html?raw',
    'plugins/htmlVideoPlayer/plugin.js',
    'strings/en-us.json',
    'apps/legacy/controllers/favorites.js'
];

const initialGraph = new Set();
const pendingInitialImports = [ 'index.html' ];

while (pendingInitialImports.length > 0) {
    const source = pendingInitialImports.pop();
    if (!source || initialGraph.has(source)) continue;

    initialGraph.add(source);
    pendingInitialImports.push(...(manifest[source]?.imports ?? []));
}

for (const source of lazyRegistrySources) {
    const chunk = manifest[source];

    assert.ok(chunk, `The Vite manifest must contain the lazy registry module ${source}.`);
    assert.equal(chunk.isDynamicEntry, true, `${source} must remain a dynamic entry.`);
    assert.equal(
        initialGraph.has(source),
        false,
        `${source} must not be collapsed into the initial static graph.`
    );
}

console.info(`Verified Vite modern and conditional legacy HTML graphs, including ${lazyRegistrySources.length} representative lazy registry chunks.`);
