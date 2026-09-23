declare module '*.png' {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value: any;
    export = value;
}

declare module '*.scss' {
    // style imports are handled by the bundler
    const value: string;
    export default value;
}

declare module '*.html?raw' {
    const value: string;
    export default value;
}

// Side-effect-only DOM API shims loaded by lib/legacy after feature detection.
declare module 'abortcontroller-polyfill';
declare module 'classlist.js';
declare module 'element-closest-polyfill';
declare module 'fast-text-encoding';
declare module 'intersection-observer';
declare module 'proxy-polyfill';
declare module 'whatwg-fetch';
