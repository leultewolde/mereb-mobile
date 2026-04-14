/* eslint-env node */
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname)

config.resolver.unstable_enablePackageExports = true
config.resolver.unstable_conditionNames = [
    'require',
    'react-native',
    'development'
]

const ALIASES = {
    tslib: 'tslib/tslib.es6.js'
}

config.resolver.resolveRequest = (context, moduleName, platform) => {
    return context.resolveRequest(
        context,
        ALIASES[moduleName] ?? moduleName,
        platform
    )
}

module.exports = config
