import './jqueryGlobals';

// These patches adjust Jellyfin behavior rather than supplying ES or DOM APIs.
// Keep them in both output graphs and before application initialization.
import './domParserTextHtml';
import './elementAppendPrepend';
import './focusPreventScroll';
import './htmlMediaElement';
import './keyboardEvent';
import './mediaQueryList';
import './patchHeaders';
import './vendorStyles';

/**
 * Loads DOM API shims only for module-capable browsers that need them.
 *
 * The legacy graph receives the same shims from Vite's conditional legacy
 * polyfill chunk (see vite.config.ts), which runs before its SystemJS entry.
 * `fetch` deliberately precedes AbortController: the latter patches fetch.
 */
export async function loadMissingBrowserPolyfills(): Promise<void> {
    const imports: Promise<unknown>[] = [];

    // AbortController patches fetch, so fetch must be installed first.
    if (!window.fetch) await import('whatwg-fetch');

    if (!Element.prototype.closest) imports.push(import('element-closest-polyfill'));
    if (!window.TextEncoder || !window.TextDecoder) imports.push(import('fast-text-encoding'));
    if (!window.IntersectionObserver) imports.push(import('intersection-observer'));
    if (!document.documentElement.classList) imports.push(import('classlist.js'));
    if (!window.AbortController) imports.push(import('abortcontroller-polyfill'));
    if (!window.ResizeObserver) imports.push(import('resize-observer-polyfill'));
    if (!window.Proxy) imports.push(import('proxy-polyfill'));

    await Promise.all(imports);
}
