import { Stack } from 'expo-router';
import { AppProviders } from '../providers/AppProviders';
import { AuthGate } from '../components/AuthGate';

export default function RootLayout() {
  return (
    <AppProviders>
      <AuthGate>
        <Stack
          screenOptions={{
            headerShadowVisible: false,
            headerTitleAlign: 'center'
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
  );
}
