import { describe, expect, it, vi } from 'vitest';

vi.mock('scripts/settings/userSettings', () => ({
    currentSettings: {
        dateTimeLocale: () => 'en-us',
        language: () => 'en-us'
    }
}));
vi.mock('utils/dateFnsLocale', () => ({ updateLocale: vi.fn() }));
vi.mock('utils/events', () => ({
    default: {
        on: vi.fn(),
        trigger: vi.fn()
    }
}));

import template from 'elements/emby-progressring/emby-progressring.template.html?raw';

import { translateHtml } from './index';

describe('raw HTML imports', () => {
    it('passes a string from the Vite raw loader to globalize.translateHtml', () => {
        expect(typeof template).toBe('string');
        expect(translateHtml(template, 'core')).toBe(template);
    });

    it('rejects module wrappers instead of silently unwrapping them', () => {
        expect(() => translateHtml({ default: template }, 'core')).toThrow(
            new TypeError('html must be a string')
        );
    });
});
