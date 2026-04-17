import { MessagesScreen } from '@mereb/app-messaging/native';
import { useRouter } from 'expo-router';
import {
  countSentryMetric,
  distributionSentryMetric,
  gaugeSentryMetric,
  logSentryError,
  logSentryInfo,
  logSentryWarn
} from '../../monitoring/sentry';
import { useAuth } from '../../providers/AppProviders';

const messagingMonitoring = {
  countMetric: countSentryMetric,
  gaugeMetric: gaugeSentryMetric,
  distributionMetric: distributionSentryMetric,
  info: logSentryInfo,
  warn: logSentryWarn,
  error: logSentryError
};

export default function MessagesTabScreen() {
  const router = useRouter();
  const auth = useAuth();

  return (
    <MessagesScreen
      auth={auth}
      monitoring={messagingMonitoring}
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
