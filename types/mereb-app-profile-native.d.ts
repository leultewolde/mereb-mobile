declare module '@mereb/app-profile/native' {
  import type { JSX } from 'react'

  type AuthControls = {
    token?: string
    login?: () => Promise<void>
    logout?: () => Promise<void>
  }

  type MessagingUser = {
    id: string
    handle: string
    displayName: string
  }

  export type ProfileScreenProps = {
    auth?: AuthControls
    handle?: string
    onMessageUser?: (user: MessagingUser) => void
    onSearchUsers?: () => void
    onSelectUser?: (handle: string) => void
    onOpenPrivacyPolicy?: () => void
    onOpenSupport?: () => void
  }

  export type PeopleScreenProps = {
    onSelectUser?: (handle: string) => void
    onMessageUser?: (user: MessagingUser) => void
  }

  export function ProfileScreen(props: Readonly<ProfileScreenProps>): JSX.Element
  export function PeopleScreen(props: Readonly<PeopleScreenProps>): JSX.Element
}
