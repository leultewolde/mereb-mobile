import {
  ApolloClient,
  HttpLink,
  InMemoryCache
} from '@apollo/client'
import { ApolloProvider } from '@apollo/client/react'
import { AsyncStorageWrapper, persistCache } from 'apollo3-cache-persist'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as AuthSession from 'expo-auth-session'
import { fetch as expoFetch } from 'expo/fetch'
import * as SecureStore from 'expo-secure-store'
import { AppState } from 'react-native'
import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { config } from '@mobile/config'
import {
  addSentryBreadcrumb,
  captureSentryException,
  countSentryMetric,
  distributionSentryMetric,
  gaugeSentryMetric,
  logSentryError,
  logSentryInfo,
  logSentryWarn,
  setSentryUser
} from '../monitoring/sentry'
import { FlagsProvider } from './Flags'
import {
  NotificationsProvider,
  type NotificationControlsHandle
} from './Notifications'
import {
  getSecureStoreItemSafe,
  setSecureStoreToken
} from './secureStore'
import {isAuthenticationErrorMessage} from "@mobile/helpers";

type AdminAccessLevel = 'full' | 'limited' | 'none'

type TokenPayload = {
  sub?: string
  exp?: number
  name?: string
  email?: string
  preferred_username?: string
  realm_access?: { roles?: string[] }
  resource_access?: Record<string, { roles?: string[] }>
}

type AuthProfile = {
  id: string
  username?: string
  name?: string
  email?: string
  roles: string[]
  adminAccess: AdminAccessLevel
}

type AuthContextValue = {
  isReady: boolean
  isAuthenticated: boolean
  isAuthConfigured: boolean
  missingConfigKeys: string[]
  token?: string
  profile?: AuthProfile
  login: () => Promise<void>
  register: () => Promise<void>
  logout: () => Promise<void>
  refreshSession: (
      reason?: string,
      force?: boolean
  ) => Promise<string | undefined>
  hasRole: (role: string) => boolean
  hasAnyRole: (roles: string[]) => boolean
}

const FULL_ADMIN_ROLES = new Set(['admin', 'mereb.admin', 'realm-admin'])
const LIMITED_ADMIN_ROLES = new Set(['moderator', 'support', 'admin.viewer', 'mereb.staff'])
const ACCESS_TOKEN_STORAGE_KEY = 'access_token'
const REFRESH_TOKEN_STORAGE_KEY = 'refresh_token'
const ACCESS_TOKEN_EXPIRY_BUFFER_MS = 2 * 60 * 1000
const ACCESS_TOKEN_REFRESH_FLOOR_MS = 5 * 1000
const APOLLO_STORE_SYNC_RETRY_MS = 250
const APOLLO_STORE_SYNC_MAX_RETRIES = 8

type TokenExchangePayload = {
  access_token?: string
  refresh_token?: string
  error?: string
  error_description?: string
}

type TokenExchangeError = Error & {
  code?: string
  status?: number
}

type ApolloCacheDiffOptions = Parameters<InMemoryCache['diff']>[0]

function resolveFetchHeaders(headers: HeadersInit | undefined): Record<string, string> {
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries())
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers)
  }
  return { ...headers }
}

function decodeBase64Url(segment: string): string {
  let output = segment.replaceAll('-', '+').replaceAll('_', '/')
  const pad = output.length % 4
  if (pad) {
    output += '='.repeat(4 - pad)
  }
  if (typeof globalThis.atob === 'function') {
    return globalThis.atob(output)
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(output, 'base64').toString('binary')
  }
  throw new Error('No base64 decoder available')
}

function normalizeJwtDecodedPayload(decoded: string): string {
  return decodeURIComponent(
      decoded
          .split('')
          .map((char) => `%${(char.codePointAt(0) ?? 0).toString(16).padStart(2, '0')}`)
          .join('')
  )
}

function parseJwt(token?: string): TokenPayload | undefined {
  if (!token) return undefined
  const parts = token.split('.')
  if (parts.length < 2) return undefined
  try {
    const decoded = decodeBase64Url(parts[1])
    try {
      const normalized = normalizeJwtDecodedPayload(decoded)
      return JSON.parse(normalized) as TokenPayload
    } catch {
      return JSON.parse(decoded) as TokenPayload
    }
  } catch (error) {
    logSentryWarn('Failed to parse JWT payload', {
      token_length: token.length,
      error_message: error instanceof Error ? error.message : String(error)
    })
    console.warn('Failed to parse JWT payload', error)
    return undefined
  }
}

function isAccessTokenUsable(token?: string): boolean {
  const payload = parseJwt(token)
  const expiresAt = typeof payload?.exp === 'number' ? payload.exp : undefined

  if (!expiresAt) {
    return false
  }

  return expiresAt * 1000 > Date.now() + 30_000
}

function getAccessTokenExpiryMs(token?: string): number | undefined {
  const payload = parseJwt(token)
  return typeof payload?.exp === 'number' ? payload.exp * 1000 : undefined
}

function isAccessTokenExpiringSoon(
    token?: string,
    bufferMs: number = ACCESS_TOKEN_EXPIRY_BUFFER_MS
): boolean {
  const expiresAt = getAccessTokenExpiryMs(token)
  if (!expiresAt) {
    return true
  }

  return expiresAt <= Date.now() + bufferMs
}

function extractRoles(token: TokenPayload | undefined): string[] {
  if (!token) return []
  const realmRoles = token.realm_access?.roles ?? []
  const resourceRoles = Object.values(token.resource_access ?? {}).flatMap((access) => access.roles ?? [])
  return Array.from(new Set([...realmRoles, ...resourceRoles]))
}

function determineAdminAccess(roles: string[]): AdminAccessLevel {
  if (roles.some((role) => FULL_ADMIN_ROLES.has(role))) return 'full'
  if (roles.some((role) => LIMITED_ADMIN_ROLES.has(role))) return 'limited'
  return 'none'
}

function buildProfile(token?: string): AuthProfile | undefined {
  const payload = parseJwt(token)
  if (!payload?.sub) return undefined
  const roles = extractRoles(payload)
  return {
    id: payload.sub,
    username: payload.preferred_username,
    name: payload.name,
    email: payload.email,
    roles,
    adminAccess: determineAdminAccess(roles)
  }
}


function patchApolloCacheDiff(cache: InMemoryCache) {
  // Apollo Client 3.14 removed support for `canonizeResults`.
  // Some libraries still pass it to `cache.diff`, which now prints a warning.
  // Strip the deprecated option so we can upgrade without noisy warnings.
  const originalDiff = cache.diff.bind(cache)
  let canonizeWarningLogged = false

  cache.diff = ((options) => {
    if (options && 'canonizeResults' in options) {
      const shouldWarn = Boolean((options as unknown as Record<string, unknown>).canonizeResults)
      if (__DEV__ && shouldWarn && !canonizeWarningLogged) {
        canonizeWarningLogged = true
        console.warn('Removed deprecated Apollo `canonizeResults` option from `cache.diff` call.')
      }
      const sanitized: ApolloCacheDiffOptions = { ...options }
      delete (sanitized as unknown as Record<string, unknown>).canonizeResults
      return originalDiff(sanitized)
    }
    return originalDiff(options)
  }) as typeof cache.diff
}

function buildIssuerUrl() {
  const baseUrl = config.keycloak.url.trim()
  const realm = config.keycloak.realm.trim()
  if (!isHttpUrl(baseUrl) || !realm) {
    return undefined
  }

  return `${baseUrl.replace(/\/$/, '')}/realms/${realm}`
}

function buildRedirectUri() {
  return AuthSession.makeRedirectUri({
    scheme: config.appScheme,
    path: 'oauth2redirect/keycloak'
  })
}

function isHttpUrl(url: string | undefined): boolean {
  if (!url) {
    return false
  }

  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function buildTokenExchangeError(
    label: string,
    status: number,
    payload: TokenExchangePayload
): TokenExchangeError {
  const message =
      payload.error_description?.trim() ||
      payload.error?.trim() ||
      `${label} failed (${status})`
  const error = new Error(message) as TokenExchangeError
  error.code = payload.error
  error.status = status
  return error
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.trim().toLowerCase()
  }

  if (typeof error === 'string') {
    return error.trim().toLowerCase()
  }

  return ''
}

async function getStoredToken(
    key: string,
    context: 'bootstrap' | 'refresh'
): Promise<string | null> {
  return getSecureStoreItemSafe(key, (error) => {
    countSentryMetric('auth_secure_store_read_blocked', 1, {
      unit: 'attempt',
      attributes: {
        storage_key: key,
        context
      }
    })
    logSentryWarn('Secure store read blocked by keychain interaction policy', {
      storage_key: key,
      context,
      error_message: error instanceof Error ? error.message : String(error)
    })
  })
}

async function setStoredToken(key: string, value: string): Promise<void> {
  await setSecureStoreToken(key, value)
}

function isInvalidGrantError(error: unknown): boolean {
  const message = extractErrorMessage(error)

  return (
      (typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          (error as { code?: string }).code === 'invalid_grant') ||
      message === 'invalid refresh token' ||
      message.includes('invalid_grant') ||
      message.includes('token is not active')
  )
}

function isApolloStoreResetInFlightError(error: unknown): boolean {
  const message = extractErrorMessage(error)
  return (
      message.includes('store reset while query was in flight') ||
      message.includes('not completed in link chain')
  )
}


function getAuthAction(extraParams?: Record<string, string>): 'login' | 'register' {
  return extraParams?.kc_action === 'register' ? 'register' : 'login'
}

function getErrorCode(error: unknown): string | undefined {
  if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof (error as { code?: unknown }).code === 'string'
  ) {
    return (error as { code?: string }).code
  }

  return undefined
}

function getErrorStatus(error: unknown): number | undefined {
  if (
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      typeof (error as { status?: unknown }).status === 'number'
  ) {
    return (error as { status?: number }).status
  }

  return undefined
}

function canUseCurrentToken(token?: string): boolean {
  return Boolean(
      token && isAccessTokenUsable(token) && !isAccessTokenExpiringSoon(token)
  )
}

function getCurrentTokenFallback(token?: string): string | undefined {
  return token && isAccessTokenUsable(token) ? token : undefined
}

function isAuthSuccessResult(
    result: { type: string; params?: Record<string, string> }
): result is { type: 'success'; params: { code: string } } {
  return result.type === 'success' && Boolean(result.params?.code)
}

async function responseHasAuthenticationFailure(response: Response): Promise<boolean> {
  if (response.status === 401 || response.status === 403) {
    return true
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.includes('json')) {
    return false
  }

  try {
    const payload = (await response.clone().json()) as {
      errors?: { message?: string }[]
    }

    return (payload.errors ?? []).some((error) =>
        isAuthenticationErrorMessage(error.message)
    )
  } catch {
    return false
  }
}

async function exchangeTokens(
    discovery: AuthSession.DiscoveryDocument,
    parameters: Record<string, string>,
    label: string
): Promise<TokenExchangePayload> {
  if (!discovery.tokenEndpoint) {
    throw new Error(`Keycloak token endpoint missing for ${label}`)
  }

  const response = await fetch(discovery.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(parameters).toString()
  })

  const payload = (await response.json().catch(() => ({}))) as TokenExchangePayload
  if (!response.ok) {
    throw buildTokenExchangeError(label, response.status, payload)
  }

  return payload
}

const AuthContext = createContext<AuthContextValue>({
  isReady: false,
  isAuthenticated: false,
  isAuthConfigured: false,
  missingConfigKeys: [],
  token: undefined,
  profile: undefined,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  refreshSession: async () => undefined,
  hasRole: () => false,
  hasAnyRole: () => false
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AppProviders({ children }: Readonly<PropsWithChildren>) {
  const [token, setToken] = useState<string>()
  const tokenRef = useRef<string | undefined>(undefined)
  tokenRef.current = token
  const lastAuthScopeRef = useRef<string | null | undefined>(undefined)
  const notificationControlsRef = useRef<NotificationControlsHandle | null>(null)
  const refreshPromiseRef = useRef<Promise<string | undefined> | null>(null)
  const inFlightGraphqlRequestsRef = useRef(0)
  const pendingApolloStoreSyncScopeRef = useRef<string | null | undefined>(undefined)
  const pendingApolloStoreSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingApolloStoreSyncRetryCountRef = useRef(0)
  const apolloClientRef = useRef<ApolloClient | undefined>(undefined)
  const readyRef = useRef(false)

  const [profile, setProfile] = useState<AuthProfile>()
  const [apolloClient, setApolloClient] = useState<ApolloClient>()
  const [ready, setReady] = useState(false)
  apolloClientRef.current = apolloClient
  readyRef.current = ready
  const authScope = useMemo(() => {
    if (!token) {
      return null
    }

    return parseJwt(token)?.sub ?? '__authenticated__'
  }, [token])
  const missingConfigKeys = useMemo(() => {
    const keys: string[] = []
    const keycloakUrl = config.keycloak.url.trim()
    if (!keycloakUrl) {
      keys.push('KEYCLOAK_URL')
    } else if (!isHttpUrl(keycloakUrl)) {
      keys.push('KEYCLOAK_URL_HTTP_REQUIRED')
    }
    if (!config.keycloak.realm.trim()) {
      keys.push('KC_REALM')
    }
    if (!config.keycloak.clientId.trim()) {
      keys.push('KC_CLIENT_ID')
    }
    return keys
  }, [])
  const isAuthConfigured = missingConfigKeys.length === 0

  const setCurrentToken = useCallback((nextToken?: string) => {
    tokenRef.current = nextToken
    setToken(nextToken)
  }, [])

  const clearStoredSession = useCallback(async () => {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_STORAGE_KEY)
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_STORAGE_KEY)
    setCurrentToken()
    setProfile(undefined)
  }, [setCurrentToken])

  const persistRefreshPayload = useCallback(
      async (payload: TokenExchangePayload): Promise<string | undefined> => {
        if (payload.access_token) {
          await setStoredToken(ACCESS_TOKEN_STORAGE_KEY, payload.access_token)
          setCurrentToken(payload.access_token)
        } else {
          await SecureStore.deleteItemAsync(ACCESS_TOKEN_STORAGE_KEY)
          setCurrentToken()
        }

        if (payload.refresh_token) {
          await setStoredToken(REFRESH_TOKEN_STORAGE_KEY, payload.refresh_token)
        }

        return payload.access_token
      },
      [setCurrentToken]
  )

  const recordRefreshSuccess = useCallback(
      (
          payload: TokenExchangePayload,
          reason: string,
          force: boolean,
          refreshStartedAt: number
      ) => {
        addSentryBreadcrumb({
          category: 'auth',
          message: 'Session refreshed',
          data: { reason }
        })
        countSentryMetric('auth_refresh_success', 1, {
          unit: 'attempt',
          attributes: { reason, forced: force }
        })
        distributionSentryMetric(
            'auth_refresh_duration',
            Date.now() - refreshStartedAt,
            {
              unit: 'millisecond',
              attributes: { reason, forced: force }
            }
        )

        const accessTokenTtlMs = getAccessTokenExpiryMs(payload.access_token)
        if (accessTokenTtlMs) {
          gaugeSentryMetric(
              'auth_access_token_ttl',
              Math.max(0, accessTokenTtlMs - Date.now()),
              {
                unit: 'millisecond',
                attributes: { reason }
              }
          )
        }
      },
      []
  )

  const refreshWithStoredToken = useCallback(
      async (storedRefresh: string): Promise<TokenExchangePayload> => {
        const issuerUrl = buildIssuerUrl()
        if (!issuerUrl) {
          throw new Error('Keycloak issuer URL missing or invalid for refresh token exchange')
        }

        const discovery = await AuthSession.fetchDiscoveryAsync(issuerUrl)
        return exchangeTokens(
            discovery,
            {
              grant_type: 'refresh_token',
              client_id: config.keycloak.clientId,
              refresh_token: storedRefresh
            },
            'Refresh token exchange'
        )
      },
      []
  )

  const handleInvalidRefreshGrant = useCallback(
      async (error: unknown, reason: string, force: boolean) => {
        countSentryMetric('auth_refresh_failure', 1, {
          unit: 'attempt',
          attributes: {
            reason,
            forced: force,
            outcome: 'invalid_grant'
          }
        })
        logSentryWarn('Auth refresh token rejected', {
          reason,
          error_code: getErrorCode(error),
          status: getErrorStatus(error)
        })
        addSentryBreadcrumb({
          category: 'auth',
          message: 'Refresh token rejected',
          data: { reason },
          level: 'warning'
        })
        await clearStoredSession()
      },
      [clearStoredSession]
  )

  const handleRefreshFailure = useCallback(
      (error: unknown, reason: string, force: boolean, currentToken?: string) => {
        const fallbackToken = getCurrentTokenFallback(currentToken)

        console.warn('Refresh token exchange failed', error)
        countSentryMetric('auth_refresh_failure', 1, {
          unit: 'attempt',
          attributes: {
            reason,
            forced: force,
            outcome: 'error',
            fallback_to_current_token: Boolean(fallbackToken)
          }
        })
        logSentryError('Auth session refresh failed', {
          reason,
          has_current_token: Boolean(currentToken),
          current_token_usable: Boolean(fallbackToken),
          error_message: error instanceof Error ? error.message : String(error)
        })
        addSentryBreadcrumb({
          category: 'auth',
          message: 'Session refresh failed',
          data: {
            reason,
            message: error instanceof Error ? error.message : String(error)
          },
          level: 'error'
        })
        captureSentryException(error)

        return fallbackToken
      },
      []
  )

  const refreshSessionNow = useCallback(
      async (reason: string, force = false): Promise<string | undefined> => {
        const refreshStartedAt = Date.now()
        const currentToken = tokenRef.current

        if (!isAuthConfigured) {
          return currentToken
        }

        if (!force && canUseCurrentToken(currentToken)) {
          return currentToken
        }

        const storedRefresh = await getStoredToken(REFRESH_TOKEN_STORAGE_KEY, 'refresh')
        if (!storedRefresh) {
          const fallbackToken = getCurrentTokenFallback(currentToken)
          if (!fallbackToken) {
            setCurrentToken()
          }
          return fallbackToken
        }

        addSentryBreadcrumb({
          category: 'auth',
          message: 'Refreshing session',
          data: { reason }
        })
        countSentryMetric('auth_refresh_attempt', 1, {
          unit: 'attempt',
          attributes: { reason, forced: force }
        })

        try {
          const payload = await refreshWithStoredToken(storedRefresh)
          const accessToken = await persistRefreshPayload(payload)
          recordRefreshSuccess(payload, reason, force, refreshStartedAt)
          return accessToken
        } catch (error) {
          if (isInvalidGrantError(error)) {
            await handleInvalidRefreshGrant(error, reason, force)
            return undefined
          }

          return handleRefreshFailure(error, reason, force, currentToken)
        }
      },
      [
        handleInvalidRefreshGrant,
        handleRefreshFailure,
        isAuthConfigured,
        persistRefreshPayload,
        recordRefreshSuccess,
        refreshWithStoredToken,
        setCurrentToken
      ]
  )

  const refreshSession = useCallback(
      (reason?: string, force = false): Promise<string | undefined> => {
        if (refreshPromiseRef.current) {
          return refreshPromiseRef.current
        }

        const promise = refreshSessionNow(reason ?? 'unspecified', force).finally(() => {
          if (refreshPromiseRef.current === promise) {
            refreshPromiseRef.current = null
          }
        })

        refreshPromiseRef.current = promise
        return promise
      },
      [refreshSessionNow]
  )

  const flushPendingApolloStoreSync = useCallback(() => {
    if (!readyRef.current) {
      return
    }

    const client = apolloClientRef.current
    if (!client) {
      return
    }

    if (inFlightGraphqlRequestsRef.current > 0) {
      return
    }

    const pendingScope = pendingApolloStoreSyncScopeRef.current
    if (pendingScope === undefined) {
      pendingApolloStoreSyncRetryCountRef.current = 0
      return
    }

    pendingApolloStoreSyncScopeRef.current = undefined

    const syncStore = pendingScope ? client.resetStore() : client.clearStore()
    void syncStore
        .then(() => {
          pendingApolloStoreSyncRetryCountRef.current = 0
        })
        .catch((error) => {
          if (isApolloStoreResetInFlightError(error)) {
            const nextRetryCount = pendingApolloStoreSyncRetryCountRef.current + 1
            pendingApolloStoreSyncRetryCountRef.current = nextRetryCount
            if (nextRetryCount === 1) {
              logSentryInfo('Deferred Apollo cache sync while query was in flight', {
                is_authenticated: Boolean(pendingScope),
                error_message: error instanceof Error ? error.message : String(error)
              })
            }
            if (nextRetryCount >= APOLLO_STORE_SYNC_MAX_RETRIES) {
              pendingApolloStoreSyncRetryCountRef.current = 0
              logSentryWarn('Skipped Apollo cache sync after repeated in-flight conflicts', {
                is_authenticated: Boolean(pendingScope),
                error_message: error instanceof Error ? error.message : String(error),
                retry_count: nextRetryCount
              })
              return
            }

            pendingApolloStoreSyncScopeRef.current = pendingScope
            pendingApolloStoreSyncTimerRef.current ??= setTimeout(() => {
              pendingApolloStoreSyncTimerRef.current = null
              flushPendingApolloStoreSync()
            }, APOLLO_STORE_SYNC_RETRY_MS);
            return
          }

          pendingApolloStoreSyncRetryCountRef.current = 0
          console.warn('Failed to synchronize Apollo cache after auth change', error)
          logSentryWarn('Apollo cache synchronization failed after auth change', {
            is_authenticated: Boolean(pendingScope),
            error_message: error instanceof Error ? error.message : String(error)
          })
        })
  }, [])

  const resolveRequestToken = useCallback(async (): Promise<string | undefined> => {
    const currentToken = tokenRef.current

    if (
        currentToken &&
        isAccessTokenUsable(currentToken) &&
        !isAccessTokenExpiringSoon(currentToken)
    ) {
      return currentToken
    }

    return refreshSession('graphql-preflight', true)
  }, [refreshSession])

  const graphqlFetch = useCallback(
      async (uri: RequestInfo | URL, options: RequestInit = {}) => {
        const requestUrl = typeof uri === 'string' ? uri : uri.toString()
        const executeFetch = async (
            requestOptions: RequestInit
        ): Promise<Response> => {
          inFlightGraphqlRequestsRef.current += 1
          try {
            return (await expoFetch(requestUrl, requestOptions as Parameters<typeof expoFetch>[1])) as unknown as Response
          } finally {
            inFlightGraphqlRequestsRef.current = Math.max(
                0,
                inFlightGraphqlRequestsRef.current - 1
            )
            if (inFlightGraphqlRequestsRef.current === 0) {
              flushPendingApolloStoreSync()
            }
          }
        }

        const requestToken = await resolveRequestToken()
        const initialHeaders = resolveFetchHeaders(options.headers)

        if (requestToken) {
          initialHeaders.Authorization = `Bearer ${requestToken}`
        }

        const response = await executeFetch({
          ...options,
          headers: initialHeaders
        })

        const shouldRetry =
            Boolean(requestToken) && (await responseHasAuthenticationFailure(response))

        if (!shouldRetry) {
          return response
        }

        const refreshedToken = await refreshSession('graphql-auth-retry', true)
        if (!refreshedToken || refreshedToken === requestToken) {
          return response
        }

        addSentryBreadcrumb({
          category: 'auth',
          message: 'Retrying GraphQL request with refreshed token'
        })
        logSentryInfo('Retrying GraphQL request after auth refresh')
        countSentryMetric('graphql_auth_retry', 1, {
          unit: 'attempt',
          attributes: {
            reason: 'graphql-auth-retry'
          }
        })

        return executeFetch({
          ...options,
          headers: {
            ...resolveFetchHeaders(options.headers),
            Authorization: `Bearer ${refreshedToken}`
          }
        })
      },
      [flushPendingApolloStoreSync, refreshSession, resolveRequestToken]
  )

  useEffect(() => {
    setProfile(buildProfile(token))
  }, [token])

  useEffect(() => {
    setSentryUser(
        profile
            ? {
              id: profile.id,
              username: profile.username,
              email: profile.email
            }
            : null
    )
  }, [profile])

  useEffect(() => {
    if (!apolloClient || !ready) {
      return
    }

    const previousScope = lastAuthScopeRef.current
    lastAuthScopeRef.current = authScope

    if (previousScope === undefined || previousScope === authScope) {
      return
    }

    pendingApolloStoreSyncScopeRef.current = authScope
    pendingApolloStoreSyncRetryCountRef.current = 0
    flushPendingApolloStoreSync()
  }, [apolloClient, authScope, flushPendingApolloStoreSync, ready])

  useEffect(() => {
    return () => {
      if (pendingApolloStoreSyncTimerRef.current) {
        clearTimeout(pendingApolloStoreSyncTimerRef.current)
        pendingApolloStoreSyncTimerRef.current = null
      }
      pendingApolloStoreSyncRetryCountRef.current = 0
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const initializeApolloClient = async () => {
      const cache = new InMemoryCache()

      patchApolloCacheDiff(cache)
      await persistCache({
        cache,
        storage: new AsyncStorageWrapper(AsyncStorage)
      })

      return new ApolloClient({
        link: new HttpLink({
          uri: config.graphqlUrl,
          fetch: graphqlFetch,
          headers: {
            'apollographql-client-name': 'mereb-mobile',
            'apollographql-client-version': config.appVersion ?? 'unknown'
          }
        }),
        cache
      })
    }

    const hydrateSession = async () => {
      const storedAccess = await getStoredToken(ACCESS_TOKEN_STORAGE_KEY, 'bootstrap')
      if (cancelled) {
        return
      }

      if (storedAccess && isAccessTokenUsable(storedAccess)) {
        setCurrentToken(storedAccess)
      }

      if (!storedAccess || isAccessTokenExpiringSoon(storedAccess)) {
        await refreshSession('bootstrap', true)
      }
    }

    const bootstrap = async () => {
      try {
        const client = await initializeApolloClient()
        if (cancelled) {
          return
        }

        setApolloClient(client)
        await hydrateSession()
      } catch (error) {
        console.error('Failed to initialise Apollo client', error)
        countSentryMetric('apollo_bootstrap_failure', 1, {
          unit: 'attempt'
        })
        logSentryError('Apollo client bootstrap failed', {
          error_message: error instanceof Error ? error.message : String(error)
        })
        captureSentryException(error)
      } finally {
        if (!cancelled) {
          setReady(true)
        }
      }
    }

    void bootstrap()

    return () => {
      cancelled = true
    }
  }, [graphqlFetch, refreshSession, setCurrentToken])

  useEffect(() => {
    if (!token) {
      return
    }

    const expiresAt = getAccessTokenExpiryMs(token)
    if (!expiresAt) {
      return
    }

    const delay = Math.max(
        expiresAt - Date.now() - ACCESS_TOKEN_EXPIRY_BUFFER_MS,
        ACCESS_TOKEN_REFRESH_FLOOR_MS
    )

    const timeout = setTimeout(() => {
      void refreshSession('scheduled', true)
    }, delay)

    return () => {
      clearTimeout(timeout)
    }
  }, [refreshSession, token])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        return
      }

      const currentToken = tokenRef.current
      if (!currentToken || isAccessTokenExpiringSoon(currentToken)) {
        void refreshSession('foreground', true)
      }
    })

    return () => {
      subscription.remove()
    }
  }, [refreshSession])

  const persistInteractiveAuthPayload = useCallback(
      async (payload: TokenExchangePayload) => {
        if (payload.access_token) {
          await setStoredToken(ACCESS_TOKEN_STORAGE_KEY, payload.access_token)
          setCurrentToken(payload.access_token)
        } else {
          await SecureStore.deleteItemAsync(ACCESS_TOKEN_STORAGE_KEY)
          setCurrentToken()
        }

        if (payload.refresh_token) {
          await setStoredToken(REFRESH_TOKEN_STORAGE_KEY, payload.refresh_token)
        } else {
          await SecureStore.deleteItemAsync(REFRESH_TOKEN_STORAGE_KEY)
        }
      },
      [setCurrentToken]
  )

  const validateInteractiveAuthConfig = useCallback(
      (clientId: string): boolean => {
        if (clientId && isAuthConfigured) {
          return true
        }

        logSentryWarn('Interactive auth attempted with incomplete Keycloak config', {
          missing_client_id: !clientId,
          missing_config_keys: missingConfigKeys.join(','),
          missing_config_keys_count: missingConfigKeys.length
        })
        console.warn('Keycloak configuration is incomplete.')
        return false
      },
      [isAuthConfigured, missingConfigKeys]
  )

  const startInteractiveAuth = useCallback(
      async (
          clientId: string,
          extraParams?: Record<string, string>
      ): Promise<TokenExchangePayload | undefined> => {
        const issuerUrl = buildIssuerUrl()
        if (!issuerUrl) {
          throw new Error('Keycloak issuer URL missing or invalid for interactive auth')
        }

        const discovery = await AuthSession.fetchDiscoveryAsync(issuerUrl)
        if (!isHttpUrl(discovery.authorizationEndpoint)) {
          throw new Error('Keycloak authorization endpoint missing or invalid for interactive auth')
        }

        const redirectUri = buildRedirectUri()
        const authRequest = new AuthSession.AuthRequest({
          clientId,
          redirectUri,
          responseType: AuthSession.ResponseType.Code,
          usePKCE: true,
          extraParams
        })

        const result = await authRequest.promptAsync(discovery)
        if (!isAuthSuccessResult(result)) {
          return undefined
        }

        return exchangeTokens(
            discovery,
            {
              grant_type: 'authorization_code',
              client_id: clientId,
              code: result.params.code,
              redirect_uri: redirectUri,
              code_verifier: authRequest.codeVerifier ?? ''
            },
            'Authorization code exchange'
        )
      },
      []
  )

  const recordInteractiveAuthSuccess = useCallback(
      (
          payload: TokenExchangePayload,
          action: 'login' | 'register',
          authStartedAt: number
      ) => {
        addSentryBreadcrumb({
          category: 'auth',
          message: 'Interactive login completed'
        })
        countSentryMetric('auth_interactive_success', 1, {
          unit: 'attempt',
          attributes: { action }
        })
        distributionSentryMetric(
            'auth_interactive_duration',
            Date.now() - authStartedAt,
            {
              unit: 'millisecond',
              attributes: { action }
            }
        )
        logSentryInfo('Interactive auth flow completed', {
          action,
          user_id: payload.access_token
              ? buildProfile(payload.access_token)?.id
              : undefined
        })
      },
      []
  )

  const recordInteractiveAuthFailure = useCallback(
      (error: unknown, action: 'login' | 'register') => {
        console.warn('Interactive auth failed', error)
        countSentryMetric('auth_interactive_failure', 1, {
          unit: 'attempt',
          attributes: { action }
        })
        logSentryError('Interactive auth flow failed', {
          action,
          error_message: error instanceof Error ? error.message : String(error)
        })
        captureSentryException(error)
      },
      []
  )

  const performAuth = useCallback(
      async (extraParams?: Record<string, string>) => {
        const authStartedAt = Date.now()
        const { clientId } = config.keycloak
        const action = getAuthAction(extraParams)

        if (!validateInteractiveAuthConfig(clientId)) {
          return
        }

        try {
          const payload = await startInteractiveAuth(clientId, extraParams)
          if (!payload) {
            return
          }

          await persistInteractiveAuthPayload(payload)
          recordInteractiveAuthSuccess(payload, action, authStartedAt)
        } catch (error) {
          recordInteractiveAuthFailure(error, action)
        }
      },
      [
        persistInteractiveAuthPayload,
        recordInteractiveAuthFailure,
        recordInteractiveAuthSuccess,
        startInteractiveAuth,
        validateInteractiveAuthConfig
      ]
  )

  const login = useCallback(async () => {
    await performAuth()
  }, [performAuth])

  const register = useCallback(async () => {
    await performAuth({ kc_action: 'register' })
  }, [performAuth])

  const logout = useCallback(async () => {
    try {
      await notificationControlsRef.current?.unregisterCurrentDevice()
    } catch (error) {
      console.warn('Failed to unregister push device during logout', error)
      countSentryMetric('auth_logout_unregister_failure', 1, {
        unit: 'attempt'
      })
      logSentryWarn('Push device unregister failed during logout', {
        error_message: error instanceof Error ? error.message : String(error)
      })
    }

    await clearStoredSession()
  }, [clearStoredSession])

  const isAuthenticated = Boolean(token)

  const roleSet = useMemo(() => new Set(profile?.roles ?? []), [profile])

  const value = useMemo<AuthContextValue>(
      () => ({
        isReady: ready,
        isAuthenticated,
        isAuthConfigured,
        missingConfigKeys,
        token,
        profile,
        login,
        register,
        logout,
        refreshSession,
        hasRole: (role: string) => roleSet.has(role),
        hasAnyRole: (roles: string[]) => roles.some((role) => roleSet.has(role))
      }),
      [ready, isAuthenticated, isAuthConfigured, missingConfigKeys, token, profile, login, register, logout, refreshSession, roleSet]
  )

  if (!ready || !apolloClient) {
    return null
  }

  return (
      <AuthContext.Provider value={value}>
        <ApolloProvider client={apolloClient}>
          <FlagsProvider token={token}>
            <NotificationsProvider
                authToken={token}
                userId={profile?.id}
                isAuthenticated={isAuthenticated}
                controlsRef={notificationControlsRef}
            >
              {children}
            </NotificationsProvider>
          </FlagsProvider>
        </ApolloProvider>
      </AuthContext.Provider>
  )
}
