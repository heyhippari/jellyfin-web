import React from 'react';
import { RouteObject } from 'react-router-dom';

import { AppType } from 'constants/appType';
import ConnectionRequired from 'components/ConnectionRequired';
import { toViewManagerPageRoute } from 'components/router/LegacyRoute';

export const METADATA_APP_PATHS = {
    MetadataManager: 'metadata'
};

export const METADATA_APP_ROUTES: RouteObject[] = [
    {
        element: <ConnectionRequired level='admin' />,
        children: [
            {
                lazy: () => import('../AppLayout'),
                children: [
                    toViewManagerPageRoute({
                        path: METADATA_APP_PATHS.MetadataManager,
                        pageProps: {
                            appType: AppType.Metadata,
                            controller: 'edititemmetadata',
                            view: 'edititemmetadata.html'
                        }
                    })
                ]
            }
        ]
    }
];
