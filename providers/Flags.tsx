import { config } from '@mobile/config'
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react'

type FlagsState = Record<string, boolean>

type FlagsContextValue = {
  flags: FlagsState
  loading: boolean
  error?: string
}

type FlagsProviderProps = PropsWithChildren<{
  token?: string
}>

const FlagsContext = createContext<FlagsContextValue>({
  flags: {},
  loading: false,
  error: undefined
})

function flagsChanged(prev: FlagsState, next: FlagsState): boolean {
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
}: Readonly<FlagsProviderProps>): JSX.Element {
  const [flags, setFlags] = useState<FlagsState>({})
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
      setFlags({})
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
            setFlags({})
            setError(undefined)
          } else if (!cancelled) {
            setError(`Flags request failed (${response.status})`)
          }
          return
        }

        const data = (await response.json()) as FlagsState
        if (!cancelled) {
          setFlags((previous) =>
            flagsChanged(previous, data) ? data : previous
          )
          setError(undefined)
        }
      } catch (error) {
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
  }, [endpoint, token])

  return <FlagsContext.Provider value={{ flags, loading, error }}>{children}</FlagsContext.Provider>
}

export function useFlag(key: string): boolean {
  return Boolean(useContext(FlagsContext).flags[key])
}

export function useFlags(): FlagsContextValue {
  return useContext(FlagsContext)
}
