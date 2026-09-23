import { createModuleRegistry } from 'utils/moduleRegistry';

export type TranslationDictionary = Record<string, string>;

export const translationRegistry = createModuleRegistry<TranslationDictionary>(
    import.meta.glob<TranslationDictionary>('../../strings/*.json', {
        import: 'default'
    }),
    {
        basePath: '../../strings/',
        moduleType: 'translation'
    }
);
