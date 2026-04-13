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
import { captureSentryException, setSentryUser } from '../monitoring/sentry'
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
  hasRole: (role: string) => boolean
  hasAnyRole: (roles: string[]) => boolean
}

const FULL_ADMIN_ROLES = new Set(['admin', 'mereb.admin', 'realm-admin'])
const LIMITED_ADMIN_ROLES = new Set(['moderator', 'support', 'admin.viewer', 'mereb.staff'])
const ACCESS_TOKEN_STORAGE_KEY = 'access_token'
const REFRESH_TOKEN_STORAGE_KEY = 'refresh_token'

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
  return `${config.keycloak.url.replace(/\/$/, '')}/realms/${config.keycloak.realm}`
}

function buildRedirectUri() {
  return AuthSession.makeRedirectUri({
    scheme: config.appScheme,
    path: 'oauth2redirect/keycloak'
  })
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

  const [profile, setProfile] = useState<AuthProfile>()
  const [apolloClient, setApolloClient] = useState<ApolloClient>()
  const [ready, setReady] = useState(false)
  const missingConfigKeys = useMemo(() => {
    const keys: string[] = []
    if (!config.keycloak.url.trim()) {
      keys.push('KEYCLOAK_URL')
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
          fetch: (uri, options = {}) => {
            const headers = {
              ...options.headers,
              ...(tokenRef.current ? { Authorization: `Bearer ${tokenRef.current}` } : {})
            }
            return fetch(uri, { ...options, headers })
          }
        }),
        cache
      })
    }

    const hydrateRefreshToken = async () => {
      const storedAccess = await SecureStore.getItemAsync(ACCESS_TOKEN_STORAGE_KEY)
      const storedRefresh = await SecureStore.getItemAsync(REFRESH_TOKEN_STORAGE_KEY)

      if (storedAccess && isAccessTokenUsable(storedAccess) && !cancelled) {
        setToken(storedAccess)
      }

      if (!storedRefresh || !isAuthConfigured || cancelled) {
        return
      }

      try {
        const discovery = await AuthSession.fetchDiscoveryAsync(buildIssuerUrl())
        const payload = await exchangeTokens(
          discovery,
          {
            grant_type: 'refresh_token',
            client_id: config.keycloak.clientId,
            refresh_token: storedRefresh
          },
          'Refresh token exchange'
        )

        if (cancelled) {
          return
        }

        if (payload.access_token) {
          await SecureStore.setItemAsync(ACCESS_TOKEN_STORAGE_KEY, payload.access_token)
          setToken(payload.access_token)
        }

        if (payload.refresh_token) {
          await SecureStore.setItemAsync(REFRESH_TOKEN_STORAGE_KEY, payload.refresh_token)
        }
      } catch (error) {
        if (isInvalidGrantError(error)) {
          await SecureStore.deleteItemAsync(ACCESS_TOKEN_STORAGE_KEY)
          await SecureStore.deleteItemAsync(REFRESH_TOKEN_STORAGE_KEY)
          if (!cancelled) {
            setToken(undefined)
          }
        } else {
          console.warn('Refresh token exchange failed', error)
          captureSentryException(error)
        }
      }
    }

    const bootstrap = async () => {
      try {
        const client = await initializeApolloClient()
        if (cancelled) {
          return
        }

        setApolloClient(client)
        await hydrateRefreshToken()
      } catch (error) {
        console.error('Failed to initialise Apollo client', error)
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
  }, [isAuthConfigured])

  const performAuth = useCallback(
    async (extraParams?: Record<string, string>) => {
      const { clientId } = config.keycloak
      if (!clientId) {
        console.warn('Keycloak configuration is incomplete.')
        return
      }

      const discovery = await AuthSession.fetchDiscoveryAsync(buildIssuerUrl())
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

      try {
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
          setToken(payload.access_token)
        } else {
          await SecureStore.deleteItemAsync(ACCESS_TOKEN_STORAGE_KEY)
        }

        if (payload.refresh_token) {
          await SecureStore.setItemAsync(REFRESH_TOKEN_STORAGE_KEY, payload.refresh_token)
        } else {
          await SecureStore.deleteItemAsync(REFRESH_TOKEN_STORAGE_KEY)
        }
      } catch (error) {
        console.warn('Token exchange failed', error)
      }
    },
    []
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
    }

    await SecureStore.deleteItemAsync(ACCESS_TOKEN_STORAGE_KEY)
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_STORAGE_KEY)
    setToken(undefined)
    setProfile(undefined)
  }, [])

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
      hasRole: (role: string) => roleSet.has(role),
      hasAnyRole: (roles: string[]) => roles.some((role) => roleSet.has(role))
    }),
    [ready, isAuthenticated, isAuthConfigured, missingConfigKeys, token, profile, login, register, logout, roleSet]
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
