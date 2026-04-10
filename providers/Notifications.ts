import { config } from '@mobile/config'
import * as Notifications from 'expo-notifications'
import { useEffect, useState } from 'react'

export function usePushToken() {
  const [token, setToken] = useState<string>()

  useEffect(() => {
    if (!config.pushRegistrationEnabled) {
      return
    }

    let cancelled = false

    const register = async () => {
      try {
        const { status } = await Notifications.requestPermissionsAsync()
        if (status !== 'granted') {
          return
        }

        const expoToken = await Notifications.getExpoPushTokenAsync({
          projectId: config.easProjectId || undefined
        })

        if (cancelled) {
          return
        }

        setToken(expoToken.data)

        if (config.apiUrl) {
          await fetch(
            `${config.apiUrl.replace(/\/$/, '')}/notify/register`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: expoToken.data })
            }
          )
        }
      } catch (error) {
        if (__DEV__) {
          console.warn('Failed to register push token', error)
        }
      }
    }

    void register()

    return () => {
      cancelled = true
    }
  }, [])

  return token
}
