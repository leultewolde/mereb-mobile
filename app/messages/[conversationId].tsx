import { ConversationScreen } from '@mereb/app-messaging/native';
import { useLocalSearchParams } from 'expo-router';
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

export default function ConversationRoute() {
  const params = useLocalSearchParams<{ conversationId?: string | string[] }>();
  const auth = useAuth();
  const conversationId = Array.isArray(params.conversationId) ? params.conversationId[0] : params.conversationId;

  if (!conversationId) {
    return null;
  }

  return (
    <ConversationScreen
      auth={auth}
      conversationId={conversationId}
      monitoring={messagingMonitoring}
    />
  );
}
