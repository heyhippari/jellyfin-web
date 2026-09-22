import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const guardedPackages = ['vite', '@vitejs/plugin-legacy'];

export const assertSupportedViteMajor = (packageName, version) => {
    const major = Number.parseInt(version.split('.')[0], 10);

    if (!Number.isInteger(major)) {
        throw new Error(`Could not determine the resolved ${packageName} major version from "${version}".`);
    }

    if (major >= 8) {
        throw new Error(
            `${packageName} ${version} is not supported: Vite 8 and its legacy plugin cannot yet satisfy Jellyfin Web's ES5 output contract. Revisit the ES5 blocker before upgrading.`
        );
    }
};

export const getResolvedPackageVersion = packageName => {
    let directory = dirname(require.resolve(packageName));

    while (true) {
        const packageJsonPath = join(directory, 'package.json');
        if (existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
            if (packageJson.name === packageName) return packageJson.version;
        }

        const parent = dirname(directory);
        if (parent === directory) break;
        directory = parent;
    }

    throw new Error(`Could not locate the resolved package metadata for ${packageName}.`);
};

export const assertSupportedViteVersions = () => {
    guardedPackages.forEach(packageName => {
        assertSupportedViteMajor(packageName, getResolvedPackageVersion(packageName));
    });
};
