import { Stack, useNavigationContainerRef, useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AppProviders } from '../providers/AppProviders'
import { AuthGate } from '../components/AuthGate'
import {
  initializeSentry,
  registerSentryNavigationContainer,
  wrapSentryExpoRouter,
  withSentryRoot
} from '../monitoring/sentry'

initializeSentry()

function RootLayout() {
  const navigationRef = useNavigationContainerRef()
  const router = useRouter()

  useEffect(() => {
    registerSentryNavigationContainer(navigationRef)
  }, [navigationRef])

  useEffect(() => {
    wrapSentryExpoRouter(router)
  }, [router])

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AppProviders>
        <AuthGate>
          <Stack
            screenOptions={{
              headerShadowVisible: false,
              headerTitleAlign: 'center',
              headerBackButtonDisplayMode: 'minimal',
              headerBackTitle: ''
            }}
          >
            <Stack.Screen
              name="(tabs)"
              options={{ headerTitle: 'Mereb Social', headerShown: false }}
            />
            <Stack.Screen
              name="users/[handle]"
              options={{ headerTitle: 'Profile' }}
            />
            <Stack.Screen
              name="post/[postId]"
              options={{ headerTitle: 'Post' }}
            />
            <Stack.Screen
              name="search/users"
              options={{ headerTitle: 'Search users' }}
            />
            <Stack.Screen
              name="messages/[conversationId]"
              options={{ headerTitle: 'Conversation' }}
            />
            <Stack.Screen
              name="messages/new"
              options={{ headerTitle: 'New conversation' }}
            />
            <Stack.Screen
              name="settings/notifications"
              options={{ headerTitle: 'Notifications' }}
            />
            <Stack.Screen
              name="register/invite"
              options={{ headerTitle: 'Redeem invite' }}
            />
            <Stack.Screen
              name="oauth2redirect/[provider]"
              options={{ headerShown: false }}
            />
          </Stack>
        </AuthGate>
      </AppProviders>
    </SafeAreaProvider>
  )
}

export default withSentryRoot(RootLayout)
