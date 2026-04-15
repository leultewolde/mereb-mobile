import React from 'react'
import { act, renderHook } from '@testing-library/react-native/pure'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createJsonResponse,
  createJwt,
  flushMicrotasks,
  waitForExpectation
} from '../test/react-test-utils'

type LoadedAppProvidersModule = typeof import('./AppProviders')
type AuthRequestMock = {
  codeVerifier: string
  promptAsync: ReturnType<typeof vi.fn>
}

type SecureStoreState = Map<string, string>

function getNativeTestState() {
  return (globalThis as unknown as {
    __RN_TEST__: {
      appStateListeners: ((nextState: string) => void)[]
    }
  }).__RN_TEST__
}

async function loadAppProvidersModule(options?: {
  accessToken?: string
  refreshToken?: string
  fetchResponses?: ReturnType<typeof createJsonResponse>[]
  keycloak?: Partial<{
    url: string
    realm: string
    clientId: string
  }>
  discoveryDocument?: {
    tokenEndpoint?: string
  }
  authPromptResult?: {
    type: string
    params?: {
      code?: string
    }
  }
  persistCacheError?: Error
  notificationsUnregisterError?: Error
  apolloResetStoreError?: Error
  apolloClearStoreError?: Error
}) {
  vi.resetModules()

  const secureStore = new Map<string, string>() as SecureStoreState
  if (options?.accessToken) {
    secureStore.set('access_token', options.accessToken)
  }
  if (options?.refreshToken) {
    secureStore.set('refresh_token', options.refreshToken)
  }

  const getItemAsync = vi.fn(async (key: string) => secureStore.get(key) ?? null)
  const setItemAsync = vi.fn(async (key: string, value: string) => {
    secureStore.set(key, value)
  })
  const deleteItemAsync = vi.fn(async (key: string) => {
    secureStore.delete(key)
  })

  const fetchMock = vi.fn()
  for (const response of options?.fetchResponses ?? []) {
    fetchMock.mockResolvedValueOnce(response as unknown as Response)
  }
  globalThis.fetch = fetchMock as typeof fetch

  const addBreadcrumb = vi.fn()
  const captureSentryException = vi.fn()
  const setSentryUser = vi.fn()
  const notificationsUnregister = vi.fn(async () => {
    if (options?.notificationsUnregisterError) {
      throw options.notificationsUnregisterError
    }
  })
  const notificationsProps = {
    current: undefined as
      | {
          authToken?: string
          userId?: string
          isAuthenticated: boolean
        }
      | undefined
  }
  const flagsProps = {
    current: undefined as { token?: string } | undefined
  }
  const apolloClient = {
    clearStore: vi.fn(async () => {
      if (options?.apolloClearStoreError) {
        throw options.apolloClearStoreError
      }
    }),
    resetStore: vi.fn(async () => {
      if (options?.apolloResetStoreError) {
        throw options.apolloResetStoreError
      }
    })
  }
  const diffMock = vi.fn(() => ({}))
  let lastCache: { diff: (options: Record<string, unknown>) => unknown } | undefined
  let graphqlFetch:
    | ((uri: RequestInfo | URL, options?: RequestInit) => Promise<Response>)
    | undefined
  let authRequestInstance: AuthRequestMock | undefined
  let authRequestOptions: Record<string, unknown> | undefined

  const fetchDiscoveryAsync = vi.fn(async () => ({
    tokenEndpoint: 'https://keycloak.example/token',
    ...options?.discoveryDocument
  }))
  const makeRedirectUri = vi.fn(() => 'mereb://oauth2redirect/keycloak')

  class AuthRequest {
    codeVerifier = 'verifier'
    promptAsync = vi.fn(async () => ({
      type: 'success',
      params: {
        code: 'auth-code'
      },
      ...options?.authPromptResult
    }))

    constructor(options: Record<string, unknown>) {
      authRequestOptions = options
      authRequestInstance = this
    }
  }

  vi.doMock('@mobile/config', () => ({
    config: {
      graphqlUrl: 'https://api.mereb.app/graphql',
      pushRegistrationEnabled: true,
      appScheme: 'mereb',
      keycloak: {
        url: 'https://keycloak.example',
        realm: 'mereb',
        clientId: 'mobile-app',
        ...options?.keycloak
      }
    }
  }))

  vi.doMock('@apollo/client', () => ({
    ApolloClient: vi.fn(() => apolloClient),
    HttpLink: vi.fn((options: { fetch: typeof graphqlFetch }) => {
      graphqlFetch = options.fetch
      return { options }
    }),
    InMemoryCache: class {
      constructor() {
        lastCache = this as unknown as { diff: (options: Record<string, unknown>) => unknown }
      }
      diff = diffMock
    }
  }))

  vi.doMock('@apollo/client/react', () => ({
    ApolloProvider({ children }: { children: React.ReactNode }) {
      return <>{children}</>
    }
  }))

  vi.doMock('apollo3-cache-persist', () => ({
    AsyncStorageWrapper: vi.fn((storage: unknown) => storage),
    persistCache: vi.fn(async () => {
      if (options?.persistCacheError) {
        throw options.persistCacheError
      }
    })
  }))

  vi.doMock('@react-native-async-storage/async-storage', () => ({
    default: {
      getItem: vi.fn(async () => null),
      setItem: vi.fn(async () => undefined)
    }
  }))

  vi.doMock('expo-secure-store', () => ({
    getItemAsync,
    setItemAsync,
    deleteItemAsync
  }))

  vi.doMock('expo-auth-session', () => ({
    AuthRequest,
    ResponseType: {
      Code: 'code'
    },
    fetchDiscoveryAsync,
    makeRedirectUri
  }))

  vi.doMock('../monitoring/sentry', () => ({
    addSentryBreadcrumb: addBreadcrumb,
    captureSentryException,
    setSentryUser
  }))

  vi.doMock('./Flags', () => ({
    FlagsProvider({
      token,
      children
    }: {
      token?: string
      children: React.ReactNode
    }) {
      flagsProps.current = { token }
      return <>{children}</>
    }
  }))

  vi.doMock('./Notifications', () => ({
    NotificationsProvider({
      authToken,
      userId,
      isAuthenticated,
      controlsRef,
      children
    }: {
      authToken?: string
      userId?: string
      isAuthenticated: boolean
      controlsRef?: { current: unknown }
      children: React.ReactNode
    }) {
      notificationsProps.current = {
        authToken,
        userId,
        isAuthenticated
      }

      if (controlsRef) {
        controlsRef.current = {
          unregisterCurrentDevice: notificationsUnregister
        }
      }

      return <>{children}</>
    }
  }))

  const module = (await import('./AppProviders')) as LoadedAppProvidersModule

  return {
    module,
    mocks: {
      addBreadcrumb,
      apolloClient,
      authRequestInstance: () => authRequestInstance,
      authRequestOptions: () => authRequestOptions,
      captureSentryException,
      deleteItemAsync,
      diffMock,
      fetchDiscoveryAsync,
      fetchMock,
      flagsProps,
      getCache: () => lastCache,
      getItemAsync,
      graphqlFetch: () => graphqlFetch,
      makeRedirectUri,
      notificationsProps,
      notificationsUnregister,
      setItemAsync,
      setSentryUser
    }
  }
}

function renderAppProviders(module: LoadedAppProvidersModule) {
  return renderHook(() => module.useAuth(), {
    wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
      return <module.AppProviders>{children}</module.AppProviders>
    }
  })
}

function renderAuthProbeWithoutProvider(module: LoadedAppProvidersModule) {
  return renderHook(() => module.useAuth())
}

afterEach(() => {
  vi.useRealTimers()
  vi.resetModules()
  vi.clearAllMocks()
  vi.doUnmock('@mobile/config')
  vi.doUnmock('@apollo/client')
  vi.doUnmock('@apollo/client/react')
  vi.doUnmock('apollo3-cache-persist')
  vi.doUnmock('@react-native-async-storage/async-storage')
  vi.doUnmock('expo-secure-store')
  vi.doUnmock('expo-auth-session')
  vi.doUnmock('../monitoring/sentry')
  vi.doUnmock('./Flags')
  vi.doUnmock('./Notifications')
})

describe('AppProviders', () => {
  it('exposes safe default auth actions outside the provider', async () => {
    const { module } = await loadAppProvidersModule()
    const { result, unmount } = renderAuthProbeWithoutProvider(module)

    expect(result.current).toMatchObject({
      isReady: false,
      isAuthenticated: false,
      isAuthConfigured: false
    })
    expect(result.current.hasRole('admin')).toBe(false)
    expect(result.current.hasAnyRole(['admin'])).toBe(false)

    await act(async () => {
      await result.current.login()
      await result.current.register()
      await result.current.logout()
    })

    unmount()
  })

  it('hydrates a persisted session and forwards the auth state to nested providers', async () => {
    const accessToken = createJwt({
      sub: 'user-1',
      preferred_username: 'mereb',
      email: 'mereb@example.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
      realm_access: {
        roles: ['admin']
      }
    })
    const { module, mocks } = await loadAppProvidersModule({
      accessToken
    })
    const { result, unmount } = renderAppProviders(module)

    await waitForExpectation(() => {
      expect(result.current.isReady).toBe(true)
      expect(result.current.isAuthenticated).toBe(true)
    })

    expect(result.current.profile).toMatchObject({
      id: 'user-1',
      username: 'mereb',
      email: 'mereb@example.com',
      adminAccess: 'full'
    })
    expect(result.current.hasRole('admin')).toBe(true)
    expect(result.current.hasAnyRole(['viewer', 'admin'])).toBe(true)
    expect(mocks.flagsProps.current).toEqual({ token: accessToken })
    expect(mocks.notificationsProps.current).toEqual({
      authToken: accessToken,
      userId: 'user-1',
      isAuthenticated: true
    })
    expect(mocks.setSentryUser).toHaveBeenCalledWith({
      id: 'user-1',
      username: 'mereb',
      email: 'mereb@example.com'
    })

    unmount()
  })

  it('refreshes an expiring bootstrap session with the stored refresh token', async () => {
    const expiringToken = createJwt({
      sub: 'user-1',
      exp: Math.floor(Date.now() / 1000) + 30
    })
    const refreshedToken = createJwt({
      sub: 'user-1',
      exp: Math.floor(Date.now() / 1000) + 3600
    })
    const { module, mocks } = await loadAppProvidersModule({
      accessToken: expiringToken,
      refreshToken: 'refresh-token-1',
      fetchResponses: [
        createJsonResponse({
          access_token: refreshedToken,
          refresh_token: 'refresh-token-2'
        })
      ]
    })
    const { result, unmount } = renderAppProviders(module)

    await waitForExpectation(() => {
      expect(result.current.token).toBe(refreshedToken)
    })

    expect(mocks.fetchDiscoveryAsync).toHaveBeenCalled()
    expect(mocks.fetchMock).toHaveBeenCalledWith(
      'https://keycloak.example/token',
      expect.objectContaining({
        method: 'POST'
      })
    )
    expect(mocks.setItemAsync).toHaveBeenCalledWith('access_token', refreshedToken)
    expect(mocks.setItemAsync).toHaveBeenCalledWith('refresh_token', 'refresh-token-2')

    unmount()
  })

  it('strips deprecated Apollo diff options before delegating to the cache', async () => {
    const warningSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const originalDev = (globalThis as unknown as { __DEV__?: boolean }).__DEV__
    vi.stubGlobal('__DEV__', true)

    const { module, mocks } = await loadAppProvidersModule()
    const { unmount } = renderAppProviders(module)

    await waitForExpectation(() => {
      expect(mocks.getCache()).toBeDefined()
    })

    mocks.getCache()?.diff({
      query: 'query Test',
      canonizeResults: true
    })

    expect(mocks.diffMock).toHaveBeenCalledWith(
      expect.not.objectContaining({
        canonizeResults: expect.anything()
      })
    )
    expect(warningSpy).toHaveBeenCalledWith(
      'Removed deprecated Apollo `canonizeResults` option from `cache.diff` call.'
    )

    unmount()
    warningSpy.mockRestore()
    vi.stubGlobal('__DEV__', originalDev)
  })

  it('retries GraphQL requests after an authentication failure with a refreshed token', async () => {
    const accessToken = createJwt({
      sub: 'user-1',
      exp: Math.floor(Date.now() / 1000) + 3600
    })
    const refreshedToken = createJwt({
      sub: 'user-1',
      exp: Math.floor(Date.now() / 1000) + 7200
    })
    const graphqlErrorResponse = createJsonResponse({
      errors: [{ message: 'Authentication required' }]
    })
    const successfulResponse = createJsonResponse({
      data: {
        conversations: []
      }
    })
    const { module, mocks } = await loadAppProvidersModule({
      accessToken,
      refreshToken: 'refresh-token-1',
      fetchResponses: [
        graphqlErrorResponse,
        createJsonResponse({
          access_token: refreshedToken,
          refresh_token: 'refresh-token-1'
        }),
        successfulResponse
      ]
    })
    const { unmount } = renderAppProviders(module)

    await waitForExpectation(() => {
      expect(mocks.graphqlFetch()).toBeTypeOf('function')
    })

    let response: Response | undefined
    await act(async () => {
      response = await mocks.graphqlFetch()?.('https://api.mereb.app/graphql', {
        headers: {
          'content-type': 'application/json'
        }
      })
      await flushMicrotasks()
    })

    expect(response).toBe(successfulResponse)
    expect(mocks.fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.mereb.app/graphql',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${accessToken}`
        })
      })
    )
    expect(mocks.fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://api.mereb.app/graphql',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${refreshedToken}`
        })
      })
    )

    unmount()
  })

  it('handles interactive login, registration, and logout', async () => {
    const loginToken = createJwt({
      sub: 'user-1',
      exp: Math.floor(Date.now() / 1000) + 3600
    })
    const registerToken = createJwt({
      sub: 'user-2',
      exp: Math.floor(Date.now() / 1000) + 3600
    })
    const { module, mocks } = await loadAppProvidersModule({
      fetchResponses: [
        createJsonResponse({
          access_token: loginToken,
          refresh_token: 'refresh-login'
        }),
        createJsonResponse({
          access_token: registerToken,
          refresh_token: 'refresh-register'
        })
      ]
    })
    const { result, unmount } = renderAppProviders(module)

    await waitForExpectation(() => {
      expect(result.current.isReady).toBe(true)
      expect(result.current.isAuthenticated).toBe(false)
    })

    await act(async () => {
      await result.current.login()
      await flushMicrotasks()
    })

    expect(mocks.authRequestOptions()).toMatchObject({
      clientId: 'mobile-app',
      redirectUri: 'mereb://oauth2redirect/keycloak',
      responseType: 'code',
      usePKCE: true
    })
    expect(mocks.authRequestInstance()?.promptAsync).toHaveBeenCalled()
    expect(mocks.setItemAsync).toHaveBeenCalledWith('access_token', loginToken)

    await act(async () => {
      await result.current.register()
      await flushMicrotasks()
    })

    expect(mocks.authRequestOptions()).toMatchObject({
      extraParams: {
        kc_action: 'register'
      }
    })
    expect(mocks.setItemAsync).toHaveBeenCalledWith('access_token', registerToken)

    await act(async () => {
      await result.current.logout()
      await flushMicrotasks()
    })

    await waitForExpectation(() => {
      expect(result.current.isAuthenticated).toBe(false)
    })

    expect(mocks.notificationsUnregister).toHaveBeenCalled()
    expect(mocks.deleteItemAsync).toHaveBeenCalledWith('access_token')
    expect(mocks.deleteItemAsync).toHaveBeenCalledWith('refresh_token')

    unmount()
  })

  it('schedules a proactive refresh before the access token expires', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-14T12:00:00.000Z'))
    const accessToken = createJwt({
      sub: 'user-1',
      exp: Math.floor(Date.now() / 1000) + 180
    })
    const refreshedToken = createJwt({
      sub: 'user-1',
      exp: Math.floor(Date.now() / 1000) + 7200
    })
    const { module, mocks } = await loadAppProvidersModule({
      accessToken,
      refreshToken: 'refresh-token-1',
      fetchResponses: [
        createJsonResponse({
          access_token: refreshedToken,
          refresh_token: 'refresh-token-1'
        })
      ]
    })
    const { result, unmount } = renderAppProviders(module)

    await act(async () => {
      await flushMicrotasks(10)
    })

    expect(result.current.token).toBe(accessToken)
    expect(mocks.notificationsProps.current?.authToken).toBe(accessToken)

    await act(async () => {
      vi.advanceTimersByTime(60_000)
      await flushMicrotasks()
    })

    await waitForExpectation(() => {
      expect(mocks.fetchMock).toHaveBeenCalledWith(
        'https://keycloak.example/token',
        expect.objectContaining({
          method: 'POST'
        })
      )
    })

    unmount()
  })

  it('clears the stored session when the refresh token is rejected', async () => {
    const expiredToken = createJwt({
      sub: 'user-1',
      exp: Math.floor(Date.now() / 1000) - 60
    })
    const { module, mocks } = await loadAppProvidersModule({
      accessToken: expiredToken,
      refreshToken: 'refresh-token-1',
      fetchResponses: [
        createJsonResponse(
          {
            error: 'invalid_grant',
            error_description: 'Invalid refresh token'
          },
          { status: 400 }
        )
      ]
    })
    const { result, unmount } = renderAppProviders(module)

    await waitForExpectation(() => {
      expect(result.current.isReady).toBe(true)
      expect(result.current.isAuthenticated).toBe(false)
    })

    expect(mocks.captureSentryException).toHaveBeenCalled()
    expect(mocks.deleteItemAsync).toHaveBeenCalledWith('access_token')
    expect(mocks.deleteItemAsync).toHaveBeenCalledWith('refresh_token')

    unmount()
  })

  it('keeps a usable token when refresh fails for a non-auth reason', async () => {
    const usableToken = createJwt({
      sub: 'user-1',
      exp: Math.floor(Date.now() / 1000) + 90
    })
    const warningSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { module, mocks } = await loadAppProvidersModule({
      accessToken: usableToken,
      refreshToken: 'refresh-token-1',
      fetchResponses: [
        createJsonResponse(
          {
            error: 'server_error',
            error_description: 'Something failed upstream'
          },
          { status: 500 }
        )
      ]
    })
    const { result, unmount } = renderAppProviders(module)

    await waitForExpectation(() => {
      expect(result.current.token).toBe(usableToken)
    })

    expect(mocks.captureSentryException).toHaveBeenCalled()
    expect(warningSpy).toHaveBeenCalledWith(
      'Refresh token exchange failed',
      expect.any(Error)
    )

    warningSpy.mockRestore()
    unmount()
  })

  it('returns the original GraphQL response when refresh does not produce a new token', async () => {
    const accessToken = createJwt({
      sub: 'user-1',
      exp: Math.floor(Date.now() / 1000) + 3600
    })
    const unauthenticatedResponse = createJsonResponse(
      {
        errors: [{ message: 'Authentication required' }]
      },
      { status: 401 }
    )
    const { module, mocks } = await loadAppProvidersModule({
      accessToken,
      refreshToken: 'refresh-token-1',
      fetchResponses: [
        unauthenticatedResponse,
        createJsonResponse({
          access_token: accessToken,
          refresh_token: 'refresh-token-1'
        })
      ]
    })
    const { unmount } = renderAppProviders(module)

    await waitForExpectation(() => {
      expect(mocks.graphqlFetch()).toBeTypeOf('function')
    })

    let response: Response | undefined
    await act(async () => {
      response = await mocks.graphqlFetch()?.('https://api.mereb.app/graphql')
      await flushMicrotasks()
    })

    expect(response).toBe(unauthenticatedResponse)
    expect(mocks.fetchMock).toHaveBeenCalledTimes(2)

    unmount()
  })

  it('refreshes the session when the app returns to the foreground with an expiring token', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-14T12:00:00.000Z'))

    const accessToken = createJwt({
      sub: 'user-1',
      exp: Math.floor(Date.now() / 1000) + 240
    })
    const refreshedToken = createJwt({
      sub: 'user-1',
      exp: Math.floor(Date.now() / 1000) + 7200
    })
    const { module } = await loadAppProvidersModule({
      accessToken,
      refreshToken: 'refresh-token-1',
      fetchResponses: [
        createJsonResponse({
          access_token: refreshedToken,
          refresh_token: 'refresh-token-2'
        })
      ]
    })
    const { result, unmount } = renderAppProviders(module)

    await act(async () => {
      await flushMicrotasks(10)
    })

    expect(result.current.token).toBe(accessToken)

    const nativeTestState = getNativeTestState()

    await act(async () => {
      vi.setSystemTime(new Date('2026-04-14T12:02:10.000Z'))
      nativeTestState.appStateListeners.forEach((listener) => listener('active'))
      await flushMicrotasks(10)
    })

    await waitForExpectation(() => {
      expect(result.current.token).toBe(refreshedToken)
    })

    unmount()
  })

  it('skips interactive login when the auth prompt does not return a code', async () => {
    const { module, mocks } = await loadAppProvidersModule({
      authPromptResult: {
        type: 'dismiss'
      }
    })
    const { result, unmount } = renderAppProviders(module)

    await waitForExpectation(() => {
      expect(result.current.isReady).toBe(true)
    })

    await act(async () => {
      await result.current.login()
      await flushMicrotasks()
    })

    expect(mocks.fetchMock).not.toHaveBeenCalled()
    expect(result.current.isAuthenticated).toBe(false)

    unmount()
  })

  it('captures interactive auth failures and preserves the logged-out state', async () => {
    const warningSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { module, mocks } = await loadAppProvidersModule({
      fetchResponses: [
        createJsonResponse(
          {
            error: 'server_error',
            error_description: 'Token exchange exploded'
          },
          { status: 500 }
        )
      ]
    })
    const { result, unmount } = renderAppProviders(module)

    await waitForExpectation(() => {
      expect(result.current.isReady).toBe(true)
    })

    await act(async () => {
      await result.current.login()
      await flushMicrotasks()
    })

    expect(result.current.isAuthenticated).toBe(false)
    expect(mocks.captureSentryException).toHaveBeenCalled()
    expect(warningSpy).toHaveBeenCalledWith('Token exchange failed', expect.any(Error))

    warningSpy.mockRestore()
    unmount()
  })

  it('warns but still clears auth state when push-device cleanup fails during logout', async () => {
    const accessToken = createJwt({
      sub: 'user-1',
      exp: Math.floor(Date.now() / 1000) + 3600
    })
    const warningSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { module, mocks } = await loadAppProvidersModule({
      accessToken,
      notificationsUnregisterError: new Error('cleanup failed')
    })
    const { result, unmount } = renderAppProviders(module)

    await waitForExpectation(() => {
      expect(result.current.isAuthenticated).toBe(true)
    })

    await act(async () => {
      await result.current.logout()
      await flushMicrotasks()
    })

    await waitForExpectation(() => {
      expect(result.current.isAuthenticated).toBe(false)
    })

    expect(warningSpy).toHaveBeenCalledWith(
      'Failed to unregister push device during logout',
      expect.any(Error)
    )
    expect(mocks.deleteItemAsync).toHaveBeenCalledWith('access_token')
    expect(mocks.deleteItemAsync).toHaveBeenCalledWith('refresh_token')

    warningSpy.mockRestore()
    unmount()
  })
})
