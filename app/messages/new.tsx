import { ComposeMessageScreen } from '@mereb/app-messaging/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../providers/AppProviders';

export default function NewConversationRoute() {
  const router = useRouter();
  const auth = useAuth();
  const params = useLocalSearchParams<{
    userId?: string | string[];
    handle?: string | string[];
    displayName?: string | string[];
  }>();

  const userId = Array.isArray(params.userId) ? params.userId[0] : params.userId;
  const handle = Array.isArray(params.handle) ? params.handle[0] : params.handle;
  const displayName = Array.isArray(params.displayName) ? params.displayName[0] : params.displayName;

  return (
    <ComposeMessageScreen
      auth={auth}
      initialUser={
        userId && handle && displayName
          ? {
              id: userId,
              handle,
              displayName
            }
          : null
      }
      onCreatedConversation={(conversationId) => {
        router.replace(`/messages/${encodeURIComponent(conversationId)}`);
      }}
    />
  );
}
