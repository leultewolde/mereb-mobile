import {
  ApolloClient,
  HttpLink,
  InMemoryCache
} from '@apollo/client'
import { ApolloProvider } from '@apollo/client/react'
import { AsyncStorageWrapper, persistCache } from 'apollo3-cache-persist'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as AuthSession from 'expo-auth-session'
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

function isInvalidGrantError(error: unknown): boolean {
  const message = extractErrorMessage(error)

  return (
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'invalid_grant') ||
    message === 'invalid refresh token' ||
    message.includes('invalid_grant')
  )
}

function isAuthenticationErrorMessage(message?: string): boolean {
  const normalized = message?.trim().toLowerCase()
  if (!normalized) {
    return false
  }

  return (
    normalized.includes('authentication required') ||
    normalized.includes('authorization required') ||
    normalized.includes('invalid token') ||
    normalized.includes('jwt') ||
    normalized.includes('token expired')
  )
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
  const lastAuthTokenRef = useRef<string | undefined>(undefined)
  const notificationControlsRef = useRef<NotificationControlsHandle | null>(null)
  const refreshPromiseRef = useRef<Promise<string | undefined> | null>(null)

  const [profile, setProfile] = useState<AuthProfile>()
  const [apolloClient, setApolloClient] = useState<ApolloClient>()
  const [ready, setReady] = useState(false)
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
    setCurrentToken(undefined)
    setProfile(undefined)
  }, [setCurrentToken])

  const refreshSessionNow = useCallback(
    async (reason: string, force = false): Promise<string | undefined> => {
      const refreshStartedAt = Date.now()
      const currentToken = tokenRef.current

      if (!isAuthConfigured) {
        return currentToken
      }

      if (
        !force &&
        currentToken &&
        isAccessTokenUsable(currentToken) &&
        !isAccessTokenExpiringSoon(currentToken)
      ) {
        return currentToken
      }

      const storedRefresh = await SecureStore.getItemAsync(REFRESH_TOKEN_STORAGE_KEY)
      if (!storedRefresh) {
        if (!isAccessTokenUsable(currentToken)) {
          setCurrentToken(undefined)
        }
        return currentToken && isAccessTokenUsable(currentToken) ? currentToken : undefined
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
        const issuerUrl = buildIssuerUrl()
        if (!issuerUrl) {
          throw new Error('Keycloak issuer URL missing or invalid for refresh token exchange')
        }

        const discovery = await AuthSession.fetchDiscoveryAsync(issuerUrl)
        const payload = await exchangeTokens(
          discovery,
          {
            grant_type: 'refresh_token',
            client_id: config.keycloak.clientId,
            refresh_token: storedRefresh
          },
          'Refresh token exchange'
        )

        if (payload.access_token) {
          await SecureStore.setItemAsync(ACCESS_TOKEN_STORAGE_KEY, payload.access_token)
          setCurrentToken(payload.access_token)
        } else {
          await SecureStore.deleteItemAsync(ACCESS_TOKEN_STORAGE_KEY)
          setCurrentToken(undefined)
        }

        if (payload.refresh_token) {
          await SecureStore.setItemAsync(REFRESH_TOKEN_STORAGE_KEY, payload.refresh_token)
        }

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

        return payload.access_token
      } catch (error) {
        if (isInvalidGrantError(error)) {
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
            error_code:
              typeof error === 'object' &&
              error !== null &&
              'code' in error &&
              typeof (error as { code?: unknown }).code === 'string'
                ? (error as { code?: string }).code
                : undefined,
            status:
              typeof error === 'object' &&
              error !== null &&
              'status' in error &&
              typeof (error as { status?: unknown }).status === 'number'
                ? (error as { status?: number }).status
                : undefined
          })
          addSentryBreadcrumb({
            category: 'auth',
            message: 'Refresh token rejected',
            data: { reason },
            level: 'warning'
          })
          captureSentryException(error)
          await clearStoredSession()
          return undefined
        }

        console.warn('Refresh token exchange failed', error)
        countSentryMetric('auth_refresh_failure', 1, {
          unit: 'attempt',
          attributes: {
            reason,
            forced: force,
            outcome: 'error',
            fallback_to_current_token: Boolean(
              currentToken && isAccessTokenUsable(currentToken)
            )
          }
        })
        logSentryError('Auth session refresh failed', {
          reason,
          has_current_token: Boolean(currentToken),
          current_token_usable: Boolean(
            currentToken && isAccessTokenUsable(currentToken)
          ),
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

        if (currentToken && isAccessTokenUsable(currentToken)) {
          return currentToken
        }

        return undefined
      }
    },
    [clearStoredSession, isAuthConfigured, setCurrentToken]
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
      const requestToken = await resolveRequestToken()
      const initialHeaders = {
        ...options.headers,
        ...(requestToken ? { Authorization: `Bearer ${requestToken}` } : {})
      }

      const response = await fetch(uri, {
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

      return fetch(uri, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${refreshedToken}`
        }
      })
    },
    [refreshSession, resolveRequestToken]
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
    if (!apolloClient) {
      return
    }

    const previousToken = lastAuthTokenRef.current
    lastAuthTokenRef.current = token

    if (previousToken === token || (previousToken === undefined && token === undefined)) {
      return
    }

    const syncStore = token ? apolloClient.resetStore() : apolloClient.clearStore()
    void syncStore.catch((error) => {
      console.warn('Failed to synchronize Apollo cache after auth change', error)
      logSentryWarn('Apollo cache synchronization failed after auth change', {
        is_authenticated: Boolean(token),
        error_message: error instanceof Error ? error.message : String(error)
      })
    })
  }, [apolloClient, token])

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
          fetch: graphqlFetch
        }),
        cache
      })
    }

    const hydrateSession = async () => {
      const storedAccess = await SecureStore.getItemAsync(ACCESS_TOKEN_STORAGE_KEY)
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

  const performAuth = useCallback(
    async (extraParams?: Record<string, string>) => {
      const authStartedAt = Date.now()
      const { clientId } = config.keycloak
      if (!clientId || !isAuthConfigured) {
        logSentryWarn('Interactive auth attempted with incomplete Keycloak config', {
          missing_client_id: !clientId,
          missing_config_keys: missingConfigKeys.join(','),
          missing_config_keys_count: missingConfigKeys.length
        })
        console.warn('Keycloak configuration is incomplete.')
        return
      }

      try {
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
        if (result.type !== 'success' || !result.params.code) {
          return
        }

        const payload = await exchangeTokens(
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

        if (payload.access_token) {
          await SecureStore.setItemAsync(ACCESS_TOKEN_STORAGE_KEY, payload.access_token)
          setCurrentToken(payload.access_token)
        } else {
          await SecureStore.deleteItemAsync(ACCESS_TOKEN_STORAGE_KEY)
          setCurrentToken(undefined)
        }

        if (payload.refresh_token) {
          await SecureStore.setItemAsync(REFRESH_TOKEN_STORAGE_KEY, payload.refresh_token)
        } else {
          await SecureStore.deleteItemAsync(REFRESH_TOKEN_STORAGE_KEY)
        }

        addSentryBreadcrumb({
          category: 'auth',
          message: 'Interactive login completed'
        })
        countSentryMetric('auth_interactive_success', 1, {
          unit: 'attempt',
          attributes: {
            action: extraParams?.kc_action === 'register' ? 'register' : 'login'
          }
        })
        distributionSentryMetric(
          'auth_interactive_duration',
          Date.now() - authStartedAt,
          {
            unit: 'millisecond',
            attributes: {
              action:
                extraParams?.kc_action === 'register' ? 'register' : 'login'
            }
          }
        )
        logSentryInfo('Interactive auth flow completed', {
          action: extraParams?.kc_action === 'register' ? 'register' : 'login',
          user_id: payload.access_token
            ? buildProfile(payload.access_token)?.id
            : undefined
        })
      } catch (error) {
        console.warn('Interactive auth failed', error)
        countSentryMetric('auth_interactive_failure', 1, {
          unit: 'attempt',
          attributes: {
            action: extraParams?.kc_action === 'register' ? 'register' : 'login'
          }
        })
        logSentryError('Interactive auth flow failed', {
          action: extraParams?.kc_action === 'register' ? 'register' : 'login',
          error_message: error instanceof Error ? error.message : String(error)
        })
        captureSentryException(error)
      }
    },
    [isAuthConfigured, missingConfigKeys, setCurrentToken]
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
