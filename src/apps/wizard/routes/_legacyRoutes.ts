import type { LegacyRoute } from 'components/router/LegacyRoute';
import { AppType } from 'constants/appType';

export const WIZARD_ROUTES: LegacyRoute[] = [
    {
        path: 'remoteaccess',
        pageProps: {
            appType: AppType.Wizard,
            controller: 'remote/index',
            view: 'remote/index.html'
        }
    },
    {
        path: 'finish',
        pageProps: {
            appType: AppType.Wizard,
            controller: 'finish/index',
            view: 'finish/index.html'
        }
    },
    {
        path: 'library',
        pageProps: {
            appType: AppType.Wizard,
            controller: 'library',
            view: 'library.html'
        }
    },
    {
        path: 'settings',
        pageProps: {
            appType: AppType.Wizard,
            controller: 'settings/index',
            view: 'settings/index.html'
        }
    },
    {
        path: 'start',
        pageProps: {
            appType: AppType.Wizard,
            controller: 'start/index',
            view: 'start/index.html'
        }
    },
    {
        path: 'user',
        pageProps: {
            appType: AppType.Wizard,
            controller: 'user/index',
            view: 'user/index.html'
        }
    }
];
