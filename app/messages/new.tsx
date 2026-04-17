import { ComposeMessageScreen } from '@mereb/app-messaging/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
      monitoring={messagingMonitoring}
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
