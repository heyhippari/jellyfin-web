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

console.info('Verified Vite modern and conditional legacy HTML graphs.');
