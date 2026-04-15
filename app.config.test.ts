import { afterEach, describe, expect, it, vi } from 'vitest'

type LoadedAppConfigModule = typeof import('./app.config')

async function loadAppConfig(stage: string, overrides: Record<string, string | undefined> = {}) {
  vi.resetModules()

  const originalEnv = { ...process.env }
  process.env = {
    ...originalEnv,
    APP_STAGE: stage,
    ...overrides
  }

  const module = (await import('./app.config')) as LoadedAppConfigModule

  return {
    config: module.default,
    restore() {
      process.env = originalEnv
    }
  }
}

afterEach(() => {
  vi.resetModules()
})

describe('app config', () => {
  it('uses the production firebase file only for the production stage', async () => {
    const prd = await loadAppConfig('prd')
    const local = await loadAppConfig('local')

    expect(prd.config.android?.googleServicesFile).toMatch(/google-services\.json$/)
    expect(local.config.android?.googleServicesFile).toBeUndefined()

    prd.restore()
    local.restore()
  })

  it('configures the notifications plugin with the dedicated notification icon', async () => {
    const loaded = await loadAppConfig('prd')
    const notificationsPlugin = loaded.config.plugins?.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-notifications'
    )

    expect(notificationsPlugin).toEqual([
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: '#F43B57',
        defaultChannel: 'messages'
      }
    ])

    loaded.restore()
  })

  it('embeds the resolved stage extras and EAS project id into Expo config', async () => {
    const loaded = await loadAppConfig('prd', {
      SENTRY_DSN: 'https://examplePublicKey@o0.ingest.sentry.io/1',
      SENTRY_ENABLED: 'true'
    })

    expect(loaded.config.extra).toMatchObject({
      APP_STAGE: 'prd',
      SENTRY_DSN: 'https://examplePublicKey@o0.ingest.sentry.io/1',
      SENTRY_ENABLED: 'true',
      eas: {
        projectId: 'e1e8e4af-45f6-458c-8c35-39876e2440b0'
      }
    })

    loaded.restore()
  })
})
