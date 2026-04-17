import React from 'react'
import { renderHook } from '@testing-library/react-native/pure'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createJsonResponse,
  settle,
  waitForExpectation
} from '../test/react-test-utils'

vi.mock('../monitoring/sentry', () => ({
  logSentryWarn: vi.fn()
}))

type LoadedFlagsModule = typeof import('./Flags')
type FetchMockImpl = (
  input?: RequestInfo | URL,
  init?: RequestInit
) => Promise<unknown>

async function loadFlagsModule(options?: {
  flagsUrl?: string
  stage?: 'local' | 'dev' | 'stg' | 'prd'
  fetchImpl?: FetchMockImpl
}) {
  vi.resetModules()

  const fetchMock = vi.fn(
    options?.fetchImpl ??
      (async () => createJsonResponse({}))
  )

  globalThis.fetch = fetchMock as typeof fetch

  vi.doMock('@mobile/config', () => ({
    config: {
      stage: options?.stage ?? 'prd',
      flagsUrl: options?.flagsUrl ?? 'https://api.mereb.app/flags'
    }
  }))

  const module = (await import('./Flags')) as LoadedFlagsModule

  return {
    module,
    fetchMock
  }
}

function renderFlagsProvider(
  module: LoadedFlagsModule,
  token?: string
) {
  return renderHook(() => module.useFlags(), {
    wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
      return <module.FlagsProvider token={token}>{children}</module.FlagsProvider>
    }
  })
}

afterEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.doUnmock('@mobile/config')
})

describe('FlagsProvider', () => {
  it('uses default flags when no endpoint is configured', async () => {
    const { module, fetchMock } = await loadFlagsModule({
      flagsUrl: ''
    })
    const { result, unmount } = renderFlagsProvider(module, 'token-1')

    await settle()

    expect(result.current).toMatchObject({
      flags: {
        inviteOnlyRegistration: false,
        mobileAccountCreationEnabled: false
      },
      loading: false,
      error: undefined
    })
    expect(fetchMock).not.toHaveBeenCalled()

    unmount()
  })

  it('loads flags from the configured endpoint and forwards the bearer token', async () => {
    const { module, fetchMock } = await loadFlagsModule({
      stage: 'prd',
      fetchImpl: async () =>
        createJsonResponse({
          inviteOnlyRegistration: true,
          mobileAccountCreationEnabled: true
        })
    })
    const { result, unmount } = renderFlagsProvider(module, 'token-1')

    await waitForExpectation(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.flags.inviteOnlyRegistration).toBe(true)
    })

    expect(fetchMock).toHaveBeenCalledWith('https://api.mereb.app/flags', {
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer token-1'
      },
      signal: expect.any(AbortSignal)
    })

    unmount()
  })

  it('falls back to defaults on unauthorized responses', async () => {
    const { module } = await loadFlagsModule({
      fetchImpl: async () => createJsonResponse({}, { status: 401 })
    })
    const { result, unmount } = renderFlagsProvider(module)

    await waitForExpectation(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current).toMatchObject({
      flags: {
        inviteOnlyRegistration: false,
        mobileAccountCreationEnabled: false
      },
      error: undefined
    })

    unmount()
  })

  it('reports non-auth failures and network errors', async () => {
    const { module: statusModule } = await loadFlagsModule({
      fetchImpl: async () => createJsonResponse({}, { status: 503 })
    })
    const firstRender = renderFlagsProvider(statusModule)

    await waitForExpectation(() => {
      expect(firstRender.result.current.error).toBe('Flags request failed (503)')
    })

    firstRender.unmount()

    const { module: networkModule } = await loadFlagsModule({
      fetchImpl: async () => {
        throw new Error('offline')
      }
    })
    const secondRender = renderFlagsProvider(networkModule)

    await waitForExpectation(() => {
      expect(secondRender.result.current.error).toBe(
        'Feature flags are unavailable right now.'
      )
    })

    secondRender.unmount()
  })
})
