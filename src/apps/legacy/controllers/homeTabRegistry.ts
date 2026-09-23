import { createModuleRegistry } from 'utils/moduleRegistry';

export interface HomeTabController {
    destroy: () => void;
    onPause: () => void;
    onResume: (options: {
        autoFocus?: boolean;
        refresh?: boolean;
    }) => void;
    refreshed: boolean;
}

interface HomeTabControllerModule {
    default: new (
        element: Element | null | undefined,
        params: unknown
    ) => HomeTabController;
}

export const homeTabControllerRegistry = createModuleRegistry<HomeTabControllerModule>(
    import.meta.glob<HomeTabControllerModule>('./{favorites,hometab}.js'),
    {
        basePath: './',
        moduleType: 'home tab controller'
    }
);
