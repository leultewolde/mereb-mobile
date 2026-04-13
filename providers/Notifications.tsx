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

const INSTALLATION_ID_STORAGE_KEY = 'notifications.installationId'
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
    directMessagesEnabled: boolean
    updatedAt: string
  }
}

type UpdateNotificationSettingsMutationData = {
  updateNotificationSettings: {
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
  const registeredStateRef = useRef<{
    userId: string
    installationId: string
    expoPushToken: string
  } | null>(null)
  const handledNotificationRef = useRef<Set<string>>(new Set())

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
    settingsQuery.data?.meNotificationSettings.directMessagesEnabled ?? false

  const refreshPermissionStatus = useCallback(async () => {
    if (!isAvailable) {
      setOsStatus('unknown')
      setPermissionReady(true)
      return
    }

    try {
      const permissions = await Notifications.getPermissionsAsync()
      setOsStatus(mapPermissionStatus(permissions))
    } catch (error) {
      if (__DEV__) {
        console.warn('Failed to read notification permissions', error)
      }
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

      try {
        await ensureAndroidMessagesChannel()

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
      } catch (error) {
        if (__DEV__) {
          console.warn('Failed to upsert push device', error)
        }
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
    } catch (error) {
      if (__DEV__) {
        console.warn('Failed to remove push device', error)
      }
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
      return nextStatus
    } catch (error) {
      if (__DEV__) {
        console.warn('Failed to request notification permissions', error)
      }
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

      try {
        await updateNotificationSettings({
          variables: {
            directMessagesEnabled: enabled
          }
        })

        await settingsQuery.refetch()

        if (!enabled) {
          await unregisterCurrentDevice()
        }
      } finally {
        setSettingsSaving(false)
      }
    },
    [
      osStatus,
      requestPermission,
      settingsQuery,
      shouldLoadSettings,
      unregisterCurrentDevice,
      updateNotificationSettings
    ]
  )

  const openSystemSettings = useCallback(async () => {
    await Linking.openSettings()
  }, [])

  useEffect(() => {
    let cancelled = false

    const bootstrap = async () => {
      try {
        const stableInstallationId = await ensureInstallationId()
        if (!cancelled) {
          setInstallationId(stableInstallationId)
        }
      } catch (error) {
        if (__DEV__) {
          console.warn('Failed to load notification installation ID', error)
        }
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
