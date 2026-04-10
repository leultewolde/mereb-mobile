import { FeedScreen } from '@mereb/app-feed/native';
import { useRouter } from 'expo-router';

export default function FeedTabScreen() {
  const router = useRouter();

  return (
    <FeedScreen
      onSelectAuthor={(handle) => {
        if (!handle) {
          return;
        }
        router.push(`/users/${encodeURIComponent(handle.replace(/^@/, ''))}`);
      }}
      onSelectPost={(postId) => {
        if (!postId) {
          return;
        }
        router.push(`/post/${encodeURIComponent(postId)}`);
      }}
    />
  );
}
