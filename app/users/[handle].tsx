import { ProfileScreen } from '@mereb/app-profile/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useAuth } from '../../providers/AppProviders';

export default function UserProfileScreen() {
  const params = useLocalSearchParams<{ handle?: string | string[] }>();
  const auth = useAuth();
  const router = useRouter();

  const handle = useMemo(() => {
    const raw = Array.isArray(params.handle) ? params.handle[0] : params.handle;
    if (!raw) {
      return undefined;
    }
    return raw.replace(/^@/, '');
  }, [params.handle]);

  return (
    <ProfileScreen
      auth={auth}
      handle={handle}
      onSelectUser={(selectedHandle) => {
        if (!selectedHandle) {
          return;
        }
        router.push(`/users/${encodeURIComponent(selectedHandle.replace(/^@/, ''))}`);
      }}
      onMessageUser={(user) => {
        const search = new URLSearchParams({
          userId: user.id,
          handle: user.handle,
          displayName: user.displayName
        });
        router.push(`/messages/new?${search.toString()}`);
      }}
      onSearchUsers={() => router.push('/people')}
    />
  );
}
