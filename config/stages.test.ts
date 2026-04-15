import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveMobileStage, resolveStageConfig } from './stages'

const repoRoot = resolve(import.meta.dirname, '../../..')
const hasMonorepoInfraContract =
  existsSync(resolve(repoRoot, 'infra/local/compose.yaml')) &&
  existsSync(resolve(repoRoot, 'infra/local/keycloak/realm-social.json')) &&
  existsSync(resolve(repoRoot, 'infra/platform/terraform/envs/dev/main.tf')) &&
  existsSync(resolve(repoRoot, 'infra/platform/terraform/envs/stg/main.tf')) &&
  existsSync(resolve(repoRoot, 'infra/platform/terraform/envs/prd/main.tf')) &&
  existsSync(resolve(repoRoot, 'web/shell/docker-entrypoint.d/40-env-config.sh'))
const itWithMonorepoContract = hasMonorepoInfraContract ? it : it.skip

function read(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8')
}

function matchRequired(contents: string, expression: RegExp, label: string): string {
  const match = contents.match(expression)?.[1]
  if (!match) {
    throw new Error(`Could not resolve ${label}`)
  }
  return match
}

describe('mobile stages', () => {
  it('normalizes unknown stages to local', () => {
    expect(resolveMobileStage(undefined)).toBe('local')
    expect(resolveMobileStage('qa')).toBe('local')
    expect(resolveMobileStage('dev')).toBe('dev')
  })

  it('resolves hosted stage values from the shared infra contract', () => {
    expect(resolveStageConfig('dev')).toMatchObject({
      stage: 'dev',
      appScheme: 'mereb-dev',
      apiUrl: 'https://api-dev.mereb.app',
      privacyUrl: 'https://dev.mereb.app/privacy',
      supportUrl: 'https://dev.mereb.app/support',
      graphqlUrl: 'https://api-dev.mereb.app/graphql',
      flagsUrl: 'https://api-dev.mereb.app/flags',
      inviteRedeemUrl: 'https://api-dev.mereb.app/invite/redeem',
      keycloak: {
        url: 'https://auth.mereb.app',
        realm: 'mereb-dev',
        clientId: 'mobile-dev'
      }
    })

    expect(resolveStageConfig('stg')).toMatchObject({
      stage: 'stg',
      appScheme: 'mereb-stg',
      apiUrl: 'https://api-stg.mereb.app',
      privacyUrl: 'https://stg.mereb.app/privacy',
      supportUrl: 'https://stg.mereb.app/support',
      keycloak: {
        url: 'https://auth.mereb.app',
        realm: 'mereb-stg',
        clientId: 'mobile-stg'
      }
    })

    expect(resolveStageConfig('prd')).toMatchObject({
      stage: 'prd',
      appScheme: 'mereb',
      apiUrl: 'https://api.mereb.app',
      privacyUrl: 'https://mereb.app/privacy',
      supportUrl: 'https://mereb.app/support',
      keycloak: {
        url: 'https://auth.mereb.app',
        realm: 'mereb',
        clientId: 'mobile'
      }
    })
  })

  it('keeps local stage dynamic without hardcoded lan addresses', () => {
    const config = resolveStageConfig('local', {
      LOCAL_GATEWAY_ORIGIN: 'http://192.168.1.30:8000',
      LOCAL_KEYCLOAK_URL: 'http://192.168.1.30:8081',
      KC_REALM: 'social-local',
      KC_CLIENT_ID: 'mobile-local'
    })

    expect(config.graphqlUrl).toBe('http://192.168.1.30:8000/graphql')
    expect(config.flagsUrl).toBe('http://192.168.1.30:8000/flags')
    expect(config.inviteRedeemUrl).toBe('http://192.168.1.30:8000/invite/redeem')
    expect(config.privacyUrl).toBe('http://localhost:5173/privacy')
    expect(config.supportUrl).toBe('http://localhost:5173/support')
    expect(config.keycloak).toEqual({
      url: 'http://192.168.1.30:8081',
      realm: 'social-local',
      clientId: 'mobile-local'
    })
  })

  it('enables Sentry by default only for production when a DSN is present', () => {
    expect(
      resolveStageConfig('dev', {
        SENTRY_DSN: 'https://examplePublicKey@o0.ingest.sentry.io/1'
      }).sentry.enabled
    ).toBe(false)

    expect(
      resolveStageConfig('prd', {
        SENTRY_DSN: 'https://examplePublicKey@o0.ingest.sentry.io/1'
      }).sentry.enabled
    ).toBe(true)
  })

  it('honors explicit Sentry overrides for startup probes and replay rates', () => {
    const config = resolveStageConfig('prd', {
      SENTRY_DSN: 'https://examplePublicKey@o0.ingest.sentry.io/1',
      SENTRY_ENABLED: 'false',
      SENTRY_STARTUP_TEST_EVENT: 'true',
      SENTRY_REPLAYS_SESSION_SAMPLE_RATE: '1',
      SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE: '0.5'
    })

    expect(config.sentry).toMatchObject({
      dsn: 'https://examplePublicKey@o0.ingest.sentry.io/1',
      enabled: false,
      environment: 'prd',
      startupTestEvent: true,
      replaysSessionSampleRate: 1,
      replaysOnErrorSampleRate: 0.5
    })

    expect(config.extra).toMatchObject({
      SENTRY_DSN: 'https://examplePublicKey@o0.ingest.sentry.io/1',
      SENTRY_ENABLED: 'false',
      SENTRY_STARTUP_TEST_EVENT: 'true',
      SENTRY_REPLAYS_SESSION_SAMPLE_RATE: '1',
      SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE: '0.5'
    })
  })

  itWithMonorepoContract('keeps the default local stage aligned with local infra auth settings', () => {
    const localConfig = resolveStageConfig('local')
    const localCompose = read('infra/local/compose.yaml')
    const localRealm = read('infra/local/keycloak/realm-social.json')

    expect(localConfig.keycloak.realm).toBe('social')
    expect(localConfig.keycloak.clientId).toBe('mobile')
    expect(localCompose).toContain('OIDC_AUDIENCE: social')
    expect(localRealm).toContain('"clientId": "mobile"')
    expect(localRealm).toContain('"clientId": "social"')
    expect(localRealm).toContain('"included.client.audience": "social"')
  })

  itWithMonorepoContract('matches terraform and shared hosted runtime sources', () => {
    const devTerraform = read('infra/platform/terraform/envs/dev/main.tf')
    const stgTerraform = read('infra/platform/terraform/envs/stg/main.tf')
    const prdTerraform = read('infra/platform/terraform/envs/prd/main.tf')
    const webEnvEntrypoint = read('web/shell/docker-entrypoint.d/40-env-config.sh')

    expect(matchRequired(devTerraform, /mobile_client_id\s*=\s*"([^"]+)"/, 'dev mobile client')).toBe(
      resolveStageConfig('dev').keycloak.clientId
    )
    expect(matchRequired(stgTerraform, /mobile_client_id\s*=\s*"([^"]+)"/, 'stg mobile client')).toBe(
      resolveStageConfig('stg').keycloak.clientId
    )
    expect(matchRequired(prdTerraform, /mobile_client_id\s*=\s*"([^"]+)"/, 'prd mobile client')).toBe(
      resolveStageConfig('prd').keycloak.clientId
    )

    expect(matchRequired(devTerraform, /api_audience_client_id\s*=\s*"([^"]+)"/, 'dev realm')).toBe(
      resolveStageConfig('dev').keycloak.realm
    )
    expect(matchRequired(stgTerraform, /api_audience_client_id\s*=\s*"([^"]+)"/, 'stg realm')).toBe(
      resolveStageConfig('stg').keycloak.realm
    )
    expect(matchRequired(prdTerraform, /api_audience_client_id\s*=\s*"([^"]+)"/, 'prd realm')).toBe(
      resolveStageConfig('prd').keycloak.realm
    )

    expect(webEnvEntrypoint).toContain('GRAPHQL_URL')
    expect(webEnvEntrypoint).toContain('FLAGS_URL')
    expect(webEnvEntrypoint).toContain('KEYCLOAK_URL')
    expect(webEnvEntrypoint).toContain('KC_REALM')
    expect(webEnvEntrypoint).toContain('KC_CLIENT_ID')
  })
})
