import { ConversationScreen, type ConversationHeaderInfo } from '@mereb/app-messaging/native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { tokens } from '@mereb/tokens/native';
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

const { color, spacing } = tokens;

export default function ConversationRoute() {
  const params = useLocalSearchParams<{ conversationId?: string | string[] }>();
  const auth = useAuth();
  const conversationId = Array.isArray(params.conversationId) ? params.conversationId[0] : params.conversationId;
  const [headerInfo, setHeaderInfo] = useState<ConversationHeaderInfo | null>(null);

  const handleHeaderInfoChange = useCallback((info: ConversationHeaderInfo) => {
    setHeaderInfo(info);
  }, []);

  if (!conversationId) {
    return null;
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: () =>
            headerInfo ? (
              <View style={styles.headerTitleRow}>
                {headerInfo.avatarUrl ? (
                  <Image source={{ uri: headerInfo.avatarUrl }} style={styles.headerAvatar} />
                ) : (
                  <View style={[styles.headerAvatar, styles.headerAvatarFallback]}>
                    <Text style={styles.headerAvatarFallbackText}>{headerInfo.initial}</Text>
                  </View>
                )}
                <Text style={styles.headerTitleText} numberOfLines={1}>
                  {headerInfo.title}
                </Text>
              </View>
            ) : (
              <Text style={styles.headerTitleText}>Conversation</Text>
            )
        }}
      />
      <ConversationScreen
        auth={auth}
        conversationId={conversationId}
        monitoring={messagingMonitoring}
        onHeaderInfoChange={handleHeaderInfoChange}
      />
    </>
  );
}

const styles = StyleSheet.create({
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: 220
  },
  headerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: color.surfaceAlt
  },
  headerAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.primary
  },
  headerAvatarFallbackText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600'
  },
  headerTitleText: {
    fontSize: 16,
    fontWeight: '600',
    color: color.text,
    flexShrink: 1
  }
});
