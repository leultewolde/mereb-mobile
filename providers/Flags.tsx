import { config } from '@mobile/config'
import {
  createContext,
  type PropsWithChildren,
  type ReactElement,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react'
import { logSentryWarn } from '../monitoring/sentry'

export type PublicFlags = Record<string, boolean> & {
  inviteOnlyRegistration: boolean
  mobileAccountCreationEnabled: boolean
}

type FlagsContextValue = {
  flags: PublicFlags
  loading: boolean
  error?: string
}

type FlagsProviderProps = PropsWithChildren<{
  token?: string
}>

const FlagsContext = createContext<FlagsContextValue>({
  flags: {
    inviteOnlyRegistration: false,
    mobileAccountCreationEnabled: config.stage !== 'prd'
  },
  loading: false,
  error: undefined
})

function flagsChanged(prev: PublicFlags, next: PublicFlags): boolean {
  const prevKeys = Object.keys(prev)
  const nextKeys = Object.keys(next)

  if (prevKeys.length !== nextKeys.length) {
    return true
  }

  for (const key of nextKeys) {
    if (prev[key] !== next[key]) {
      return true
    }
  }

  return false
}

export function FlagsProvider({
  token,
  children
}: Readonly<FlagsProviderProps>): ReactElement {
  const defaultFlags = useMemo<PublicFlags>(
    () => ({
      inviteOnlyRegistration: false,
      mobileAccountCreationEnabled: config.stage !== 'prd'
    }),
    []
  )
  const [flags, setFlags] = useState<PublicFlags>(defaultFlags)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()

  const endpoint = useMemo(() => {
    if (!config.flagsUrl?.trim()) {
      return undefined
    }
    return config.flagsUrl.replace(/\/$/, '')
  }, [])

  useEffect(() => {
    if (!endpoint) {
      setFlags(defaultFlags)
      setLoading(false)
      setError(undefined)
      return
    }

    let cancelled = false
    const controller = new AbortController()

    const load = async () => {
      setLoading(true)
      setError(undefined)

      try {
        const headers: Record<string, string> = {
          Accept: 'application/json'
        }
        if (token) {
          headers.Authorization = `Bearer ${token}`
        }

        const response = await fetch(endpoint, {
          headers,
          signal: controller.signal
        })

        if (!response.ok) {
          if (response.status === 401 && !cancelled) {
            setFlags(defaultFlags)
            setError(undefined)
          } else if (!cancelled) {
            setError(`Flags request failed (${response.status})`)
          }
          return
        }

        const data = (await response.json()) as Record<string, boolean>
        const nextFlags = {
          ...defaultFlags,
          ...data
        }
        if (!cancelled) {
          setFlags((previous) =>
            flagsChanged(previous, nextFlags) ? nextFlags : previous
          )
          setError(undefined)
        }
      } catch (error) {
        logSentryWarn('Failed to load feature flags', {
          endpoint,
          has_auth_token: Boolean(token),
          error_message: error instanceof Error ? error.message : String(error)
        })
        if (!cancelled && __DEV__) {
          console.warn('Failed to load feature flags', error)
        }
        if (!cancelled) {
          setError('Feature flags are unavailable right now.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [defaultFlags, endpoint, token])

  return <FlagsContext.Provider value={{ flags, loading, error }}>{children}</FlagsContext.Provider>
}

export function useFlag(key: string): boolean {
  return Boolean(useContext(FlagsContext).flags[key])
}

export function useFlags(): FlagsContextValue {
  return useContext(FlagsContext)
}
