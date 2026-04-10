const HOSTED_KEYCLOAK_URL = 'https://auth.mereb.app'
const DEFAULT_LOCAL_GATEWAY_ORIGIN = 'http://localhost:8000'
const DEFAULT_LOCAL_KEYCLOAK_URL = 'http://localhost:8081'

const STAGE_VARIANTS = {
  local: {
    appName: 'Mereb Social Local',
    appScheme: 'mereb-local',
    iosBundleIdentifier: 'com.mereb.social.local',
    androidPackage: 'com.mereb.social.local'
  },
  dev: {
    appName: 'Mereb Social Dev',
    appScheme: 'mereb-dev',
    iosBundleIdentifier: 'com.mereb.social.dev',
    androidPackage: 'com.mereb.social.dev'
  },
  stg: {
    appName: 'Mereb Social Stg',
    appScheme: 'mereb-stg',
    iosBundleIdentifier: 'com.mereb.social.stg',
    androidPackage: 'com.mereb.social.stg'
  },
  prd: {
    appName: 'Mereb Social',
    appScheme: 'mereb',
    iosBundleIdentifier: 'com.mereb.social',
    androidPackage: 'com.mereb.social'
  }
}

function trim(value) {
  const next = value?.trim()
  return next ? next : undefined
}

function normalizeOrigin(value) {
  return value.replace(/\/+$/, '')
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

function resolveStageConfig(stage, environment = process.env) {
  const variant = STAGE_VARIANTS[stage]
  const easProjectId = trim(environment.EAS_PROJECT_ID) ?? ''

  const apiUrl =
    stage === 'local'
      ? resolveLocalGatewayOrigin(environment)
      : stage === 'dev'
        ? 'https://api-dev.mereb.app'
        : stage === 'stg'
          ? 'https://api-stg.mereb.app'
          : 'https://api.mereb.app'

  const graphqlUrl = `${apiUrl}/graphql`
  const flagsUrl = `${apiUrl}/flags`
  const inviteRedeemUrl = `${apiUrl}/invite/redeem`

  const keycloak =
    stage === 'local'
      ? {
          url: resolveLocalKeycloakUrl(environment),
          realm: trim(environment.KC_REALM) ?? 'social',
          clientId: trim(environment.KC_CLIENT_ID) ?? 'mobile'
        }
      : stage === 'dev'
        ? {
            url: HOSTED_KEYCLOAK_URL,
            realm: 'mereb-dev',
            clientId: 'mobile-dev'
          }
        : stage === 'stg'
          ? {
              url: HOSTED_KEYCLOAK_URL,
              realm: 'mereb-stg',
              clientId: 'mobile-stg'
            }
          : {
              url: HOSTED_KEYCLOAK_URL,
              realm: 'mereb',
              clientId: 'mobile'
            }

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
    EAS_PROJECT_ID: easProjectId
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
