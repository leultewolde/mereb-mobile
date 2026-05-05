import { Tabs, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { tokens } from '@mereb/tokens/native'
import { Pressable } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { config } from '@mobile/config'

type TabIconProps = {
  color: string
  focused: boolean
}

function FeedTabIcon({ color, focused }: Readonly<TabIconProps>) {
  return (
    <Ionicons
      name={focused ? 'home' : 'home-outline'}
      size={22}
      color={color}
    />
  )
}

function PeopleTabIcon({ color, focused }: Readonly<TabIconProps>) {
  return (
    <Ionicons
      name={focused ? 'people' : 'people-outline'}
      size={22}
      color={color}
    />
  )
}

function MessagesTabIcon({ color, focused }: Readonly<TabIconProps>) {
  return (
    <Ionicons
      name={focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'}
      size={22}
      color={color}
    />
  )
}

function ProfileTabIcon({ color, focused }: Readonly<TabIconProps>) {
  return (
    <Ionicons
      name={focused ? 'person-circle' : 'person-circle-outline'}
      size={22}
      color={color}
    />
  )
}

function NotificationSettingsButton() {
  const { color } = tokens
  const router = useRouter()

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Notification settings"
      hitSlop={12}
      onPress={() => {
        router.push('/settings/notifications')
      }}
      style={{ marginRight: 16 }}
    >
      <Ionicons
        name="notifications-outline"
        size={22}
        color={color.text}
      />
    </Pressable>
  )
}

export function AppTabsLayout() {
  const { color } = tokens
  const insets = useSafeAreaInsets()

  return (
    <Tabs
      screenOptions={{
        headerTitleAlign: 'center',
        tabBarActiveTintColor: color.primary,
        tabBarInactiveTintColor: color.textSubdued,
        tabBarStyle: {
          backgroundColor: color.surfaceAlt,
          borderTopColor: color.borderStrong,
          height: 62 + insets.bottom,
          paddingBottom: 10 + insets.bottom,
          paddingTop: 8
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600'
        }
      }}
    >
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Feed',
          tabBarIcon: FeedTabIcon
        }}
      />
      <Tabs.Screen
        name="people"
        options={{
          title: 'People',
          tabBarIcon: PeopleTabIcon
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: MessagesTabIcon
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          headerRight: config.pushRegistrationEnabled
            ? NotificationSettingsButton
            : undefined,
          tabBarIcon: ProfileTabIcon
        }}
      />
    </Tabs>
  )
}
