import type jQuery from 'jquery';

export declare global {
    import { ApiClient, Events } from 'jellyfin-apiclient';

    interface Window {
        $: typeof jQuery;
        ApiClient: ApiClient;
        Events: Events;
        jQuery: typeof jQuery;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        NativeShell: any;
        Loading: {
            show();
            hide();
        }
    }

    interface DocumentEventMap {
        'viewshow': CustomEvent;
    }

    const __COMMIT_SHA__: string;
    const __JF_BUILD_VERSION__: string;
    const __PACKAGE_JSON_NAME__: string;
    const __PACKAGE_JSON_VERSION__: string;
    const __USE_SYSTEM_FONTS__: boolean;
    const __DEV_SERVER__: boolean;
}
