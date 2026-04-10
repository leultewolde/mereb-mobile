declare module '@mereb/app-feed/native' {
  import type { JSX } from 'react'

  export type FeedScreenProps = {
    onSelectAuthor?: (handle: string) => void
    onSelectPost?: (postId: string) => void
  }

  export type PostDetailsScreenProps = {
    postId: string
    onSelectAuthor?: (handle: string) => void
  }

  export function FeedScreen(props: Readonly<FeedScreenProps>): JSX.Element
  export function PostDetailsScreen(props: Readonly<PostDetailsScreenProps>): JSX.Element
}
