declare module '@mereb/app-messaging/native' {
  import type { JSX } from 'react'

  type AuthControls = {
    token?: string
    login?: () => Promise<void>
  }

  type MessagingUser = {
    id: string
    handle: string
    displayName: string
  }

  export type MessagesScreenProps = {
    auth?: AuthControls
    onSelectConversation?: (conversationId: string) => void
    onCompose?: () => void
  }

  export type ConversationScreenProps = {
    auth?: AuthControls
    conversationId: string
  }

  export type ComposeMessageScreenProps = {
    auth?: AuthControls
    onCreatedConversation?: (conversationId: string) => void
    initialUser?: MessagingUser | null
  }

  export function MessagesScreen(props: Readonly<MessagesScreenProps>): JSX.Element
  export function ConversationScreen(props: Readonly<ConversationScreenProps>): JSX.Element
  export function ComposeMessageScreen(props: Readonly<ComposeMessageScreenProps>): JSX.Element
}
