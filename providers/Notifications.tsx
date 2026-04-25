import AsyncStorage from '@react-native-async-storage/async-storage'
import { gql } from '@apollo/client'
import {
  useMutation,
  useQuery
} from '@apollo/client/react'
import { config } from '@mobile/config'
import Constants from 'expo-constants'
import * as Notifications from 'expo-notifications'
import { useRouter } from 'expo-router'
import {
  AppState,
  Linking,
  Platform
} from 'react-native'
import {
  type PropsWithChildren,
  type RefObject,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import {
  addSentryBreadcrumb,
  captureSentryException,
  countSentryMetric,
  distributionSentryMetric,
  logSentryError,
  logSentryInfo,
  logSentryWarn
} from '../monitoring/sentry'
import {isAuthenticationErrorMessage} from "@mobile/helpers";

const INSTALLATION_ID_STORAGE_KEY = 'notifications.installationId'
const DIRECT_MESSAGES_CACHE_STORAGE_KEY = 'notifications.directMessagesEnabled'
const MESSAGE_CHANNEL_ID = 'messages'

const ME_NOTIFICATION_SETTINGS_QUERY = gql`
  query MobileMeNotificationSettings {
    meNotificationSettings {
      directMessagesEnabled
      updatedAt
    }
  }
`

const UPDATE_NOTIFICATION_SETTINGS_MUTATION = gql`
  mutation MobileUpdateNotificationSettings($directMessagesEnabled: Boolean!) {
    updateNotificationSettings(directMessagesEnabled: $directMessagesEnabled) {
      directMessagesEnabled
      updatedAt
    }
  }
`

const UPSERT_PUSH_DEVICE_MUTATION = gql`
  mutation MobileUpsertPushDevice($input: UpsertPushDeviceInput!) {
    upsertPushDevice(input: $input) {
      installationId
      platform
      permissionStatus
      appVersion
      lastSeenAt
    }
  }
`

const REMOVE_PUSH_DEVICE_MUTATION = gql`
  mutation MobileRemovePushDevice($installationId: ID!) {
    removePushDevice(installationId: $installationId)
  }
`

type GraphNotificationPermissionStatus =
  | 'UNKNOWN'
  | 'GRANTED'
  | 'DENIED'
  | 'BLOCKED'

type GraphPushPlatform = 'IOS' | 'ANDROID'

type MeNotificationSettingsQueryData = {
  meNotificationSettings: {
    __typename?: 'NotificationSettings'
    directMessagesEnabled: boolean
    updatedAt: string
  }
}

type UpdateNotificationSettingsMutationData = {
  updateNotificationSettings: {
    __typename?: 'NotificationSettings'
    directMessagesEnabled: boolean
    updatedAt: string
  }
}

type UpdateNotificationSettingsMutationVariables = {
  directMessagesEnabled: boolean
}

type UpsertPushDeviceMutationData = {
  upsertPushDevice: {
    installationId: string
    platform: GraphPushPlatform
    permissionStatus: GraphNotificationPermissionStatus
    appVersion?: string | null
    lastSeenAt: string
  }
}

type UpsertPushDeviceMutationVariables = {
  input: {
    installationId: string
    expoPushToken: string
    platform: GraphPushPlatform
    permissionStatus: GraphNotificationPermissionStatus
    appVersion?: string | null
  }
}

type RemovePushDeviceMutationData = {
  removePushDevice: boolean
}

type RemovePushDeviceMutationVariables = {
  installationId: string
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true
  })
})

export type NotificationOsStatus = 'unknown' | 'granted' | 'denied' | 'blocked'

export type NotificationControlsHandle = {
  unregisterCurrentDevice: () => Promise<void>
}

type NotificationsProviderProps = PropsWithChildren<{
  authToken?: string
  userId?: string
  isAuthenticated: boolean
  controlsRef?: RefObject<NotificationControlsHandle | null>
}>

type NotificationsContextValue = {
  isAvailable: boolean
  isReady: boolean
  osStatus: NotificationOsStatus
  directMessagesEnabled: boolean
  settingsLoading: boolean
  settingsSaving: boolean
  requestPermission: () => Promise<NotificationOsStatus>
  setDirectMessagesEnabled: (enabled: boolean) => Promise<void>
  openSystemSettings: () => Promise<void>
  refreshPermissionStatus: () => Promise<void>
}

const NotificationsContext = createContext<NotificationsContextValue>({
  isAvailable: false,
  isReady: false,
  osStatus: 'unknown',
  directMessagesEnabled: false,
  settingsLoading: false,
  settingsSaving: false,
  requestPermission: async () => 'unknown',
  setDirectMessagesEnabled: async () => {},
  openSystemSettings: async () => {},
  refreshPermissionStatus: async () => {}
})

function createInstallationId(): string {
  return [
    Date.now().toString(36),
    Math.random().toString(36).slice(2, 10),
    Math.random().toString(36).slice(2, 10)
  ].join('-')
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function mapPermissionStatus(
  permissions: Notifications.NotificationPermissionsStatus
): NotificationOsStatus {
  if (permissions.status === 'granted') {
    return 'granted'
  }

  if (permissions.status === 'denied') {
    return permissions.canAskAgain ? 'denied' : 'blocked'
  }

  return 'unknown'
}

function toGraphPermissionStatus(
  status: NotificationOsStatus
): GraphNotificationPermissionStatus {
  switch (status) {
    case 'granted':
      return 'GRANTED'
    case 'denied':
      return 'DENIED'
    case 'blocked':
      return 'BLOCKED'
    default:
      return 'UNKNOWN'
  }
}

function isApolloStoreResetInFlightError(message?: string): boolean {
  const normalized = message?.trim().toLowerCase()
  if (!normalized) {
    return false
  }

  return (
    normalized.includes('store reset while query was in flight') ||
    normalized.includes('not completed in link chain')
  )
}

async function ensureInstallationId(): Promise<string> {
  const storedId = asNonEmptyString(
    await AsyncStorage.getItem(INSTALLATION_ID_STORAGE_KEY)
  )

  if (storedId) {
    return storedId
  }

  const installationId = createInstallationId()
  await AsyncStorage.setItem(INSTALLATION_ID_STORAGE_KEY, installationId)
  return installationId
}

async function readCachedDirectMessagesEnabled(): Promise<boolean | undefined> {
  const storedValue = await AsyncStorage.getItem(DIRECT_MESSAGES_CACHE_STORAGE_KEY)

  if (storedValue === 'true') {
    return true
  }

  if (storedValue === 'false') {
    return false
  }

  return undefined
}

async function writeCachedDirectMessagesEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(
    DIRECT_MESSAGES_CACHE_STORAGE_KEY,
    enabled ? 'true' : 'false'
  )
}

async function ensureAndroidMessagesChannel(): Promise<void> {
  if (Platform.OS !== 'android') {
    return
  }

  await Notifications.setNotificationChannelAsync(MESSAGE_CHANNEL_ID, {
    name: 'Messages',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#F43B57'
  })
}

function getConversationIdFromResponse(
  response: Notifications.NotificationResponse
): string | undefined {
  const data = response.notification.request.content.data
  if (!data || typeof data !== 'object') {
    return undefined
  }

  const type = asNonEmptyString((data as Record<string, unknown>).type)
  const conversationId = asNonEmptyString(
    (data as Record<string, unknown>).conversationId
  )

  return type === 'message' ? conversationId : undefined
}

export function useNotifications(): NotificationsContextValue {
  return useContext(NotificationsContext)
}

export function NotificationsProvider({
  authToken,
  userId,
  isAuthenticated,
  controlsRef,
  children
}: Readonly<NotificationsProviderProps>) {
  const router = useRouter()
  const isAvailable = config.pushRegistrationEnabled
  const shouldLoadSettings = isAvailable && isAuthenticated
  const appVersion = asNonEmptyString(Constants.expoConfig?.version)
  const lastNotificationResponse = Notifications.useLastNotificationResponse()

  const [installationId, setInstallationId] = useState<string>()
  const [installationReady, setInstallationReady] = useState(false)
  const [osStatus, setOsStatus] = useState<NotificationOsStatus>('unknown')
  const [permissionReady, setPermissionReady] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [registrationSaving, setRegistrationSaving] = useState(false)
  const [cachedDirectMessagesEnabled, setCachedDirectMessagesEnabled] = useState<
    boolean | undefined
  >(undefined)
  const registeredStateRef = useRef<{
    userId: string
    installationId: string
    expoPushToken: string
  } | null>(null)
  const handledNotificationRef = useRef<Set<string>>(new Set())
  const lastSettingsErrorRef = useRef<string | undefined>(undefined)

  const settingsQuery = useQuery<MeNotificationSettingsQueryData>(
    ME_NOTIFICATION_SETTINGS_QUERY,
    {
      skip: !shouldLoadSettings,
      fetchPolicy: 'cache-and-network',
      notifyOnNetworkStatusChange: true
    }
  )
  const [updateNotificationSettings] = useMutation<
    UpdateNotificationSettingsMutationData,
    UpdateNotificationSettingsMutationVariables
  >(UPDATE_NOTIFICATION_SETTINGS_MUTATION)
  const [upsertPushDevice] = useMutation<
    UpsertPushDeviceMutationData,
    UpsertPushDeviceMutationVariables
  >(UPSERT_PUSH_DEVICE_MUTATION)
  const [removePushDevice] = useMutation<
    RemovePushDeviceMutationData,
    RemovePushDeviceMutationVariables
  >(REMOVE_PUSH_DEVICE_MUTATION)

  const directMessagesEnabled =
    settingsQuery.data?.meNotificationSettings.directMessagesEnabled ??
    cachedDirectMessagesEnabled ??
    false

  const persistDirectMessagesEnabled = useCallback(async (enabled: boolean) => {
    setCachedDirectMessagesEnabled(enabled)

    try {
      await writeCachedDirectMessagesEnabled(enabled)
    } catch (error) {
      captureSentryException(error)
      countSentryMetric('notification_cache_persist_failure', 1, {
        unit: 'attempt',
        attributes: { enabled }
      })
      logSentryError('Notification preference cache persistence failed', {
        enabled,
        error_message: error instanceof Error ? error.message : String(error)
      })
      addSentryBreadcrumb({
        category: 'notifications',
        message: 'Failed to persist cached notification preference',
        level: 'error'
      })
    }
  }, [])

  const writeNotificationSettings = useCallback(
    (enabled: boolean, updatedAt: string) => {
      void persistDirectMessagesEnabled(enabled)
      settingsQuery.client.writeQuery<MeNotificationSettingsQueryData>({
        query: ME_NOTIFICATION_SETTINGS_QUERY,
        data: {
          meNotificationSettings: {
            __typename: 'NotificationSettings',
            directMessagesEnabled: enabled,
            updatedAt
          }
        }
      })
    },
    [persistDirectMessagesEnabled, settingsQuery.client]
  )

  const refreshPermissionStatus = useCallback(async () => {
    if (!isAvailable) {
      setOsStatus('unknown')
      setPermissionReady(true)
      return
    }

    try {
      const permissions = await Notifications.getPermissionsAsync()
      const nextStatus = mapPermissionStatus(permissions)
      setOsStatus(nextStatus)
      addSentryBreadcrumb({
        category: 'notifications',
        message: 'Read notification permission status',
        data: { status: nextStatus }
      })
    } catch (error) {
      console.warn('Failed to read notification permissions', error)
      captureSentryException(error)
      countSentryMetric('notification_permission_status_read_failure', 1, {
        unit: 'attempt'
      })
      logSentryError('Notification permission status read failed', {
        error_message: error instanceof Error ? error.message : String(error)
      })
      setOsStatus('unknown')
    } finally {
      setPermissionReady(true)
    }
  }, [isAvailable])

  const handleNotificationResponse = useCallback(
    (response: Notifications.NotificationResponse) => {
      const conversationId = getConversationIdFromResponse(response)
      if (!conversationId) {
        return
      }

      const responseKey = `${response.notification.request.identifier}:${conversationId}`
      if (handledNotificationRef.current.has(responseKey)) {
        return
      }

      handledNotificationRef.current.add(responseKey)
      addSentryBreadcrumb({
        category: 'notifications',
        message: 'Opened conversation from notification',
        data: { conversationId }
      })
      logSentryInfo('Opened messaging conversation from notification', {
        conversation_id: conversationId
      })
      countSentryMetric('notification_open', 1, {
        unit: 'notification',
        attributes: { type: 'message' }
      })
      router.push(`/messages/${encodeURIComponent(conversationId)}`)
    },
    [router]
  )

  const registerPushDevice = useCallback(
    async (providedToken?: string): Promise<void> => {
      if (
        !isAvailable ||
        !authToken ||
        !userId ||
        !installationId ||
        osStatus !== 'granted' ||
        !directMessagesEnabled
      ) {
        return
      }

      setRegistrationSaving(true)
      const registrationStartedAt = Date.now()

      try {
        await ensureAndroidMessagesChannel()

        addSentryBreadcrumb({
          category: 'notifications',
          message: 'Registering push device',
          data: {
            installationId,
            userId,
            platform: Platform.OS
          }
        })

        const expoPushToken =
          providedToken ??
          (
            await Notifications.getExpoPushTokenAsync({
              projectId: config.easProjectId || undefined
            })
          ).data

        await upsertPushDevice({
          variables: {
            input: {
              installationId,
              expoPushToken,
              platform:
                Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
              permissionStatus: toGraphPermissionStatus(osStatus),
              appVersion: appVersion ?? undefined
            }
          }
        })

        registeredStateRef.current = {
          userId,
          installationId,
          expoPushToken
        }
        countSentryMetric('push_device_register_success', 1, {
          unit: 'device',
          attributes: { platform: Platform.OS }
        })
        distributionSentryMetric(
          'push_device_register_duration',
          Date.now() - registrationStartedAt,
          {
            unit: 'millisecond',
            attributes: { platform: Platform.OS }
          }
        )
        logSentryInfo('Push device registered for direct-message notifications', {
          installation_id: installationId,
          user_id: userId,
          platform: Platform.OS
        })
      } catch (error) {
        console.warn('Failed to upsert push device', error)
        captureSentryException(error)
        countSentryMetric('push_device_register_failure', 1, {
          unit: 'device',
          attributes: { platform: Platform.OS }
        })
        logSentryError('Push device registration failed', {
          installation_id: installationId,
          user_id: userId,
          platform: Platform.OS,
          error_message: error instanceof Error ? error.message : String(error)
        })
        addSentryBreadcrumb({
          category: 'notifications',
          message: 'Push device registration failed',
          data: { installationId, userId },
          level: 'error'
        })
      } finally {
        setRegistrationSaving(false)
      }
    },
    [
      authToken,
      appVersion,
      directMessagesEnabled,
      installationId,
      isAvailable,
      osStatus,
      upsertPushDevice,
      userId
    ]
  )

  const unregisterCurrentDevice = useCallback(async (): Promise<void> => {
    if (!authToken || !userId || !installationId) {
      return
    }

    const currentRegistration = registeredStateRef.current
    if (
      currentRegistration?.userId !== userId ||
      currentRegistration?.installationId !== installationId
    ) {
      return
    }

    try {
      await removePushDevice({
        variables: { installationId }
      })
      registeredStateRef.current = null
      countSentryMetric('push_device_unregister_success', 1, {
        unit: 'device'
      })
      addSentryBreadcrumb({
        category: 'notifications',
        message: 'Push device unregistered',
        data: { installationId, userId }
      })
      logSentryInfo('Push device unregistered', {
        installation_id: installationId,
        user_id: userId
      })
    } catch (error) {
      console.warn('Failed to remove push device', error)
      captureSentryException(error)
      countSentryMetric('push_device_unregister_failure', 1, {
        unit: 'device'
      })
      logSentryError('Push device unregister failed', {
        installation_id: installationId,
        user_id: userId,
        error_message: error instanceof Error ? error.message : String(error)
      })
    }
  }, [authToken, installationId, removePushDevice, userId])

  const requestPermission = useCallback(async (): Promise<NotificationOsStatus> => {
    if (!isAvailable) {
      return 'unknown'
    }

    try {
      const permissions = await Notifications.requestPermissionsAsync()
      const nextStatus = mapPermissionStatus(permissions)
      setOsStatus(nextStatus)
      countSentryMetric('notification_permission_request', 1, {
        unit: 'request',
        attributes: { status: nextStatus }
      })
      const logPermissionStatus =
        nextStatus === 'granted' ? logSentryInfo : logSentryWarn
      logPermissionStatus('Notification permission request resolved', {
        status: nextStatus
      })
      addSentryBreadcrumb({
        category: 'notifications',
        message: 'Requested notification permissions',
        data: { status: nextStatus }
      })
      return nextStatus
    } catch (error) {
      console.warn('Failed to request notification permissions', error)
      captureSentryException(error)
      countSentryMetric('notification_permission_request_failure', 1, {
        unit: 'request'
      })
      logSentryError('Notification permission request failed', {
        error_message: error instanceof Error ? error.message : String(error)
      })
      return 'unknown'
    } finally {
      setPermissionReady(true)
    }
  }, [isAvailable])

  const setDirectMessagesPreference = useCallback(
    async (enabled: boolean) => {
      if (!shouldLoadSettings) {
        return
      }

      let effectiveStatus = osStatus
      if (enabled && effectiveStatus !== 'granted') {
        effectiveStatus = await requestPermission()
        if (effectiveStatus !== 'granted') {
          return
        }
      }

      setSettingsSaving(true)
      const updateStartedAt = Date.now()

      try {
        addSentryBreadcrumb({
          category: 'notifications',
          message: 'Updating direct-message notification setting',
          data: { enabled }
        })
        const optimisticUpdatedAt = new Date().toISOString()
        await persistDirectMessagesEnabled(enabled)
        writeNotificationSettings(enabled, optimisticUpdatedAt)
        const result = await updateNotificationSettings({
          variables: {
            directMessagesEnabled: enabled
          },
          optimisticResponse: {
            updateNotificationSettings: {
              __typename: 'NotificationSettings',
              directMessagesEnabled: enabled,
              updatedAt: optimisticUpdatedAt
            }
          },
          update: (_cache, mutationResult) => {
            const updatedSettings = mutationResult.data?.updateNotificationSettings
            if (!updatedSettings) {
              return
            }

            writeNotificationSettings(
              updatedSettings.directMessagesEnabled,
              updatedSettings.updatedAt
            )
          }
        })

        const updatedSettings = result.data?.updateNotificationSettings
        if (updatedSettings) {
          writeNotificationSettings(
            updatedSettings.directMessagesEnabled,
            updatedSettings.updatedAt
          )
        } else {
          writeNotificationSettings(enabled, optimisticUpdatedAt)
        }

        if (!enabled) {
          await unregisterCurrentDevice()
        }
        countSentryMetric('notification_preference_update_success', 1, {
          unit: 'setting',
          attributes: { enabled, os_status: effectiveStatus }
        })
        distributionSentryMetric(
          'notification_preference_update_duration',
          Date.now() - updateStartedAt,
          {
            unit: 'millisecond',
            attributes: { enabled, os_status: effectiveStatus }
          }
        )
        logSentryInfo('Direct-message notification preference updated', {
          enabled,
          os_status: effectiveStatus
        })
      } catch (error) {
        captureSentryException(error)
        countSentryMetric('notification_preference_update_failure', 1, {
          unit: 'setting',
          attributes: { enabled, os_status: effectiveStatus }
        })
        logSentryError('Direct-message notification preference update failed', {
          enabled,
          os_status: effectiveStatus,
          error_message: error instanceof Error ? error.message : String(error)
        })
        addSentryBreadcrumb({
          category: 'notifications',
          message: 'Failed to update direct-message notification setting',
          data: { enabled },
          level: 'error'
        })
        throw error
      } finally {
        setSettingsSaving(false)
      }
    },
    [
      osStatus,
      persistDirectMessagesEnabled,
      requestPermission,
      shouldLoadSettings,
      unregisterCurrentDevice,
      updateNotificationSettings,
      writeNotificationSettings
    ]
  )

  const openSystemSettings = useCallback(async () => {
    await Linking.openSettings()
  }, [])

  useEffect(() => {
    let cancelled = false

    const bootstrap = async () => {
      try {
        const [stableInstallationId, cachedPreference] = await Promise.all([
          ensureInstallationId(),
          readCachedDirectMessagesEnabled()
        ])
        if (!cancelled) {
          setInstallationId(stableInstallationId)
          setCachedDirectMessagesEnabled(cachedPreference)
        }
      } catch (error) {
        console.warn('Failed to load notification installation state', error)
        captureSentryException(error)
        countSentryMetric('notification_installation_bootstrap_failure', 1, {
          unit: 'attempt'
        })
        logSentryError('Notification installation bootstrap failed', {
          error_message: error instanceof Error ? error.message : String(error)
        })
      } finally {
        if (!cancelled) {
          setInstallationReady(true)
        }
      }
    }

    void bootstrap()
    void refreshPermissionStatus()

    return () => {
      cancelled = true
    }
  }, [refreshPermissionStatus])

  useEffect(() => {
    const nextValue = settingsQuery.data?.meNotificationSettings.directMessagesEnabled
    if (typeof nextValue !== 'boolean') {
      return
    }

    void persistDirectMessagesEnabled(nextValue)
  }, [persistDirectMessagesEnabled, settingsQuery.data?.meNotificationSettings.directMessagesEnabled])

  useEffect(() => {
    if (!shouldLoadSettings || !settingsQuery.error) {
      lastSettingsErrorRef.current = undefined
      return
    }

    const errorKey = settingsQuery.error.message
    if (lastSettingsErrorRef.current === errorKey) {
      return
    }

    lastSettingsErrorRef.current = errorKey

    if (
      isAuthenticationErrorMessage(settingsQuery.error.message) ||
      isApolloStoreResetInFlightError(settingsQuery.error.message)
    ) {
      countSentryMetric('notification_settings_query_skipped', 1, {
        unit: 'attempt',
        attributes: {
          reason: isApolloStoreResetInFlightError(settingsQuery.error.message)
            ? 'apollo_store_sync'
            : 'auth_transition'
        }
      })
      logSentryWarn('Notification settings query skipped during auth transition', {
        error_message: settingsQuery.error.message
      })
      addSentryBreadcrumb({
        category: 'notifications',
        message: 'Skipped notification settings query during auth transition',
        level: 'warning'
      })
      return
    }

    captureSentryException(settingsQuery.error)
    countSentryMetric('notification_settings_query_failure', 1, {
      unit: 'attempt'
    })
    logSentryError('Notification settings query failed', {
      error_message: settingsQuery.error.message
    })
    addSentryBreadcrumb({
      category: 'notifications',
      message: 'Failed to load notification settings',
      level: 'error'
    })
  }, [settingsQuery.error, shouldLoadSettings])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void refreshPermissionStatus()
      }
    })

    return () => {
      subscription.remove()
    }
  }, [refreshPermissionStatus])

  useEffect(() => {
    if (controlsRef) {
      controlsRef.current = {
        unregisterCurrentDevice
      }
    }

    return () => {
      if (controlsRef) {
        controlsRef.current = null
      }
    }
  }, [controlsRef, unregisterCurrentDevice])

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      handleNotificationResponse
    )

    return () => {
      subscription.remove()
    }
  }, [handleNotificationResponse])

  useEffect(() => {
    if (!lastNotificationResponse) {
      return
    }

    handleNotificationResponse(lastNotificationResponse)
  }, [handleNotificationResponse, lastNotificationResponse])

  useEffect(() => {
    if (!shouldLoadSettings || !installationId) {
      return
    }

    const shouldRegister = osStatus === 'granted' && directMessagesEnabled
    if (!shouldRegister) {
      void unregisterCurrentDevice()
      return
    }

    void registerPushDevice()
  }, [
    directMessagesEnabled,
    installationId,
    osStatus,
    registerPushDevice,
    shouldLoadSettings,
    unregisterCurrentDevice
  ])

  useEffect(() => {
    if (!shouldLoadSettings || !installationId) {
      return
    }

    const subscription = Notifications.addPushTokenListener((event) => {
      countSentryMetric('push_token_rotation', 1, {
        unit: 'token'
      })
      logSentryInfo('Expo push token rotated', {
        installation_id: installationId
      })
      void registerPushDevice(event.data)
    })

    return () => {
      subscription.remove()
    }
  }, [installationId, registerPushDevice, shouldLoadSettings])

  const value = useMemo<NotificationsContextValue>(
    () => ({
      isAvailable,
      isReady: installationReady && permissionReady,
      osStatus,
      directMessagesEnabled,
      settingsLoading: shouldLoadSettings ? settingsQuery.loading : false,
      settingsSaving: settingsSaving || registrationSaving,
      requestPermission,
      setDirectMessagesEnabled: setDirectMessagesPreference,
      openSystemSettings,
      refreshPermissionStatus
    }),
    [
      directMessagesEnabled,
      installationReady,
      isAvailable,
      openSystemSettings,
      osStatus,
      permissionReady,
      refreshPermissionStatus,
      registrationSaving,
      requestPermission,
      setDirectMessagesPreference,
      settingsQuery.loading,
      settingsSaving,
      shouldLoadSettings
    ]
  )

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  )
}
