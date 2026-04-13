import Constants from 'expo-constants'
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
