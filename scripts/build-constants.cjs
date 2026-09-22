const { execFileSync } = require('node:child_process');

const parseEnvironmentBoolean = value => Boolean(JSON.parse(value || '0'));

const getCommitSha = ({ executeGit = execFileSync, logger = console } = {}) => {
    try {
        return executeGit('git', [ 'describe', '--always', '--dirty' ])
            .toString()
            .trim();
    } catch (error) {
        logger.warn('Failed to get commit sha. Is git installed?', error);
        return '';
    }
};

const getBuildConstants = ({
    devServer,
    environment = process.env,
    executeGit,
    logger,
    packageJson
}) => {
    const isDevServer = devServer ?? parseEnvironmentBoolean(environment.WEBPACK_SERVE);

    return {
        commitSha: getCommitSha({ executeGit, logger }),
        buildVersion: isDevServer ?
            'Dev Server' :
            environment.JELLYFIN_VERSION || 'Release',
        packageName: packageJson.name,
        packageVersion: packageJson.version,
        useSystemFonts: parseEnvironmentBoolean(environment.USE_SYSTEM_FONTS),
        devServer: isDevServer
    };
};

const getBuildDefinitions = options => {
    const constants = getBuildConstants(options);

    return {
        __COMMIT_SHA__: JSON.stringify(constants.commitSha),
        __JF_BUILD_VERSION__: JSON.stringify(constants.buildVersion),
        __PACKAGE_JSON_NAME__: JSON.stringify(constants.packageName),
        __PACKAGE_JSON_VERSION__: JSON.stringify(constants.packageVersion),
        __USE_SYSTEM_FONTS__: constants.useSystemFonts,
        __DEV_SERVER__: constants.devServer
    };
};

exports.getBuildConstants = getBuildConstants;
exports.getBuildDefinitions = getBuildDefinitions;
exports.getCommitSha = getCommitSha;
exports.parseEnvironmentBoolean = parseEnvironmentBoolean;
