import { afterEach, describe, expect, it, vi } from 'vitest'

type ExpoConstantsShape = {
  expoConfig?: {
    extra?: Record<string, string>
    hostUri?: string
  } | null
  linkingUri?: string | null
}

async function loadConfig(constants: ExpoConstantsShape) {
  vi.resetModules()
  vi.doMock('expo-constants', () => ({
    default: constants
  }))

  const module = await import('./index')
  return module.config
}

afterEach(() => {
  vi.resetModules()
  vi.doUnmock('expo-constants')
})

describe('runtime config', () => {
  it('uses the Expo development host for local stage defaults', async () => {
    const config = await loadConfig({
      expoConfig: {
        extra: {
          APP_STAGE: 'local'
        },
        hostUri: '192.168.1.30:8081'
      },
      linkingUri: 'exp://192.168.1.30:8081'
    })

    expect(config.apiUrl).toBe('http://192.168.1.30:8000')
    expect(config.graphqlUrl).toBe('http://192.168.1.30:8000/graphql')
    expect(config.flagsUrl).toBe('http://192.168.1.30:8000/flags')
    expect(config.inviteRedeemUrl).toBe('http://192.168.1.30:8000/invite/redeem')
    expect(config.privacyUrl).toBe('http://192.168.1.30:5173/privacy')
    expect(config.supportUrl).toBe('http://192.168.1.30:5173/support')
    expect(config.keycloak.url).toBe('http://192.168.1.30:8081')
  })

  it('rewrites local loopback extras to the Expo development host', async () => {
    const config = await loadConfig({
      expoConfig: {
        extra: {
          APP_STAGE: 'local',
          API_URL: 'http://localhost:8000',
          GRAPHQL_URL: 'http://localhost:8000/graphql',
          FLAGS_URL: 'http://localhost:8000/flags',
          INVITE_REDEEM_URL: 'http://localhost:8000/invite/redeem',
          PRIVACY_URL: 'http://localhost:5173/privacy',
          SUPPORT_URL: 'http://localhost:5173/support',
          KEYCLOAK_URL: 'http://localhost:8081'
        },
        hostUri: '192.168.1.30:8081'
      },
      linkingUri: 'exp://192.168.1.30:8081'
    })

    expect(config.apiUrl).toBe('http://192.168.1.30:8000')
    expect(config.graphqlUrl).toBe('http://192.168.1.30:8000/graphql')
    expect(config.flagsUrl).toBe('http://192.168.1.30:8000/flags')
    expect(config.inviteRedeemUrl).toBe('http://192.168.1.30:8000/invite/redeem')
    expect(config.privacyUrl).toBe('http://192.168.1.30:5173/privacy')
    expect(config.supportUrl).toBe('http://192.168.1.30:5173/support')
    expect(config.keycloak.url).toBe('http://192.168.1.30:8081')
  })

  it('prefers explicit runtime extras over the inferred development host', async () => {
    const config = await loadConfig({
      expoConfig: {
        extra: {
          APP_STAGE: 'local',
          API_URL: 'http://10.0.2.2:8000',
          GRAPHQL_URL: 'http://10.0.2.2:8000/graphql',
          FLAGS_URL: 'http://10.0.2.2:8000/flags',
          INVITE_REDEEM_URL: 'http://10.0.2.2:8000/invite/redeem',
          PRIVACY_URL: 'http://10.0.2.2:5173/privacy',
          SUPPORT_URL: 'http://10.0.2.2:5173/support',
          KEYCLOAK_URL: 'http://10.0.2.2:8081'
        },
        hostUri: '192.168.1.30:8081'
      },
      linkingUri: 'exp://192.168.1.30:8081'
    })

    expect(config.apiUrl).toBe('http://10.0.2.2:8000')
    expect(config.graphqlUrl).toBe('http://10.0.2.2:8000/graphql')
    expect(config.flagsUrl).toBe('http://10.0.2.2:8000/flags')
    expect(config.inviteRedeemUrl).toBe('http://10.0.2.2:8000/invite/redeem')
    expect(config.privacyUrl).toBe('http://10.0.2.2:5173/privacy')
    expect(config.supportUrl).toBe('http://10.0.2.2:5173/support')
    expect(config.keycloak.url).toBe('http://10.0.2.2:8081')
  })

  it('hydrates production Sentry runtime values from Expo extras', async () => {
    const config = await loadConfig({
      expoConfig: {
        extra: {
          APP_STAGE: 'prd',
          SENTRY_DSN: 'https://examplePublicKey@o0.ingest.sentry.io/1',
          SENTRY_ENABLED: 'true',
          SENTRY_STARTUP_TEST_EVENT: 'true',
          SENTRY_REPLAYS_SESSION_SAMPLE_RATE: '1',
          SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE: '0.75'
        }
      }
    })

    expect(config.sentry).toMatchObject({
      dsn: 'https://examplePublicKey@o0.ingest.sentry.io/1',
      enabled: true,
      environment: 'prd',
      startupTestEvent: true,
      replaysSessionSampleRate: 1,
      replaysOnErrorSampleRate: 0.75
    })
  })
})
