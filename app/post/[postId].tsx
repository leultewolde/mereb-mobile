import { PostDetailsScreen } from '@mereb/app-feed/native';
import { useLocalSearchParams, useRouter } from 'expo-router';

export default function PostRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ postId?: string | string[] }>();
  const postId = Array.isArray(params.postId) ? params.postId[0] : params.postId;

  if (!postId) {
    return null;
  }

  return (
    <PostDetailsScreen
      postId={postId}
      onSelectAuthor={(handle) => {
        if (!handle) {
          return;
        }
        router.push(`/users/${encodeURIComponent(handle.replace(/^@/, ''))}`);
      }}
    />
  );
}
