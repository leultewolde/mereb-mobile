import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const useNotificationsMock = vi.fn()

vi.mock('../../providers/Notifications', () => ({
  useNotifications: useNotificationsMock
}))

type NotificationContextMock = ReturnType<typeof useNotificationsMock>

function createNotificationsValue(
  overrides: Partial<NotificationContextMock> = {}
): NotificationContextMock {
  return {
    isAvailable: true,
    isReady: true,
    osStatus: 'granted',
    directMessagesEnabled: true,
    settingsLoading: false,
    settingsSaving: false,
    requestPermission: vi.fn(async () => 'granted'),
    setDirectMessagesEnabled: vi.fn(async () => undefined),
    openSystemSettings: vi.fn(async () => undefined),
    refreshPermissionStatus: vi.fn(async () => undefined),
    ...overrides
  }
}

describe('NotificationsSettingsScreen', () => {
  beforeEach(() => {
    useNotificationsMock.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the unavailable state when push registration is disabled', async () => {
    useNotificationsMock.mockReturnValue(
      createNotificationsValue({
        isAvailable: false
      })
    )

    const { render } = await import('@testing-library/react-native/pure')
    const { default: NotificationsSettingsScreen } = await import('../../app/settings/notifications')
    const view = render(<NotificationsSettingsScreen />)

    expect(view.getByText('Notifications unavailable')).toBeTruthy()

    view.unmount()
  })

  it('opens system settings when notifications are blocked', async () => {
    const value = createNotificationsValue({
      osStatus: 'blocked',
      directMessagesEnabled: false
    })
    useNotificationsMock.mockReturnValue(value)

    const { act, fireEvent, render, waitFor } = await import('@testing-library/react-native/pure')
    const { default: NotificationsSettingsScreen } = await import('../../app/settings/notifications')
    const view = render(<NotificationsSettingsScreen />)
    const button = view.getByText('Open system settings')

    await act(async () => {
      fireEvent.press(button)
    })

    await waitFor(() => {
      expect(value.openSystemSettings).toHaveBeenCalled()
    })

    view.unmount()
  })

  it('requests permission when OS notifications are not enabled', async () => {
    const value = createNotificationsValue({
      osStatus: 'denied',
      directMessagesEnabled: false
    })
    useNotificationsMock.mockReturnValue(value)

    const { act, fireEvent, render, waitFor } = await import('@testing-library/react-native/pure')
    const { default: NotificationsSettingsScreen } = await import('../../app/settings/notifications')
    const view = render(<NotificationsSettingsScreen />)
    const button = view.getByText('Enable notifications')

    await act(async () => {
      fireEvent.press(button)
    })

    await waitFor(() => {
      expect(value.requestPermission).toHaveBeenCalled()
    })

    view.unmount()
  })

  it('updates the direct-message toggle when notifications are enabled', async () => {
    const value = createNotificationsValue({
      osStatus: 'granted',
      directMessagesEnabled: true
    })
    useNotificationsMock.mockReturnValue(value)

    const { act, fireEvent, render, waitFor } = await import('@testing-library/react-native/pure')
    const { default: NotificationsSettingsScreen } = await import('../../app/settings/notifications')
    const view = render(<NotificationsSettingsScreen />)
    const toggle = view.UNSAFE_getByProps({
      value: true,
      disabled: false
    })

    expect(toggle.props.value).toBe(true)
    expect(toggle.props.disabled).toBe(false)

    await act(async () => {
      fireEvent(toggle, 'valueChange', false)
    })

    await waitFor(() => {
      expect(value.setDirectMessagesEnabled).toHaveBeenCalledWith(false)
    })

    view.unmount()
  })
})
