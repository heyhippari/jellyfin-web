import type { ViewManagerPageProps } from 'components/viewManager/ViewManagerPage';

export const VIDEO_PAGE_PROPS: ViewManagerPageProps = {
    controller: 'playback/video/index',
    view: 'playback/video/index.html',
    type: 'video-osd',
    isFullscreen: true,
    isNowPlayingBarEnabled: false,
    isThemeMediaSupported: true
};
