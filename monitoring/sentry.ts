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

type SentryBreadcrumbInput = {
  category: string
  message: string
  data?: Record<string, unknown>
  level?: 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug'
}

type SentryLogAttributes = Record<
  string,
  string | number | boolean | null | undefined
>

type SentryMetricOptions = {
  unit?: string
  attributes?: SentryLogAttributes
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

  const integrations =
    typeof Sentry.mobileReplayIntegration === 'function'
      ? [
          Sentry.mobileReplayIntegration({
            maskAllText: true,
            maskAllImages: true,
            maskAllVectors: true
          })
        ]
      : undefined

  Sentry.init({
    dsn: sentryDsn,
    enabled: true,
    environment: config.sentry.environment,
    release: buildRelease(),
    attachStacktrace: true,
    sendDefaultPii: false,
    enableLogs: true,
    replaysSessionSampleRate: config.sentry.replaysSessionSampleRate,
    replaysOnErrorSampleRate: config.sentry.replaysOnErrorSampleRate,
    ...(integrations ? { integrations } : {})
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

function sanitizeLogAttributes(
  attributes?: SentryLogAttributes
): Record<string, string | number | boolean | null> | undefined {
  if (!attributes) {
    return undefined
  }

  const entries = Object.entries(attributes).filter(
    (_entry): _entry is [string, string | number | boolean | null] =>
      _entry[1] !== undefined
  )

  if (entries.length === 0) {
    return undefined
  }

  return Object.fromEntries(entries)
}

function buildMetricOptions(
  options?: SentryMetricOptions
): {
  unit?: string
  attributes?: Record<string, string | number | boolean | null>
} | undefined {
  if (!options) {
    return undefined
  }

  const attributes = sanitizeLogAttributes(options.attributes)

  if (!options.unit && !attributes) {
    return undefined
  }

  return {
    ...(options.unit ? { unit: options.unit } : {}),
    ...(attributes ? { attributes } : {})
  }
}

function logSentryMessage(
  level: 'info' | 'warn' | 'error',
  message: string,
  attributes?: SentryLogAttributes
): void {
  if (!sentryEnabled) {
    return
  }

  const logger =
    level === 'info'
      ? Sentry.logger?.info
      : level === 'warn'
        ? Sentry.logger?.warn
        : Sentry.logger?.error

  if (typeof logger !== 'function') {
    return
  }

  logger(message, sanitizeLogAttributes(attributes))
}

export function logSentryInfo(
  message: string,
  attributes?: SentryLogAttributes
): void {
  logSentryMessage('info', message, attributes)
}

export function logSentryWarn(
  message: string,
  attributes?: SentryLogAttributes
): void {
  logSentryMessage('warn', message, attributes)
}

export function logSentryError(
  message: string,
  attributes?: SentryLogAttributes
): void {
  logSentryMessage('error', message, attributes)
}

export function countSentryMetric(
  name: string,
  value: number,
  options?: SentryMetricOptions
): void {
  if (!sentryEnabled || typeof Sentry.metrics?.count !== 'function') {
    return
  }

  Sentry.metrics.count(name, value, buildMetricOptions(options))
}

export function gaugeSentryMetric(
  name: string,
  value: number,
  options?: SentryMetricOptions
): void {
  if (!sentryEnabled || typeof Sentry.metrics?.gauge !== 'function') {
    return
  }

  Sentry.metrics.gauge(name, value, buildMetricOptions(options))
}

export function distributionSentryMetric(
  name: string,
  value: number,
  options?: SentryMetricOptions
): void {
  if (!sentryEnabled || typeof Sentry.metrics?.distribution !== 'function') {
    return
  }

  Sentry.metrics.distribution(name, value, buildMetricOptions(options))
}

export function addSentryBreadcrumb(input: SentryBreadcrumbInput): void {
  if (!sentryEnabled) {
    return
  }

  Sentry.addBreadcrumb({
    category: input.category,
    message: input.message,
    data: input.data,
    level: input.level ?? 'info'
  })
}

export function withSentryRoot<T extends ComponentType<any>>(RootComponent: T): T {
  if (!sentryEnabled) {
    return RootComponent
  }

  return Sentry.wrap(RootComponent) as T
}
