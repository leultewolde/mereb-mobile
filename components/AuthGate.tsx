import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import type { PropsWithChildren } from 'react'
import { usePathname, useRouter } from 'expo-router'
import { tokens } from '@mereb/tokens/native'
import { config } from '@mobile/config'
import { useAuth } from '../providers/AppProviders'
import { type PublicFlags, useFlags } from '../providers/Flags'

type RegistrationAction = 'invite' | 'self-register' | 'none'

function AuthButton({ label, onPress, variant = 'primary', disabled = false }: Readonly<{
  label: string
  onPress: () => void
  variant?: 'primary' | 'secondary'
  disabled?: boolean
}>) {
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' ? styles.primaryButton : styles.secondaryButton,
        disabled ? styles.buttonDisabled : undefined,
        pressed && !disabled ? styles.buttonPressed : undefined
      ]}
      onPress={disabled ? undefined : onPress}
    >
      <Text style={variant === 'primary' ? styles.primaryLabel : styles.secondaryLabel}>{label}</Text>
    </Pressable>
  )
}

function resolveRegistrationAction(
  accountCreationEnabled: boolean,
  inviteOnlyRegistration: boolean
): RegistrationAction {
  if (!accountCreationEnabled) {
    return 'none'
  }

  return inviteOnlyRegistration ? 'invite' : 'self-register'
}

function openExternalUrl(url: string) {
  if (!url.trim()) {
    return
  }

  void Linking.openURL(url).catch((error) => {
    if (__DEV__) {
      console.warn(`Failed to open external URL: ${url}`, error)
    }
  })
}

type UnauthenticatedViewProps = {
  registrationAction: RegistrationAction
  flags: PublicFlags
  flagsLoading: boolean
  flagsError?: string
  isAuthConfigured: boolean
  missingConfigKeys: string[]
  login: () => Promise<void>
  register: () => Promise<void>
  openInviteRoute: () => void
}

function UnauthenticatedView({
  registrationAction,
  flags,
  flagsLoading,
  flagsError,
  isAuthConfigured,
  missingConfigKeys,
  login,
  register,
  openInviteRoute
}: Readonly<UnauthenticatedViewProps>) {
  const accountCreationDisabled =
    !flagsLoading && !flagsError && !flags.mobileAccountCreationEnabled

  return (
    <View style={styles.authShell}>
      <View style={styles.authCard}>
        <Text style={styles.title}>Welcome to Mereb Social</Text>
        <Text style={styles.subtitle}>
          Sign in to collaborate with your teams, access announcements, and keep your profile, feed, and messages in sync with the same infrastructure as the web app.
        </Text>

        <View style={styles.buttonGroup}>
          <AuthButton label="Log in" onPress={() => void login()} />
          <View style={styles.buttonSpacer} />
          {registrationAction === 'invite' ? (
            <AuthButton
              label="Redeem invite code"
              variant="secondary"
              onPress={openInviteRoute}
            />
          ) : null}
          {registrationAction === 'self-register' ? (
            <AuthButton
              label="Register as a member"
              variant="secondary"
              onPress={() => void register()}
            />
          ) : null}
        </View>

        {flagsError ? (
          <Text style={styles.notice}>Registration status unavailable: {flagsError}</Text>
        ) : null}
        {isAuthConfigured ? null : (
            <Text style={styles.notice}>Missing auth config: {missingConfigKeys.join(', ')}</Text>
        )}
        {accountCreationDisabled ? (
          <Text style={styles.notice}>
            Mobile beta access is currently login-only. Contact support if your account still needs onboarding.
          </Text>
        ) : null}
        <Text style={styles.notice}>
          Admin accounts are provisioned through a secure operations workflow. Contact the platform operations team to request elevated access.
        </Text>
        <View style={styles.linkRow}>
          <Pressable accessibilityRole="button" onPress={() => openExternalUrl(config.supportUrl)}>
            <Text style={styles.linkLabel}>Support</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => openExternalUrl(config.privacyUrl)}>
            <Text style={styles.linkLabel}>Privacy policy</Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}

export function AuthGate({ children }: Readonly<PropsWithChildren>) {
  const pathname = usePathname()
  const router = useRouter()
  const { isReady, isAuthenticated, login, register, isAuthConfigured, missingConfigKeys } = useAuth()
  const { flags, loading: flagsLoading, error: flagsError } = useFlags()

  const isPublicRoute = pathname === '/register/invite'
  const accountCreationEnabled = !flagsLoading && !flagsError && flags.mobileAccountCreationEnabled
  const registrationAction = resolveRegistrationAction(
    accountCreationEnabled,
    flags.inviteOnlyRegistration
  )

  if (isPublicRoute) {
    return <>{children}</>
  }

  if (!isReady) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" />
        <Text style={styles.subtleText}>Preparing secure session…</Text>
      </View>
    )
  }

  if (!isAuthenticated) {
    return (
      <UnauthenticatedView
        registrationAction={registrationAction}
        flags={flags}
        flagsLoading={flagsLoading}
        flagsError={flagsError}
        isAuthConfigured={isAuthConfigured}
        missingConfigKeys={missingConfigKeys}
        login={login}
        register={register}
        openInviteRoute={() => router.push('/register/invite')}
      />
    )
  }

  return <>{children}</>
}

const { color, radius, shadow, spacing } = tokens

const styles = StyleSheet.create({
  centeredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surfaceAlt
  },
  subtleText: {
    marginTop: 16,
    fontSize: 14,
    color: color.textMuted
  },
  authShell: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: color.surfaceAlt
  },
  authCard: {
    borderRadius: radius.xl,
    padding: spacing.xxl,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    ...shadow.lg
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: color.text
  },
  subtitle: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 20,
    color: color.textMuted
  },
  buttonGroup: {
    marginTop: 24
  },
  buttonSpacer: {
    height: 12
  },
  button: {
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center'
  },
  primaryButton: {
    backgroundColor: color.primary
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.surface
  },
  buttonPressed: {
    opacity: 0.85
  },
  buttonDisabled: {
    opacity: 0.5
  },
  primaryLabel: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600'
  },
  secondaryLabel: {
    color: color.text,
    fontSize: 15,
    fontWeight: '600'
  },
  notice: {
    marginTop: 20,
    fontSize: 12,
    lineHeight: 18,
    color: color.textSubdued
  },
  linkRow: {
    marginTop: 18,
    flexDirection: 'row',
    gap: spacing.lg
  },
  linkLabel: {
    color: color.primary,
    fontSize: 13,
    fontWeight: '600'
  }
})
