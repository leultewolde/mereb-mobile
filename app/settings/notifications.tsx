import { tokens } from '@mereb/tokens/native'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View
} from 'react-native'
import { useCallback } from 'react'
import { useNotifications } from '../../providers/Notifications'

function getStatusTitle(status: ReturnType<typeof useNotifications>['osStatus']): string {
  switch (status) {
    case 'granted':
      return 'Enabled'
    case 'blocked':
      return 'Blocked in system settings'
    default:
      return 'Not enabled'
  }
}

function getStatusBody(status: ReturnType<typeof useNotifications>['osStatus']): string {
  switch (status) {
    case 'granted':
      return 'Push permissions are enabled. Direct-message alerts can be managed below.'
    case 'blocked':
      return 'Notifications are blocked at the OS level. Open system settings to re-enable them.'
    default:
      return 'Enable notifications to receive direct-message alerts on this device.'
  }
}

export default function NotificationsSettingsScreen() {
  const notifications = useNotifications()
  const notificationsEnabled = notifications.osStatus === 'granted'

  const handleOpenSystemSettings = useCallback(() => {
    notifications.openSystemSettings().catch((error: unknown) => {
      if (__DEV__) {
        console.warn('Failed to open system settings', error)
      }
    })
  }, [notifications])

  const handleRequestPermission = useCallback(() => {
    notifications.requestPermission().catch((error: unknown) => {
      if (__DEV__) {
        console.warn('Failed to request notification permissions', error)
      }
    })
  }, [notifications])

  const handleDirectMessagesToggle = useCallback((value: boolean) => {
    notifications.setDirectMessagesEnabled(value).catch((error: unknown) => {
      if (__DEV__) {
        console.warn('Failed to update direct-message preference', error)
      }
    })
  }, [notifications])

  if (!notifications.isAvailable) {
    return (
      <View style={styles.centeredContainer}>
        <View style={styles.card}>
          <Text style={styles.title}>Notifications unavailable</Text>
          <Text style={styles.body}>
            Push notifications are disabled for this environment.
          </Text>
        </View>
      </View>
    )
  }

  let actionButton = null
  if (!notificationsEnabled) {
    actionButton =
      notifications.osStatus === 'blocked' ? (
        <Pressable
          accessibilityRole="button"
          onPress={handleOpenSystemSettings}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>Open system settings</Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={handleRequestPermission}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>Enable notifications</Text>
        </Pressable>
      )
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>Push notifications</Text>
        <Text style={styles.body}>{getStatusBody(notifications.osStatus)}</Text>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>OS status</Text>
          <Text style={styles.statusValue}>
            {getStatusTitle(notifications.osStatus)}
          </Text>
        </View>
        <View style={styles.actionsRow}>{actionButton}</View>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Direct messages</Text>
        <Text style={styles.body}>
          Receive a push notification when someone sends you a new direct
          message.
        </Text>
        <View style={styles.preferenceRow}>
          <View style={styles.preferenceCopy}>
            <Text style={styles.preferenceTitle}>Direct-message alerts</Text>
            <Text style={styles.preferenceBody}>
              Notification delivery is controlled per account and synced through
              the backend.
            </Text>
          </View>
          <Switch
            disabled={
              !notificationsEnabled ||
              notifications.settingsLoading ||
              notifications.settingsSaving
            }
            onValueChange={handleDirectMessagesToggle}
            value={notifications.directMessagesEnabled}
          />
        </View>
        {!notificationsEnabled ? (
          <Text style={styles.mutedText}>
            Enable OS notifications first to manage direct-message alerts.
          </Text>
        ) : null}
        {notifications.settingsLoading || notifications.settingsSaving ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator />
            <Text style={styles.mutedText}>Syncing notification settings…</Text>
          </View>
        ) : null}
      </View>
    </ScrollView>
  )
}

const { color, radius, shadow, spacing } = tokens

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: color.surfaceAlt
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: color.surfaceAlt
  },
  card: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    gap: spacing.md,
    ...shadow.sm
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: color.text
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: color.textMuted
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: color.text
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '700',
    color: color.primary
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  primaryButton: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: color.primary
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: color.surface
  },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md
  },
  preferenceCopy: {
    flex: 1,
    gap: spacing.xs
  },
  preferenceTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: color.text
  },
  preferenceBody: {
    fontSize: 14,
    lineHeight: 20,
    color: color.textMuted
  },
  mutedText: {
    fontSize: 14,
    lineHeight: 20,
    color: color.textMuted
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  }
})
