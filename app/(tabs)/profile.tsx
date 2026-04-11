import { ProfileScreen } from '@mereb/app-profile/native';
import { useRouter } from 'expo-router';
import { Linking } from 'react-native';
import { config } from '@mobile/config';
import { useAuth } from '../../providers/AppProviders';

export default function ProfileTabScreen() {
  const auth = useAuth();
  const router = useRouter();
  const openExternalUrl = (url: string) => {
    if (!url.trim()) {
      return;
    }

    void Linking.openURL(url).catch((error) => {
      if (__DEV__) {
        console.warn(`Failed to open external URL: ${url}`, error);
      }
    });
  };

  return (
    <ProfileScreen
      auth={auth}
      onSelectUser={(handle) => {
        if (!handle) {
          return;
        }
        router.push(`/users/${encodeURIComponent(handle.replace(/^@/, ''))}`);
      }}
      onSearchUsers={() => router.push('/people')}
      onMessageUser={(user) => {
        const params = new URLSearchParams({
          userId: user.id,
          handle: user.handle,
          displayName: user.displayName
        });
        router.push(`/messages/new?${params.toString()}`);
      }}
      onOpenPrivacyPolicy={() => openExternalUrl(config.privacyUrl)}
      onOpenSupport={() => openExternalUrl(config.supportUrl)}
    />
  );
}
