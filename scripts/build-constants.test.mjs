import { describe, expect, it, vi } from 'vitest';

import {
    getBuildConstants,
    getBuildDefinitions,
    getCommitSha,
    parseEnvironmentBoolean
} from './build-constants.cjs';

const packageJson = {
    name: 'jellyfin-web',
    version: '13.0.0'
};

const createOptions = environment => ({
    environment,
    executeGit: vi.fn(() => Buffer.from('abc123\n')),
    logger: { warn: vi.fn() },
    packageJson
});

describe('parseEnvironmentBoolean', () => {
    it.each([
        [ undefined, false ],
        [ '', false ],
        [ '0', false ],
        [ 'false', false ],
        [ '1', true ],
        [ 'true', true ]
    ])('parses %s as %s', (value, expected) => {
        expect(parseEnvironmentBoolean(value)).toBe(expected);
    });
});

describe('getCommitSha', () => {
    it('runs git directly and trims its output', () => {
        const executeGit = vi.fn(() => Buffer.from('abc123-dirty\n'));

        expect(getCommitSha({ executeGit })).toBe('abc123-dirty');
        expect(executeGit).toHaveBeenCalledWith(
            'git',
            [ 'describe', '--always', '--dirty' ]
        );
    });

    it('returns an empty commit and warns when git is unavailable', () => {
        const error = new Error('git not found');
        const executeGit = vi.fn(() => {
            throw error;
        });
        const logger = { warn: vi.fn() };

        expect(getCommitSha({ executeGit, logger })).toBe('');
        expect(logger.warn).toHaveBeenCalledWith(
            'Failed to get commit sha. Is git installed?',
            error
        );
    });
});

describe('getBuildConstants', () => {
    it('uses the development-server build name and parses enabled system fonts', () => {
        const options = {
            ...createOptions({
                JELLYFIN_VERSION: 'packaged-version',
                USE_SYSTEM_FONTS: '1'
            }),
            devServer: true
        };

        expect(getBuildConstants(options)).toEqual({
            commitSha: 'abc123',
            buildVersion: 'Dev Server',
            packageName: 'jellyfin-web',
            packageVersion: '13.0.0',
            useSystemFonts: true,
            devServer: true
        });
    });

    it('uses JELLYFIN_VERSION for a packaged build', () => {
        const options = createOptions({
            JELLYFIN_VERSION: '10.11.0',
            USE_SYSTEM_FONTS: '0'
        });

        expect(getBuildConstants(options)).toMatchObject({
            buildVersion: '10.11.0',
            useSystemFonts: false,
            devServer: false
        });
    });

    it('uses the release fallback when no packaged version is present', () => {
        const options = createOptions({});

        expect(getBuildConstants(options)).toMatchObject({
            buildVersion: 'Release',
            useSystemFonts: false,
            devServer: false
        });
    });

    it('accepts a bundler-provided development-server flag', () => {
        const options = {
            ...createOptions({ JELLYFIN_VERSION: 'packaged-version' }),
            devServer: true
        };

        expect(getBuildConstants(options).buildVersion).toBe('Dev Server');
    });
});

describe('getBuildDefinitions', () => {
    it('formats string and boolean constants for bundler define APIs', () => {
        const definitions = getBuildDefinitions(createOptions({ USE_SYSTEM_FONTS: '1' }));

        expect(definitions).toEqual({
            __COMMIT_SHA__: '"abc123"',
            __JF_BUILD_VERSION__: '"Release"',
            __PACKAGE_JSON_NAME__: '"jellyfin-web"',
            __PACKAGE_JSON_VERSION__: '"13.0.0"',
            __USE_SYSTEM_FONTS__: true,
            __DEV_SERVER__: false
        });
    });
});
