import { PeopleScreen } from '@mereb/app-profile/native';
import { useRouter } from 'expo-router';

export default function PeopleTabScreen() {
  const router = useRouter();

  return (
    <PeopleScreen
      onSelectUser={(handle) => {
        if (!handle) {
          return;
        }
        router.push(`/users/${encodeURIComponent(handle.replace(/^@/, ''))}`);
      }}
      onMessageUser={(user) => {
        const search = new URLSearchParams({
          userId: user.id,
          handle: user.handle,
          displayName: user.displayName
        });
        router.push(`/messages/new?${search.toString()}`);
      }}
    />
  );
}
