import { ProfileScreen } from '@mereb/app-profile/native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../providers/AppProviders';

export default function ProfileTabScreen() {
  const auth = useAuth();
  const router = useRouter();

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
    />
  );
}
