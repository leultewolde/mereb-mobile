import { MessagesScreen } from '@mereb/app-messaging/native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../providers/AppProviders';

export default function MessagesTabScreen() {
  const router = useRouter();
  const auth = useAuth();

  return (
    <MessagesScreen
      auth={auth}
      onCompose={() => router.push('/messages/new')}
      onSelectConversation={(conversationId) => {
        if (!conversationId) {
          return;
        }
        router.push(`/messages/${encodeURIComponent(conversationId)}`);
      }}
    />
  );
}
