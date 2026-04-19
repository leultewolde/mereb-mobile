const HOSTED_KEYCLOAK_URL = 'https://auth.mereb.app'
const DEFAULT_LOCAL_GATEWAY_ORIGIN = 'http://localhost:8000'
const DEFAULT_LOCAL_KEYCLOAK_URL = 'http://localhost:8081'
const EAS_PROJECT_ID = 'e1e8e4af-45f6-458c-8c35-39876e2440b0'

const STAGE_VARIANTS = {
  local: {
    appName: 'Mereb Social Local',
    appScheme: 'mereb-local',
    iosBundleIdentifier: 'com.mereb.app.local',
    androidPackage: 'com.mereb.app.local'
  },
  dev: {
    appName: 'Mereb Social Dev',
    appScheme: 'mereb-dev',
    iosBundleIdentifier: 'com.mereb.app.dev',
    androidPackage: 'com.mereb.app.dev'
  },
  stg: {
    appName: 'Mereb Social Stg',
    appScheme: 'mereb-stg',
    iosBundleIdentifier: 'com.mereb.app.stg',
    androidPackage: 'com.mereb.app.stg'
  },
  prd: {
    appName: 'Mereb Social',
    appScheme: 'mereb',
    iosBundleIdentifier: 'com.mereb.app',
    androidPackage: 'com.mereb.app'
  }
}

function trim(value) {
  return value?.trim() || undefined
}

function normalizeOrigin(value) {
  return value.replace(/\/+$/, '')
}

function resolveBooleanString(value, fallback) {
  const normalized = trim(value)?.toLowerCase()
  if (normalized === 'true' || normalized === 'false') {
    return normalized
  }
  return fallback ? 'true' : 'false'
}

function resolveNumber(value, fallback) {
  const normalized = trim(value)
  if (!normalized) {
    return fallback
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : fallback
}

function isMobileStage(value) {
  return value === 'local' || value === 'dev' || value === 'stg' || value === 'prd'
}

function resolveMobileStage(value) {
  return isMobileStage(value) ? value : 'local'
}

function resolveLocalGatewayOrigin(environment) {
  const explicitOrigin = trim(environment.LOCAL_GATEWAY_ORIGIN)
  if (explicitOrigin) {
    return normalizeOrigin(explicitOrigin)
  }

  const explicitApiOrigin = trim(environment.API_URL)
  if (explicitApiOrigin) {
    return normalizeOrigin(explicitApiOrigin)
  }

  return DEFAULT_LOCAL_GATEWAY_ORIGIN
}

function resolveLocalKeycloakUrl(environment) {
  const explicitOrigin = trim(environment.LOCAL_KEYCLOAK_URL) ?? trim(environment.KEYCLOAK_URL) ?? trim(environment.KC_URL)
  return normalizeOrigin(explicitOrigin ?? DEFAULT_LOCAL_KEYCLOAK_URL)
}

function resolveWebOrigin(stage, environment) {
  const explicitOrigin = trim(environment.WEB_ORIGIN)
  if (explicitOrigin) {
    return normalizeOrigin(explicitOrigin)
  }

  if (stage === 'local') {
    return 'http://localhost:5173'
  }

  if (stage === 'dev') {
    return 'https://dev.mereb.app'
  }

  if (stage === 'stg') {
    return 'https://stg.mereb.app'
  }

  return 'https://mereb.app'
}

function resolveHostedApiUrl(stage) {
  switch (stage) {
    case 'dev':
      return 'https://api-dev.mereb.app'
    case 'stg':
      return 'https://api-stg.mereb.app'
    default:
      return 'https://api.mereb.app'
  }
}

function resolveApiUrl(stage, environment) {
  if (stage === 'local') {
    return resolveLocalGatewayOrigin(environment)
  }

  return resolveHostedApiUrl(stage)
}

function resolveKeycloak(stage, environment) {
  if (stage === 'local') {
    return {
      url: resolveLocalKeycloakUrl(environment),
      realm: trim(environment.KC_REALM) ?? 'social',
      clientId: trim(environment.KC_CLIENT_ID) ?? 'mobile'
    }
  }

  switch (stage) {
    case 'dev':
      return {
        url: HOSTED_KEYCLOAK_URL,
        realm: 'mereb-dev',
        clientId: 'mobile-dev'
      }
    case 'stg':
      return {
        url: HOSTED_KEYCLOAK_URL,
        realm: 'mereb-stg',
        clientId: 'mobile-stg'
      }
    default:
      return {
        url: HOSTED_KEYCLOAK_URL,
        realm: 'mereb',
        clientId: 'mobile'
      }
  }
}

function resolveStageConfig(stage, environment = process.env) {
  const variant = STAGE_VARIANTS[stage]
  const easProjectId = trim(environment.EAS_PROJECT_ID) ?? EAS_PROJECT_ID

  const apiUrl = resolveApiUrl(stage, environment)
  const graphqlUrl = `${apiUrl}/graphql`
  const flagsUrl = `${apiUrl}/flags`
  const inviteRedeemUrl = `${apiUrl}/invite/redeem`
  const webOrigin = resolveWebOrigin(stage, environment)
  const privacyUrl = `${webOrigin}/privacy`
  const supportUrl = `${webOrigin}/support`
  const pushRegistrationEnabled = resolveBooleanString(
    environment.PUSH_REGISTRATION_ENABLED,
    stage !== 'local'
  )
  const sentryDsn = trim(environment.SENTRY_DSN)
  const sentryEnabled = resolveBooleanString(
    environment.SENTRY_ENABLED,
    stage === 'prd' && Boolean(sentryDsn)
  )
  const sentryStartupTestEvent = resolveBooleanString(
    environment.SENTRY_STARTUP_TEST_EVENT,
    false
  )
  const sentryReplaysSessionSampleRate = resolveNumber(
    environment.SENTRY_REPLAYS_SESSION_SAMPLE_RATE,
    0.1
  )
  const sentryReplaysOnErrorSampleRate = resolveNumber(
    environment.SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE,
      1
  )
  const sentryTracesSampleRate = resolveNumber(
    environment.SENTRY_TRACES_SAMPLE_RATE,
    stage === 'prd' ? 0.2 : 0
  )

  const keycloak = resolveKeycloak(stage, environment)

  const extra = {
    APP_STAGE: stage,
    GRAPHQL_URL: graphqlUrl,
    FLAGS_URL: flagsUrl,
    KEYCLOAK_URL: keycloak.url,
    KC_REALM: keycloak.realm,
    KC_CLIENT_ID: keycloak.clientId,
    INVITE_REDEEM_URL: inviteRedeemUrl,
    API_URL: apiUrl,
    APP_SCHEME: variant.appScheme,
    EAS_PROJECT_ID: easProjectId,
    PRIVACY_URL: privacyUrl,
    SUPPORT_URL: supportUrl,
    PUSH_REGISTRATION_ENABLED: pushRegistrationEnabled,
    SENTRY_DSN: sentryDsn ?? '',
    SENTRY_ENABLED: sentryEnabled,
    SENTRY_STARTUP_TEST_EVENT: sentryStartupTestEvent,
    SENTRY_REPLAYS_SESSION_SAMPLE_RATE: String(sentryReplaysSessionSampleRate),
    SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE: String(sentryReplaysOnErrorSampleRate),
    SENTRY_TRACES_SAMPLE_RATE: String(sentryTracesSampleRate)
  }

  return {
    stage,
    appName: variant.appName,
    appScheme: variant.appScheme,
    iosBundleIdentifier: variant.iosBundleIdentifier,
    androidPackage: variant.androidPackage,
    graphqlUrl,
    flagsUrl,
    inviteRedeemUrl,
    apiUrl,
    privacyUrl,
    supportUrl,
    pushRegistrationEnabled: pushRegistrationEnabled === 'true',
    sentry: {
      dsn: sentryDsn,
      enabled: sentryEnabled === 'true' && Boolean(sentryDsn),
      environment: stage,
      startupTestEvent: sentryStartupTestEvent === 'true',
      replaysSessionSampleRate: sentryReplaysSessionSampleRate,
      replaysOnErrorSampleRate: sentryReplaysOnErrorSampleRate,
      tracesSampleRate: sentryTracesSampleRate
    },
    keycloak,
    easProjectId,
    extra
  }
}

module.exports = {
  isMobileStage,
  resolveMobileStage,
  resolveStageConfig
}
