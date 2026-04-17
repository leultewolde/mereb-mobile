import React from 'react'
import { act, renderHook } from '@testing-library/react-native/pure'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { settle, waitForExpectation } from '../test/react-test-utils'

type LoadedNotificationsModule = typeof import('./Notifications')
type NotificationControlsHandle = import('./Notifications').NotificationControlsHandle
type UpdateNotificationSettingsMutationResult = {
  data?: {
    updateNotificationSettings: {
      __typename?: 'NotificationSettings'
      directMessagesEnabled: boolean
      updatedAt: string
    }
  }
}

type NotificationPermissionsStatus = {
  status: 'granted' | 'denied' | 'undetermined'
  canAskAgain: boolean
}

function getNativeTestState() {
  return (globalThis as unknown as {
    __RN_TEST__: {
      appStateListeners: ((nextState: string) => void)[]
      openSettingsMock: ReturnType<typeof vi.fn>
      platformState: { OS: string }
    }
  }).__RN_TEST__
}

async function loadNotificationsModule(options?: {
  isAuthenticated?: boolean
  authToken?: string
  userId?: string
  pushRegistrationEnabled?: boolean
  cachedDirectMessagesEnabled?: boolean
  storedInstallationId?: string
  settingsData?: {
    directMessagesEnabled: boolean
    updatedAt: string
  }
  settingsError?: Error
  asyncStorageGetItemError?: Error
  asyncStorageSetItemError?: Error
  permissions?: NotificationPermissionsStatus
  permissionsSequence?: NotificationPermissionsStatus[]
  getPermissionsError?: Error
  permissionRequestResult?: NotificationPermissionsStatus
  requestPermissionsError?: Error
  updateNotificationSettingsError?: Error
  upsertPushDeviceError?: Error
  removePushDeviceError?: Error
  pushToken?: string
  lastNotificationResponse?: {
    notification: {
      request: {
        identifier: string
        content: {
          data: Record<string, unknown>
        }
      }
    }
  } | null
}) {
  vi.resetModules()

  const storage = new Map<string, string>()
  if (options?.storedInstallationId) {
    storage.set('notifications.installationId', options.storedInstallationId)
  }
  if (typeof options?.cachedDirectMessagesEnabled === 'boolean') {
    storage.set(
      'notifications.directMessagesEnabled',
      options.cachedDirectMessagesEnabled ? 'true' : 'false'
    )
  }

  const getItem = vi.fn(async (key: string) => {
    if (options?.asyncStorageGetItemError) {
      throw options.asyncStorageGetItemError
    }

    return storage.get(key) ?? null
  })
  const setItem = vi.fn(async (key: string, value: string) => {
    if (options?.asyncStorageSetItemError) {
      throw options.asyncStorageSetItemError
    }

    storage.set(key, value)
  })

  const writeQuery = vi.fn()
  const refetch = vi.fn(async () => undefined)
  const settingsQueryState = {
    data: options?.settingsData
      ? {
          meNotificationSettings: {
            __typename: 'NotificationSettings',
            ...options.settingsData
          }
        }
      : undefined,
    loading: false,
    error: options?.settingsError,
    client: {
      writeQuery
    },
    refetch
  }

  const updateNotificationSettings = vi.fn(async ({
    variables,
    update
  }: {
    variables: { directMessagesEnabled: boolean }
    update?: (
      cache: unknown,
      mutationResult: UpdateNotificationSettingsMutationResult
    ) => void
  }) => {
    if (options?.updateNotificationSettingsError) {
      throw options.updateNotificationSettingsError
    }

    const nextValue = variables.directMessagesEnabled
    const updatedAt = new Date('2026-04-14T00:00:00.000Z').toISOString()
    settingsQueryState.data = {
      meNotificationSettings: {
        __typename: 'NotificationSettings',
        directMessagesEnabled: nextValue,
        updatedAt
      }
    }
    const result = {
      data: {
        updateNotificationSettings: {
          __typename: 'NotificationSettings' as const,
          directMessagesEnabled: nextValue,
          updatedAt
        }
      }
    }

    update?.(undefined, result)
    return result
  })
  const upsertPushDevice = vi.fn(async () => {
    if (options?.upsertPushDeviceError) {
      throw options.upsertPushDeviceError
    }

    return {
      data: {
        upsertPushDevice: {
          installationId: options?.storedInstallationId ?? 'installation-1',
          platform: 'IOS',
          permissionStatus: 'GRANTED',
          appVersion: '1.0.1',
          lastSeenAt: '2026-04-14T00:00:00.000Z'
        }
      }
    }
  })
  const removePushDevice = vi.fn(async () => {
    if (options?.removePushDeviceError) {
      throw options.removePushDeviceError
    }

    return {
      data: {
        removePushDevice: true
      }
    }
  })

  const addBreadcrumb = vi.fn()
  const captureSentryException = vi.fn()
  const countSentryMetric = vi.fn()
  const distributionSentryMetric = vi.fn()
  const logSentryError = vi.fn()
  const logSentryInfo = vi.fn()
  const logSentryWarn = vi.fn()
  const pushMock = vi.fn()
  const responseListeners: ((
    response: NonNullable<typeof options>['lastNotificationResponse']
  ) => void)[] = []
  const tokenListeners: ((event: { data: string }) => void)[] = []
  const permissionSequence = [...(options?.permissionsSequence ?? [])]
  const getPermissionsAsync = vi.fn(async () => {
    if (options?.getPermissionsError) {
      throw options.getPermissionsError
    }

    return permissionSequence.shift() ?? options?.permissions ?? { status: 'granted', canAskAgain: true }
  })
  const requestPermissionsAsync = vi.fn(async () => {
    if (options?.requestPermissionsError) {
      throw options.requestPermissionsError
    }

    return options?.permissionRequestResult ?? { status: 'granted', canAskAgain: true }
  })
  const getExpoPushTokenAsync = vi.fn(async () => ({
    data: options?.pushToken ?? 'ExponentPushToken[test-token]'
  }))
  const setNotificationChannelAsync = vi.fn(async () => undefined)
  const addNotificationResponseReceivedListener = vi.fn((listener: (response: NonNullable<typeof options>['lastNotificationResponse']) => void) => {
    responseListeners.push(listener)
    return { remove: vi.fn() }
  })
  const addPushTokenListener = vi.fn((listener: (event: { data: string }) => void) => {
    tokenListeners.push(listener)
    return { remove: vi.fn() }
  })

  vi.doMock('@apollo/client', () => ({
    gql(strings: TemplateStringsArray) {
      return strings.join('')
    }
  }))

  vi.doMock('@apollo/client/react', () => ({
    useQuery(document: string) {
      if (document.includes('MobileMeNotificationSettings')) {
        return settingsQueryState
      }

      throw new Error(`Unexpected query: ${document}`)
    },
    useMutation(document: string) {
      if (document.includes('MobileUpdateNotificationSettings')) {
        return [updateNotificationSettings]
      }

      if (document.includes('MobileUpsertPushDevice')) {
        return [upsertPushDevice]
      }

      if (document.includes('MobileRemovePushDevice')) {
        return [removePushDevice]
      }

      throw new Error(`Unexpected mutation: ${document}`)
    }
  }))

  vi.doMock('@mobile/config', () => ({
    config: {
      pushRegistrationEnabled: options?.pushRegistrationEnabled ?? true,
      easProjectId: 'project-1'
    }
  }))

  vi.doMock('expo-constants', () => ({
    default: {
      expoConfig: {
        version: '1.0.1'
      }
    }
  }))

  vi.doMock('expo-router', () => ({
    useRouter: () => ({
      push: pushMock
    })
  }))

  vi.doMock('@react-native-async-storage/async-storage', () => ({
    default: {
      getItem,
      setItem
    }
  }))

  vi.doMock('expo-notifications', () => ({
    AndroidImportance: {
      HIGH: 'HIGH'
    },
    setNotificationHandler: vi.fn(),
    getPermissionsAsync,
    requestPermissionsAsync,
    getExpoPushTokenAsync,
    setNotificationChannelAsync,
    addNotificationResponseReceivedListener,
    addPushTokenListener,
    useLastNotificationResponse: () => options?.lastNotificationResponse ?? null
  }))

  vi.doMock('../monitoring/sentry', () => ({
    addSentryBreadcrumb: addBreadcrumb,
    captureSentryException,
    countSentryMetric,
    distributionSentryMetric,
    logSentryError,
    logSentryInfo,
    logSentryWarn
  }))

  const module = (await import('./Notifications')) as LoadedNotificationsModule

  return {
    module,
    mocks: {
      addBreadcrumb,
      addNotificationResponseReceivedListener,
      addPushTokenListener,
      captureSentryException,
      countSentryMetric,
      distributionSentryMetric,
      getExpoPushTokenAsync,
      getPermissionsAsync,
      logSentryError,
      logSentryInfo,
      logSentryWarn,
      pushMock,
      refetch,
      removePushDevice,
      requestPermissionsAsync,
      responseListeners,
      setItem,
      setNotificationChannelAsync,
      settingsQueryState,
      tokenListeners,
      updateNotificationSettings,
      upsertPushDevice,
      writeQuery
    }
  }
}

function renderNotificationsProvider(
  module: LoadedNotificationsModule,
  props: {
    authToken?: string
    userId?: string
    isAuthenticated: boolean
    controlsRef?: React.RefObject<NotificationControlsHandle | null>
  }
) {
  return renderHook(() => module.useNotifications(), {
    wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
      return (
        <module.NotificationsProvider {...props}>
          {children}
        </module.NotificationsProvider>
      )
    }
  })
}

function renderNotificationsProbeWithoutProvider(module: LoadedNotificationsModule) {
  return renderHook(() => module.useNotifications())
}

afterEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.doUnmock('@apollo/client')
  vi.doUnmock('@apollo/client/react')
  vi.doUnmock('@mobile/config')
  vi.doUnmock('expo-constants')
  vi.doUnmock('expo-router')
  vi.doUnmock('@react-native-async-storage/async-storage')
  vi.doUnmock('expo-notifications')
  vi.doUnmock('../monitoring/sentry')
})

describe('NotificationsProvider', () => {
  it('exposes safe default notification controls outside the provider', async () => {
    const { module } = await loadNotificationsModule()
    const { result, unmount } = renderNotificationsProbeWithoutProvider(module)

    expect(result.current).toMatchObject({
      isAvailable: false,
      isReady: false,
      osStatus: 'unknown',
      directMessagesEnabled: false
    })

    await act(async () => {
      expect(await result.current.requestPermission()).toBe('unknown')
      await result.current.setDirectMessagesEnabled(true)
      await result.current.openSystemSettings()
      await result.current.refreshPermissionStatus()
    })

    unmount()
  })

  it('hydrates cached preferences and current OS permissions', async () => {
    const { module } = await loadNotificationsModule({
      cachedDirectMessagesEnabled: true,
      storedInstallationId: 'installation-1',
      permissions: {
        status: 'granted',
        canAskAgain: true
      }
    })
    const { result, unmount } = renderNotificationsProvider(module, {
      isAuthenticated: false
    })

    await waitForExpectation(() => {
      expect(result.current.isReady).toBe(true)
      expect(result.current.osStatus).toBe('granted')
      expect(result.current.directMessagesEnabled).toBe(true)
    })

    unmount()
  })

  it('enables direct-message notifications and registers the device', async () => {
    const { module, mocks } = await loadNotificationsModule({
      settingsData: {
        directMessagesEnabled: false,
        updatedAt: '2026-04-14T00:00:00.000Z'
      },
      storedInstallationId: 'installation-1',
      permissions: {
        status: 'denied',
        canAskAgain: true
      },
      permissionRequestResult: {
        status: 'granted',
        canAskAgain: true
      }
    })
    const { result, unmount } = renderNotificationsProvider(module, {
      authToken: 'token-1',
      userId: 'user-1',
      isAuthenticated: true
    })

    await waitForExpectation(() => {
      expect(result.current.isReady).toBe(true)
    })

    await act(async () => {
      await result.current.setDirectMessagesEnabled(true)
    })

    await waitForExpectation(() => {
      expect(mocks.updateNotificationSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: {
            directMessagesEnabled: true
          }
        })
      )
      expect(mocks.upsertPushDevice).toHaveBeenCalled()
    })

    expect(mocks.requestPermissionsAsync).toHaveBeenCalled()
    expect(mocks.setItem).toHaveBeenCalledWith(
      'notifications.directMessagesEnabled',
      'true'
    )
    expect(mocks.writeQuery).toHaveBeenCalled()
    expect(mocks.countSentryMetric).toHaveBeenCalledWith(
      'notification_permission_request',
      1,
      {
        unit: 'request',
        attributes: {
          status: 'granted'
        }
      }
    )
    expect(mocks.countSentryMetric).toHaveBeenCalledWith(
      'notification_preference_update_success',
      1,
      {
        unit: 'setting',
        attributes: {
          enabled: true,
          os_status: 'granted'
        }
      }
    )
    expect(mocks.distributionSentryMetric).toHaveBeenCalledWith(
      'notification_preference_update_duration',
      expect.any(Number),
      expect.objectContaining({
        unit: 'millisecond',
        attributes: {
          enabled: true,
          os_status: 'granted'
        }
      })
    )
    expect(mocks.logSentryInfo).toHaveBeenCalledWith(
      'Direct-message notification preference updated',
      expect.objectContaining({
        enabled: true,
        os_status: 'granted'
      })
    )
    expect(mocks.countSentryMetric).toHaveBeenCalledWith(
      'push_device_register_success',
      1,
      {
        unit: 'device',
        attributes: {
          platform: 'ios'
        }
      }
    )
    expect(mocks.logSentryInfo).toHaveBeenCalledWith(
      'Push device registered for direct-message notifications',
      expect.objectContaining({
        installation_id: 'installation-1',
        user_id: 'user-1'
      })
    )

    unmount()
  })

  it('unregisters the current device when direct-message alerts are disabled', async () => {
    const { module, mocks } = await loadNotificationsModule({
      settingsData: {
        directMessagesEnabled: true,
        updatedAt: '2026-04-14T00:00:00.000Z'
      },
      storedInstallationId: 'installation-1',
      cachedDirectMessagesEnabled: true
    })
    const controlsRef = {
      current: null
    }
    const { result, unmount } = renderNotificationsProvider(module, {
      authToken: 'token-1',
      userId: 'user-1',
      isAuthenticated: true,
      controlsRef
    })

    await waitForExpectation(() => {
      expect(mocks.upsertPushDevice).toHaveBeenCalled()
      expect(result.current.directMessagesEnabled).toBe(true)
    })

    await act(async () => {
      await result.current.setDirectMessagesEnabled(false)
    })

    await waitForExpectation(() => {
      expect(mocks.removePushDevice).toHaveBeenCalledWith({
        variables: {
          installationId: 'installation-1'
        }
      })
    })

    expect(controlsRef.current).toMatchObject({
      unregisterCurrentDevice: expect.any(Function)
    })

    unmount()
  })

  it('opens the conversation from a notification tap', async () => {
    const response = {
      notification: {
        request: {
          identifier: 'notif-1',
          content: {
            data: {
              type: 'message',
              conversationId: 'conversation-1'
            }
          }
        }
      }
    }
    const { module, mocks } = await loadNotificationsModule({
      lastNotificationResponse: response
    })

    const { unmount } = renderNotificationsProvider(module, {
      authToken: 'token-1',
      userId: 'user-1',
      isAuthenticated: true
    })

    await waitForExpectation(() => {
      expect(mocks.pushMock).toHaveBeenCalledWith('/messages/conversation-1')
    })
    expect(mocks.logSentryInfo).toHaveBeenCalledWith(
      'Opened messaging conversation from notification',
      expect.objectContaining({
        conversation_id: 'conversation-1'
      })
    )
    expect(mocks.countSentryMetric).toHaveBeenCalledWith(
      'notification_open',
      1,
      {
        unit: 'notification',
        attributes: {
          type: 'message'
        }
      }
    )

    unmount()
  })

  it('handles unavailable notifications without attempting registration and can open system settings', async () => {
    const nativeTestState = getNativeTestState()
    const { module, mocks } = await loadNotificationsModule({
      pushRegistrationEnabled: false
    })

    const { result, unmount } = renderNotificationsProvider(module, {
      authToken: 'token-1',
      userId: 'user-1',
      isAuthenticated: true
    })

    await waitForExpectation(() => {
      expect(result.current.isAvailable).toBe(false)
      expect(result.current.isReady).toBe(true)
      expect(result.current.osStatus).toBe('unknown')
    })

    await act(async () => {
      await result.current.openSystemSettings()
      await result.current.requestPermission()
    })

    expect(nativeTestState.openSettingsMock).toHaveBeenCalled()
    expect(mocks.requestPermissionsAsync).not.toHaveBeenCalled()
    expect(mocks.upsertPushDevice).not.toHaveBeenCalled()

    unmount()
  })

  it('captures permission read failures and refreshes permissions when the app becomes active', async () => {
    const nativeTestState = getNativeTestState()
    const { module, mocks } = await loadNotificationsModule({
      getPermissionsError: new Error('permission read failed')
    })
    const { result, unmount } = renderNotificationsProvider(module, {
      authToken: 'token-1',
      userId: 'user-1',
      isAuthenticated: true
    })

    await waitForExpectation(() => {
      expect(result.current.isReady).toBe(true)
      expect(mocks.captureSentryException).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'permission read failed' })
      )
    })
    expect(mocks.logSentryError).toHaveBeenCalledWith(
      'Notification permission status read failed',
      expect.objectContaining({
        error_message: 'permission read failed'
      })
    )
    expect(mocks.countSentryMetric).toHaveBeenCalledWith(
      'notification_permission_status_read_failure',
      1,
      {
        unit: 'attempt'
      }
    )

    mocks.getPermissionsAsync.mockReset()
    mocks.getPermissionsAsync.mockResolvedValueOnce({
      status: 'granted',
      canAskAgain: true
    })

    await act(async () => {
      nativeTestState.appStateListeners.forEach((listener) => listener('active'))
      await settle()
    })

    await waitForExpectation(() => {
      expect(result.current.osStatus).toBe('granted')
    })

    unmount()
  })

  it('deduplicates repeated notification taps and ignores unrelated payloads', async () => {
    const { module, mocks } = await loadNotificationsModule()
    const { unmount } = renderNotificationsProvider(module, {
      authToken: 'token-1',
      userId: 'user-1',
      isAuthenticated: true
    })

    await waitForExpectation(() => {
      expect(mocks.responseListeners).toHaveLength(1)
    })

    const handler = mocks.responseListeners[0]
    const response = {
      notification: {
        request: {
          identifier: 'notif-1',
          content: {
            data: {
              type: 'message',
              conversationId: 'conversation-1'
            }
          }
        }
      }
    }

    await act(async () => {
      handler({
        notification: {
          request: {
            identifier: 'ignored',
            content: {
              data: {
                type: 'comment'
              }
            }
          }
        }
      })
      handler(response)
      handler(response)
      await settle()
    })

    expect(mocks.pushMock).toHaveBeenCalledTimes(1)
    expect(mocks.pushMock).toHaveBeenCalledWith('/messages/conversation-1')

    unmount()
  })

  it('captures cached preference persistence failures without losing the in-memory setting', async () => {
    const { module, mocks } = await loadNotificationsModule({
      settingsData: {
        directMessagesEnabled: true,
        updatedAt: '2026-04-14T00:00:00.000Z'
      },
      storedInstallationId: 'installation-1',
      asyncStorageSetItemError: new Error('storage write failed')
    })
    const { result, unmount } = renderNotificationsProvider(module, {
      authToken: 'token-1',
      userId: 'user-1',
      isAuthenticated: true
    })

    await waitForExpectation(() => {
      expect(result.current.directMessagesEnabled).toBe(true)
    })

    await waitForExpectation(() => {
      expect(mocks.captureSentryException).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'storage write failed' })
      )
    })

    unmount()
  })

  it('does not enable direct-message alerts when permission remains denied', async () => {
    const { module, mocks } = await loadNotificationsModule({
      settingsData: {
        directMessagesEnabled: false,
        updatedAt: '2026-04-14T00:00:00.000Z'
      },
      permissions: {
        status: 'denied',
        canAskAgain: true
      },
      permissionRequestResult: {
        status: 'denied',
        canAskAgain: true
      }
    })
    const { result, unmount } = renderNotificationsProvider(module, {
      authToken: 'token-1',
      userId: 'user-1',
      isAuthenticated: true
    })

    await waitForExpectation(() => {
      expect(result.current.isReady).toBe(true)
    })

    await act(async () => {
      await result.current.setDirectMessagesEnabled(true)
    })

    expect(mocks.updateNotificationSettings).not.toHaveBeenCalled()
    expect(mocks.upsertPushDevice).not.toHaveBeenCalled()

    unmount()
  })

  it('captures direct-message settings update failures', async () => {
    const { module, mocks } = await loadNotificationsModule({
      settingsData: {
        directMessagesEnabled: false,
        updatedAt: '2026-04-14T00:00:00.000Z'
      },
      permissions: {
        status: 'granted',
        canAskAgain: true
      },
      updateNotificationSettingsError: new Error('settings mutation failed')
    })
    const { result, unmount } = renderNotificationsProvider(module, {
      authToken: 'token-1',
      userId: 'user-1',
      isAuthenticated: true
    })

    await waitForExpectation(() => {
      expect(result.current.isReady).toBe(true)
    })

    let capturedError: unknown
    await act(async () => {
      try {
        await result.current.setDirectMessagesEnabled(true)
      } catch (error) {
        capturedError = error
      }
    })

    expect(capturedError).toEqual(
      expect.objectContaining({ message: 'settings mutation failed' })
    )

    expect(mocks.captureSentryException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'settings mutation failed' })
    )

    unmount()
  })

  it('captures installation bootstrap and settings query failures', async () => {
    const { module, mocks } = await loadNotificationsModule({
      asyncStorageGetItemError: new Error('installation bootstrap failed'),
      settingsError: new Error('settings query failed')
    })
    const { result, unmount } = renderNotificationsProvider(module, {
      authToken: 'token-1',
      userId: 'user-1',
      isAuthenticated: true
    })

    await waitForExpectation(() => {
      expect(result.current.isReady).toBe(true)
    })

    expect(mocks.captureSentryException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'installation bootstrap failed' })
    )
    expect(mocks.countSentryMetric).toHaveBeenCalledWith(
      'notification_installation_bootstrap_failure',
      1,
      {
        unit: 'attempt'
      }
    )
    expect(mocks.countSentryMetric).toHaveBeenCalledWith(
      'notification_settings_query_failure',
      1,
      {
        unit: 'attempt'
      }
    )
    expect(mocks.logSentryError).toHaveBeenCalledWith(
      'Notification settings query failed',
      expect.objectContaining({
        error_message: 'settings query failed'
      })
    )

    unmount()
  })

  it('captures push-device registration failures and still clears saving state', async () => {
    const nativeTestState = getNativeTestState()
    nativeTestState.platformState.OS = 'android'

    const { module, mocks } = await loadNotificationsModule({
      settingsData: {
        directMessagesEnabled: true,
        updatedAt: '2026-04-14T00:00:00.000Z'
      },
      upsertPushDeviceError: new Error('push registration failed')
    })
    const { result, unmount } = renderNotificationsProvider(module, {
      authToken: 'token-1',
      userId: 'user-1',
      isAuthenticated: true
    })

    await waitForExpectation(() => {
      expect(mocks.captureSentryException).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'push registration failed' })
      )
    })

    expect(mocks.setNotificationChannelAsync).toHaveBeenCalled()
    expect(result.current.settingsSaving).toBe(false)
    expect(mocks.logSentryError).toHaveBeenCalledWith(
      'Push device registration failed',
      expect.objectContaining({
        installation_id: expect.any(String),
      })
    )
    expect(mocks.countSentryMetric).toHaveBeenCalledWith(
      'push_device_register_failure',
      1,
      {
        unit: 'device',
        attributes: {
          platform: 'android'
        }
      }
    )

    unmount()
  })

  it('re-registers on push token changes and clears the controls ref on unmount', async () => {
    const nativeTestState = getNativeTestState()
    nativeTestState.platformState.OS = 'android'

    const { module, mocks } = await loadNotificationsModule({
      settingsData: {
        directMessagesEnabled: true,
        updatedAt: '2026-04-14T00:00:00.000Z'
      }
    })
    const controlsRef = {
      current: null
    }
    const { unmount } = renderNotificationsProvider(module, {
      authToken: 'token-1',
      userId: 'user-1',
      isAuthenticated: true,
      controlsRef
    })

    await waitForExpectation(() => {
      expect(mocks.tokenListeners).toHaveLength(1)
      expect(mocks.upsertPushDevice).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      mocks.tokenListeners[0]({ data: 'ExponentPushToken[next]' })
      await settle()
    })

    await waitForExpectation(() => {
      expect(mocks.upsertPushDevice).toHaveBeenCalledTimes(2)
      expect(mocks.upsertPushDevice).toHaveBeenLastCalledWith(
        expect.objectContaining({
          variables: {
            input: expect.objectContaining({
              expoPushToken: 'ExponentPushToken[next]'
            })
          }
        })
      )
    })

    expect(controlsRef.current).toMatchObject({
      unregisterCurrentDevice: expect.any(Function)
    })

    act(() => {
      unmount()
    })
    expect(controlsRef.current).toBeNull()
  })
})
