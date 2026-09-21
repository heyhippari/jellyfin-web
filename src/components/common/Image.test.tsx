import { act, fireEvent, render, screen } from '@testing-library/react';
import React, { type ComponentProps } from 'react';
import type { BlurhashCanvas } from 'react-blurhash';
import type { LazyLoadImageProps } from 'react-lazy-load-image-component';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { enableBlurhash, enableFastFadein } from '../../scripts/settings/userSettings';
import Image from './Image';

const lazyImage = vi.hoisted(() => ({
    beforeLoad: undefined as LazyLoadImageProps['beforeLoad']
}));

vi.mock('../../scripts/settings/userSettings', () => ({
    enableBlurhash: vi.fn(),
    enableFastFadein: vi.fn()
}));

// Control the lazy-loader boundary without relying on viewport geometry or network requests.
vi.mock('react-lazy-load-image-component', () => ({
    LazyLoadImage: ({ beforeLoad, src, style, onLoad, onTransitionEnd, alt }: LazyLoadImageProps) => {
        lazyImage.beforeLoad = beforeLoad;
        return <img src={src} alt={alt} style={style} onLoad={onLoad} onTransitionEnd={onTransitionEnd} />;
    }
}));

vi.mock('react-blurhash', () => ({
    BlurhashCanvas: ({ hash, punch, ...props }: ComponentProps<typeof BlurhashCanvas>) => (
        <canvas {...props} data-testid='blurhash' data-hash={hash} data-punch={punch} />
    )
}));

const firstUrl = '/images/first.jpg';
const secondUrl = '/images/second.jpg';
const firstHash = 'LEHV6nWB2yk8pyo0adR*.7kCMdnj';
const secondHash = 'LKO2?U%2Tw=w]~RBVZRi};RPxuwH';

function startLoading() {
    act(() => {
        if (!lazyImage.beforeLoad) {
            throw new Error('Image must supply the lazy-loader beforeLoad callback');
        }
        lazyImage.beforeLoad();
    });
}

describe('Image', () => {
    beforeEach(() => {
        vi.mocked(enableBlurhash).mockReset().mockReturnValue(true);
        vi.mocked(enableFastFadein).mockReset().mockReturnValue(false);
        lazyImage.beforeLoad = undefined;
    });

    it('starts transparent without a transition or blurhash before loading begins', () => {
        render(<Image imgUrl={firstUrl} blurhash={firstHash} containImage />);

        expect(screen.getByRole('img')).toHaveAttribute('src', firstUrl);
        expect(screen.getByRole('img')).toHaveStyle({ opacity: '0', transition: 'none' });
        expect(screen.queryByTestId('blurhash')).not.toBeInTheDocument();
    });

    it.each([
        { containImage: true, objectFit: 'contain' },
        { containImage: false, objectFit: 'cover' }
    ])('uses $objectFit fitting when containImage is $containImage', ({ containImage, objectFit }) => {
        render(<Image imgUrl={firstUrl} containImage={containImage} />);

        expect(screen.getByRole('img')).toHaveStyle({ objectFit });
    });

    it('keeps the blurhash through loading and fading, then removes it when the transition ends', () => {
        render(<Image imgUrl={firstUrl} blurhash={firstHash} containImage />);
        const image = screen.getByRole('img');

        startLoading();

        expect(screen.getByTestId('blurhash')).toHaveAttribute('data-hash', firstHash);
        expect(image).toHaveStyle({ opacity: '0', transition: 'none' });

        fireEvent.load(image);

        expect(image).toHaveStyle({ opacity: '1', transition: '0.5s' });
        expect(screen.getByTestId('blurhash')).toBeInTheDocument();

        fireEvent.transitionEnd(image, { propertyName: 'opacity' });

        expect(screen.queryByTestId('blurhash')).not.toBeInTheDocument();
        expect(image).toBeInTheDocument();
        expect(image).toHaveStyle({ opacity: '1' });
    });

    it.each([
        { reason: 'disabled', enabled: false, hash: firstHash },
        { reason: 'missing', enabled: true, hash: undefined },
        { reason: 'empty', enabled: true, hash: '' }
    ])('loads without a placeholder when blurhash is $reason', ({ enabled, hash }) => {
        vi.mocked(enableBlurhash).mockReturnValue(enabled);
        render(<Image imgUrl={firstUrl} blurhash={hash} containImage />);
        const image = screen.getByRole('img');

        startLoading();

        expect(screen.queryByTestId('blurhash')).not.toBeInTheDocument();
        expect(image).toHaveStyle({ opacity: '0', transition: 'none' });

        fireEvent.load(image);

        expect(image).toHaveStyle({ opacity: '1', transition: '0.5s' });
        expect(screen.queryByTestId('blurhash')).not.toBeInTheDocument();

        fireEvent.transitionEnd(image, { propertyName: 'opacity' });

        expect(image).toHaveStyle({ opacity: '1' });
        expect(screen.queryByTestId('blurhash')).not.toBeInTheDocument();
    });

    it.each([
        { fastFade: false, duration: '0.5s' },
        { fastFade: true, duration: '0.1s' }
    ])('fades in over $duration when fast fade is $fastFade', ({ fastFade, duration }) => {
        vi.mocked(enableFastFadein).mockReturnValue(fastFade);
        render(<Image imgUrl={firstUrl} containImage />);
        const image = screen.getByRole('img');

        startLoading();
        expect(image).toHaveStyle({ transition: 'none' });

        fireEvent.load(image);

        expect(image).toHaveStyle({ opacity: '1', transition: duration });
    });

    it.each([ 'idle', 'loading', 'fading', 'complete' ])(
        'starts a fresh lifecycle when the URL changes while the previous image is %s',
        (phase) => {
            const { rerender } = render(<Image imgUrl={firstUrl} blurhash={firstHash} containImage />);
            const firstImage = screen.getByRole('img');

            if (phase !== 'idle') startLoading();
            if (phase === 'fading' || phase === 'complete') fireEvent.load(firstImage);
            if (phase === 'complete') fireEvent.transitionEnd(firstImage, { propertyName: 'opacity' });

            rerender(<Image imgUrl={secondUrl} blurhash={secondHash} containImage />);
            const secondImage = screen.getByRole('img');

            expect(secondImage).toHaveAttribute('src', secondUrl);
            expect(secondImage).toHaveStyle({ opacity: '0', transition: 'none' });
            expect(screen.queryByTestId('blurhash')).not.toBeInTheDocument();

            startLoading();

            expect(screen.getByTestId('blurhash')).toHaveAttribute('data-hash', secondHash);
            expect(secondImage).toHaveStyle({ opacity: '0', transition: 'none' });

            fireEvent.load(secondImage);

            expect(secondImage).toHaveStyle({ opacity: '1', transition: '0.5s' });
            expect(screen.getByTestId('blurhash')).toHaveAttribute('data-hash', secondHash);

            fireEvent.transitionEnd(secondImage, { propertyName: 'opacity' });

            expect(screen.queryByTestId('blurhash')).not.toBeInTheDocument();
            expect(secondImage).toHaveStyle({ opacity: '1' });
        }
    );

    it('updates fitting for the same URL without restarting an active fade', () => {
        const { rerender } = render(<Image imgUrl={firstUrl} blurhash={firstHash} containImage />);
        startLoading();
        fireEvent.load(screen.getByRole('img'));

        rerender(<Image imgUrl={firstUrl} blurhash={firstHash} containImage={false} />);

        expect(screen.getByRole('img')).toHaveStyle({ objectFit: 'cover', opacity: '1', transition: '0.5s' });
        expect(screen.getByTestId('blurhash')).toHaveAttribute('data-hash', firstHash);
    });

    it('updates the active blurhash for the same URL without restarting the fade', () => {
        const { rerender } = render(<Image imgUrl={firstUrl} blurhash={firstHash} containImage />);
        startLoading();
        fireEvent.load(screen.getByRole('img'));

        rerender(<Image imgUrl={firstUrl} blurhash={secondHash} containImage />);

        expect(screen.getByTestId('blurhash')).toHaveAttribute('data-hash', secondHash);
        expect(screen.getByRole('img')).toHaveStyle({ opacity: '1', transition: '0.5s' });
    });

    it('does not restart a completed image or resurrect its placeholder on same-URL rerenders', () => {
        const { rerender } = render(<Image imgUrl={firstUrl} blurhash={firstHash} containImage />);
        startLoading();
        fireEvent.load(screen.getByRole('img'));
        fireEvent.transitionEnd(screen.getByRole('img'), { propertyName: 'opacity' });

        rerender(<Image imgUrl={firstUrl} blurhash={secondHash} containImage={false} />);

        expect(screen.getByRole('img')).toHaveAttribute('src', firstUrl);
        expect(screen.getByRole('img')).toHaveStyle({ objectFit: 'cover', opacity: '1', transition: '0.5s' });
        expect(screen.queryByTestId('blurhash')).not.toBeInTheDocument();
    });
});
