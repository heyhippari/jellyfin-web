import ImageNotSupported from '@mui/icons-material/ImageNotSupported';
import { isBlurhashValid } from 'blurhash';
import React, { type FC, useCallback, useState } from 'react';
import { BlurhashCanvas } from 'react-blurhash';
import { LazyLoadImage } from 'react-lazy-load-image-component';

import * as userSettings from '../../scripts/settings/userSettings';

const imageStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    height: '100%',
    zIndex: 0
};

interface ImageProps {
    imgUrl: string;
    blurhash?: string;
    containImage: boolean;
}

const ImageContent: FC<ImageProps> = ({
    imgUrl,
    blurhash,
    containImage
}) => {
    const [isLoaded, setIsLoaded] = useState(false);
    const [isTransitionComplete, setIsTransitionComplete] = useState(false);
    const [isLoadStarted, setIsLoadStarted] = useState(false);
    const [hasError, setHasError] = useState(false);

    const fadeinDuration = userSettings.enableFastFadein() ? '0.1s' : '0.5s';
    const transitionDuration = isLoaded ? fadeinDuration : 'none';

    const handleLoad = useCallback(() => {
        setIsLoaded(true);
    }, []);

    const handleError = useCallback(() => {
        setHasError(true);
    }, []);

    const handleTransitionEnd = useCallback(() => {
        setIsTransitionComplete(true);
    }, []);

    const handleLoadStarted = useCallback(() => {
        setIsLoadStarted(true);
    }, []);

    if (hasError) {
        return (
            <div
                role='img'
                aria-label='Image failed to load'
                style={{
                    ...imageStyle,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}
            >
                <ImageNotSupported
                    aria-hidden
                    sx={{
                        width: '25%',
                        height: '25%'
                    }}
                />
            </div>
        );
    }

    return (
        <div>
            {!isTransitionComplete && isLoadStarted && blurhash && userSettings.enableBlurhash() && isBlurhashValid(blurhash).result && (
                <BlurhashCanvas
                    hash={blurhash}
                    width={20}
                    height={20}
                    punch={1}
                    style={{
                        ...imageStyle,
                        borderRadius: '0.2em',
                        pointerEvents: 'none'
                    }}
                />
            )}
            <LazyLoadImage
                src={imgUrl}
                style={{
                    ...imageStyle,
                    objectFit: containImage ? 'contain' : 'cover',
                    opacity: isLoaded ? 1 : 0,
                    transition: transitionDuration
                }}
                onLoad={handleLoad}
                onError={handleError}
                onTransitionEnd={handleTransitionEnd}
                beforeLoad={handleLoadStarted}
            />

        </div>
    );
};

// Each source owns its loading lifecycle, including the blurhash and fade state.
const Image: FC<ImageProps> = (props) => <ImageContent key={props.imgUrl} {...props} />;

export default Image;
