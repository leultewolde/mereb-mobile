import { afterEach, describe, expect, it, vi } from 'vitest'

type LoadedSentryModule = typeof import('./sentry')

type SentryTestConfig = {
  dsn?: string
  enabled: boolean
  environment: 'local' | 'dev' | 'stg' | 'prd'
  startupTestEvent: boolean
  replaysSessionSampleRate: number
  replaysOnErrorSampleRate: number
}

async function loadSentryModule(options?: {
  config?: Partial<SentryTestConfig>
  cachedProbe?: string | null
  constants?: {
    slug?: string
    version?: string
  }
  getItemError?: Error
  withReplayIntegration?: boolean
}) {
  vi.resetModules()

  const config: SentryTestConfig = {
    dsn: 'https://examplePublicKey@o0.ingest.sentry.io/1',
    enabled: true,
    environment: 'prd',
    startupTestEvent: false,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1,
    ...options?.config
  }

  const getItem = vi.fn(async () => {
    if (options?.getItemError) {
      throw options.getItemError
    }

    return options?.cachedProbe ?? null
  })
  const setItem = vi.fn(async () => undefined)
  const flush = vi.fn(async () => true)
  const captureException = vi.fn()
  const setUser = vi.fn()
  const addBreadcrumb = vi.fn()
  const init = vi.fn()
  const wrap = vi.fn((component) => component)
  const setTag = vi.fn()
  const setExtra = vi.fn()
  const withScope = vi.fn((callback: (scope: { setTag: typeof setTag; setExtra: typeof setExtra }) => void) => {
    callback({ setTag, setExtra })
  })
  const mobileReplayIntegration =
    options?.withReplayIntegration === false
      ? undefined
      : vi.fn((integrationOptions: Record<string, unknown>) => ({
          name: 'mobileReplayIntegration',
          integrationOptions
        }))

  vi.doMock('@mobile/config', () => ({
    config: {
      sentry: config
    }
  }))

  vi.doMock('expo-constants', () => ({
    default: {
      expoConfig: {
        slug: options?.constants?.slug ?? 'mereb-social',
        version: options?.constants?.version ?? '1.0.1'
      }
    }
  }))

  vi.doMock('@react-native-async-storage/async-storage', () => ({
    default: {
      getItem,
      setItem
    }
  }))

  vi.doMock('@sentry/react-native', () => ({
    init,
    flush,
    captureException,
    setUser,
    addBreadcrumb,
    wrap,
    withScope,
    mobileReplayIntegration
  }))

  const module = (await import('./sentry')) as LoadedSentryModule

  return {
    module,
    mocks: {
      addBreadcrumb,
      captureException,
      flush,
      getItem,
      init,
      mobileReplayIntegration,
      setExtra,
      setItem,
      setTag,
      setUser,
      withScope,
      wrap
    }
  }
}

afterEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.doUnmock('@mobile/config')
  vi.doUnmock('expo-constants')
  vi.doUnmock('@react-native-async-storage/async-storage')
  vi.doUnmock('@sentry/react-native')
})

describe('mobile sentry monitoring', () => {
  it('initializes Sentry with replay integration and emits the startup probe once', async () => {
    const { module, mocks } = await loadSentryModule({
      config: {
        startupTestEvent: true,
        replaysSessionSampleRate: 1,
        replaysOnErrorSampleRate: 0.5
      }
    })

    module.initializeSentry()

    expect(mocks.mobileReplayIntegration).toHaveBeenCalledWith({
      maskAllText: true,
      maskAllImages: true,
      maskAllVectors: true
    })
    expect(mocks.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/1',
        enabled: true,
        environment: 'prd',
        release: 'mereb-social@1.0.1',
        replaysSessionSampleRate: 1,
        replaysOnErrorSampleRate: 0.5
      })
    )

    await vi.waitFor(() => {
      expect(mocks.captureException).toHaveBeenCalledWith(expect.any(Error))
      expect(mocks.setItem).toHaveBeenCalledWith(
        'sentry-startup-probe:prd:mereb-social@1.0.1',
        'true'
      )
    })

    expect(mocks.setTag).toHaveBeenCalledWith('probe', 'startup')
    expect(mocks.setTag).toHaveBeenCalledWith('stage', 'prd')
    expect(mocks.setExtra).toHaveBeenCalledWith('release', 'mereb-social@1.0.1')
    expect(mocks.flush).toHaveBeenCalled()
  })

  it('skips initialization and helper calls when Sentry is disabled', async () => {
    const { module, mocks } = await loadSentryModule({
      config: {
        dsn: undefined,
        enabled: false
      }
    })

    const RootComponent = () => null
    module.initializeSentry()
    module.setSentryUser({ id: 'user-1', username: 'mereb' })
    module.addSentryBreadcrumb({
      category: 'notifications',
      message: 'noop'
    })
    module.captureSentryException(new Error('noop'))

    expect(module.withSentryRoot(RootComponent)).toBe(RootComponent)
    expect(mocks.init).not.toHaveBeenCalled()
    expect(mocks.setUser).not.toHaveBeenCalled()
    expect(mocks.addBreadcrumb).not.toHaveBeenCalled()
    expect(mocks.captureException).not.toHaveBeenCalled()
    expect(mocks.wrap).not.toHaveBeenCalled()
  })

  it('does not resend the startup probe when the release key is already cached', async () => {
    const { module, mocks } = await loadSentryModule({
      cachedProbe: 'true',
      config: {
        startupTestEvent: true
      }
    })

    module.initializeSentry()

    await vi.waitFor(() => {
      expect(mocks.getItem).toHaveBeenCalledWith(
        'sentry-startup-probe:prd:mereb-social@1.0.1'
      )
    })

    expect(mocks.captureException).not.toHaveBeenCalled()
    expect(mocks.setItem).not.toHaveBeenCalled()
  })

  it('forwards helper calls to Sentry when runtime monitoring is enabled', async () => {
    const { module, mocks } = await loadSentryModule()

    const RootComponent = () => null

    module.setSentryUser({
      id: 'user-1',
      username: 'mereb',
      email: 'mereb@example.com'
    })
    module.setSentryUser(null)
    module.captureSentryException(new Error('mobile error'))
    module.addSentryBreadcrumb({
      category: 'notifications',
      message: 'registered device'
    })

    expect(module.withSentryRoot(RootComponent)).toBe(RootComponent)
    expect(mocks.setUser).toHaveBeenNthCalledWith(1, {
      id: 'user-1',
      username: 'mereb',
      email: 'mereb@example.com'
    })
    expect(mocks.setUser).toHaveBeenNthCalledWith(2, null)
    expect(mocks.captureException).toHaveBeenCalledWith(expect.any(Error))
    expect(mocks.addBreadcrumb).toHaveBeenCalledWith({
      category: 'notifications',
      message: 'registered device',
      data: undefined,
      level: 'info'
    })
    expect(mocks.wrap).toHaveBeenCalledWith(RootComponent)
  })

  it('initializes without replay integration and skips the probe when release metadata is missing', async () => {
    const { module, mocks } = await loadSentryModule({
      config: {
        startupTestEvent: true
      },
      constants: {
        slug: '',
        version: ''
      },
      withReplayIntegration: false
    })

    module.initializeSentry()

    expect(mocks.init).toHaveBeenCalledWith(
      expect.objectContaining({
        release: undefined
      })
    )
    expect(mocks.init).not.toHaveBeenCalledWith(
      expect.objectContaining({
        integrations: expect.anything()
      })
    )
    expect(mocks.getItem).not.toHaveBeenCalled()
    expect(mocks.captureException).not.toHaveBeenCalled()
  })

  it('swallows startup probe storage errors after initialization', async () => {
    const { module, mocks } = await loadSentryModule({
      config: {
        startupTestEvent: true
      },
      getItemError: new Error('storage unavailable')
    })

    module.initializeSentry()

    await vi.waitFor(() => {
      expect(mocks.getItem).toHaveBeenCalledWith(
        'sentry-startup-probe:prd:mereb-social@1.0.1'
      )
    })

    expect(mocks.captureException).not.toHaveBeenCalled()
    expect(mocks.setItem).not.toHaveBeenCalled()
  })
})
