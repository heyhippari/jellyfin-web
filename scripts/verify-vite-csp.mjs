import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
// eslint-disable-next-line import/no-unresolved -- Vite's plugin has no resolver metadata.
import { cspHashes } from '@vitejs/plugin-legacy';

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const inlineScripts = [ ...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g) ]
    .map(([, source]) => source)
    .filter(Boolean);
const generatedHashes = inlineScripts.map(source => createHash('sha256').update(source).digest('base64'));

assert.ok(generatedHashes.length > 0, 'Expected Vite legacy inline runtime scripts.');
for (const hash of generatedHashes) {
    assert.ok(
        cspHashes.includes(hash),
        `Vite legacy inline script hash is not exported by @vitejs/plugin-legacy: sha256-${hash}`
    );
}

console.info(
    `Verified ${generatedHashes.length} Vite legacy inline runtime scripts against @vitejs/plugin-legacy ${cspHashes.length} exported CSP hashes.`
);
