/* eslint-disable no-restricted-globals */
import { decode } from 'blurhash';

interface BlurHashRequest {
    hash: string
    width: number
    height: number
}

interface BlurHashResponse {
    pixels: Uint8ClampedArray
    hsh: string
    width: number
    height: number
}

export const decodeBlurHash = ({ hash, width, height }: BlurHashRequest): BlurHashResponse => ({
    pixels: decode(hash, width, height),
    hsh: hash,
    width,
    height
});

self.onmessage = ({ data }: MessageEvent<BlurHashRequest>): void => {
    try {
        self.postMessage(decodeBlurHash(data));
    } catch {
        throw new TypeError(`Blurhash ${data.hash} is not valid`);
    }
};
/* eslint-enable no-restricted-globals */
