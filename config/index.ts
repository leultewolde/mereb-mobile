import Constants from 'expo-constants'
import { resolveMobileStage, resolveStageConfig, type StageConfig, type StageExtra } from './stages'

type RuntimeExtra = Partial<StageExtra> & {
  KC_URL?: string
}

const runtimeExtra = ((Constants.expoConfig?.extra ?? {}) as RuntimeExtra) ?? {}
const stage = resolveMobileStage(runtimeExtra.APP_STAGE)
const stageDefaults = resolveStageConfig(stage)

function trim(value?: string | null): string | undefined {
  return value?.trim() || undefined
}

function pick(value: string | undefined, fallback: string): string {
  return trim(value) ?? fallback
}

function pickBoolean(value: string | undefined, fallback: boolean): boolean {
  const normalized = trim(value)?.toLowerCase()
  if (normalized === 'true') {
    return true
  }
  if (normalized === 'false') {
    return false
  }
  return fallback
}

function extractHost(value?: string | null): string | undefined {
  const next = trim(value)
  if (!next) {
    return undefined
  }

  try {
    const parsed = new URL(next.includes('://') ? next : `http://${next}`)
    return trim(parsed.hostname)
  } catch {
    return undefined
  }
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

function replaceLoopbackHost(origin: string, hostname?: string): string {
  if (!hostname) {
    return origin
  }

  try {
    const parsed = new URL(origin)
    if (!isLoopbackHost(parsed.hostname)) {
      return origin
    }

    parsed.hostname = hostname
    return parsed.toString().replace(/\/+$/, '')
  } catch {
    return origin
  }
}

function resolveRuntimeHost(): string | undefined {
  return extractHost(Constants.expoConfig?.hostUri) ?? extractHost(Constants.linkingUri)
}

function normalizeLocalUrl(value: string | undefined, runtimeHost: string | undefined): string | undefined {
  const next = trim(value)
  if (!next) {
    return undefined
  }

  return replaceLoopbackHost(next, runtimeHost)
}

function resolveRuntimeLocalDefaults(baseConfig: StageConfig, runtimeHost: string | undefined): StageConfig {
  if (baseConfig.stage !== 'local') {
    return baseConfig
  }

  const apiUrl = replaceLoopbackHost(baseConfig.apiUrl, runtimeHost)
  const keycloakUrl = replaceLoopbackHost(baseConfig.keycloak.url, runtimeHost)
  const privacyUrl = replaceLoopbackHost(baseConfig.privacyUrl, runtimeHost)
  const supportUrl = replaceLoopbackHost(baseConfig.supportUrl, runtimeHost)

  return {
    ...baseConfig,
    apiUrl,
    graphqlUrl: `${apiUrl}/graphql`,
    flagsUrl: `${apiUrl}/flags`,
    inviteRedeemUrl: `${apiUrl}/invite/redeem`,
    privacyUrl,
    supportUrl,
    keycloak: {
      ...baseConfig.keycloak,
      url: keycloakUrl
    }
  }
}

const runtimeHost = resolveRuntimeHost()
const runtimeStageDefaults = resolveRuntimeLocalDefaults(stageDefaults, runtimeHost)
const runtimeExtraApiUrl = stage === 'local' ? normalizeLocalUrl(runtimeExtra.API_URL, runtimeHost) : runtimeExtra.API_URL
const runtimeExtraGraphqlUrl = stage === 'local' ? normalizeLocalUrl(runtimeExtra.GRAPHQL_URL, runtimeHost) : runtimeExtra.GRAPHQL_URL
const runtimeExtraFlagsUrl = stage === 'local' ? normalizeLocalUrl(runtimeExtra.FLAGS_URL, runtimeHost) : runtimeExtra.FLAGS_URL
const runtimeExtraInviteRedeemUrl = stage === 'local'
  ? normalizeLocalUrl(runtimeExtra.INVITE_REDEEM_URL, runtimeHost)
  : runtimeExtra.INVITE_REDEEM_URL
const runtimeExtraPrivacyUrl = stage === 'local'
  ? normalizeLocalUrl(runtimeExtra.PRIVACY_URL, runtimeHost)
  : runtimeExtra.PRIVACY_URL
const runtimeExtraSupportUrl = stage === 'local'
  ? normalizeLocalUrl(runtimeExtra.SUPPORT_URL, runtimeHost)
  : runtimeExtra.SUPPORT_URL
const runtimeExtraKeycloakUrl = stage === 'local'
  ? normalizeLocalUrl(runtimeExtra.KEYCLOAK_URL ?? runtimeExtra.KC_URL, runtimeHost)
  : runtimeExtra.KEYCLOAK_URL ?? runtimeExtra.KC_URL

export type { MobileStage, StageConfig, StageExtra } from './stages'
export { resolveMobileStage, resolveStageConfig } from './stages'

export const config: Omit<StageConfig, 'extra'> & { pushRegistrationEnabled: boolean } = {
  ...runtimeStageDefaults,
  graphqlUrl: pick(runtimeExtraGraphqlUrl, runtimeStageDefaults.graphqlUrl),
  flagsUrl: pick(runtimeExtraFlagsUrl, runtimeStageDefaults.flagsUrl),
  inviteRedeemUrl: pick(runtimeExtraInviteRedeemUrl, runtimeStageDefaults.inviteRedeemUrl),
  apiUrl: pick(runtimeExtraApiUrl, runtimeStageDefaults.apiUrl),
  privacyUrl: pick(runtimeExtraPrivacyUrl, runtimeStageDefaults.privacyUrl),
  supportUrl: pick(runtimeExtraSupportUrl, runtimeStageDefaults.supportUrl),
  appScheme: pick(runtimeExtra.APP_SCHEME, runtimeStageDefaults.appScheme),
  easProjectId: pick(runtimeExtra.EAS_PROJECT_ID, runtimeStageDefaults.easProjectId),
  keycloak: {
    url: pick(runtimeExtraKeycloakUrl, runtimeStageDefaults.keycloak.url),
    realm: pick(runtimeExtra.KC_REALM, runtimeStageDefaults.keycloak.realm),
    clientId: pick(runtimeExtra.KC_CLIENT_ID, runtimeStageDefaults.keycloak.clientId)
  },
  pushRegistrationEnabled: pickBoolean(
    runtimeExtra.PUSH_REGISTRATION_ENABLED,
    runtimeStageDefaults.pushRegistrationEnabled
  )
}
