import { ConversationScreen } from '@mereb/app-messaging/native';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../providers/AppProviders';

export default function ConversationRoute() {
  const params = useLocalSearchParams<{ conversationId?: string | string[] }>();
  const auth = useAuth();
  const conversationId = Array.isArray(params.conversationId) ? params.conversationId[0] : params.conversationId;

  if (!conversationId) {
    return null;
  }

  return <ConversationScreen auth={auth} conversationId={conversationId} />;
}
