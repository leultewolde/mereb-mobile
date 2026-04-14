import Constants from 'expo-constants'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Sentry from '@sentry/react-native'
import type { ComponentType } from 'react'
import { config } from '@mobile/config'

type SentryUser = {
  id: string
  username?: string
  email?: string
}

const sentryDsn = config.sentry.dsn?.trim()
const sentryEnabled = config.sentry.enabled && Boolean(sentryDsn)
const sentryStartupTestEvent = config.sentry.startupTestEvent

function buildProbeStorageKey(): string | undefined {
  const release = buildRelease()
  if (!release) {
    return undefined
  }

  return `sentry-startup-probe:${config.sentry.environment}:${release}`
}

async function sendStartupProbeOnce(): Promise<void> {
  if (!sentryEnabled || !sentryStartupTestEvent) {
    return
  }

  const storageKey = buildProbeStorageKey()
  if (!storageKey) {
    return
  }

  try {
    const alreadySent = await AsyncStorage.getItem(storageKey)
    if (alreadySent === 'true') {
      return
    }

    const release = buildRelease()

    Sentry.withScope((scope) => {
      scope.setTag('probe', 'startup')
      scope.setTag('stage', config.sentry.environment)
      if (release) {
        scope.setExtra('release', release)
      }

      Sentry.captureException(new Error('Sentry startup probe'))
    })

    await Sentry.flush()
    await AsyncStorage.setItem(storageKey, 'true')
  } catch {
    // Avoid breaking app startup if probe delivery bookkeeping fails.
  }
}

let sentryInitialized = false

function buildRelease(): string | undefined {
  const slug = Constants.expoConfig?.slug?.trim()
  const version = Constants.expoConfig?.version?.trim()

  if (!slug || !version) {
    return undefined
  }

  return `${slug}@${version}`
}

export function initializeSentry(): void {
  if (sentryInitialized || !sentryEnabled || !sentryDsn) {
    return
  }

  Sentry.init({
    dsn: sentryDsn,
    enabled: true,
    environment: config.sentry.environment,
    release: buildRelease(),
    attachStacktrace: true,
    sendDefaultPii: false
  })

  sentryInitialized = true
  void sendStartupProbeOnce()
}

export function setSentryUser(user: SentryUser | null): void {
  if (!sentryEnabled) {
    return
  }

  Sentry.setUser(
    user
      ? {
          id: user.id,
          username: user.username,
          email: user.email
        }
      : null
  )
}

export function captureSentryException(error: unknown): void {
  if (!sentryEnabled) {
    return
  }

  Sentry.captureException(error)
}

export function withSentryRoot<T extends ComponentType<any>>(RootComponent: T): T {
  if (!sentryEnabled) {
    return RootComponent
  }

  return Sentry.wrap(RootComponent) as T
}
