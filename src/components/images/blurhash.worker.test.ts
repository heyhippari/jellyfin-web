import { afterEach, describe, expect, it, vi } from 'vitest';

import './blurhash.worker';

describe('BlurHash worker', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('decodes a posted BlurHash request and returns its pixels', () => {
        const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
        const request = {
            hash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj',
            width: 2,
            height: 2
        };

        window.onmessage?.(new MessageEvent('message', { data: request }));

        expect(postMessage).toHaveBeenCalledOnce();
        const response = postMessage.mock.calls[0][0];
        expect(response).toMatchObject({
            hsh: request.hash,
            width: request.width,
            height: request.height
        });
        expect(response.pixels).toEqual(new Uint8ClampedArray([
            135, 164, 177, 255,
            181, 180, 171, 255,
            120, 148, 162, 255,
            158, 125, 108, 255
        ]));
    });
});
