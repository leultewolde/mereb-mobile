import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { Redirect, useRouter } from 'expo-router'
import { config } from '@mobile/config'
import { tokens } from '@mereb/tokens/native'
import { useAuth } from '../../providers/AppProviders'
import { useFlags } from '../../providers/Flags'

type InviteRegistrationForm = {
  code: string
  email: string
  username: string
  firstName: string
  lastName: string
  displayName: string
  password: string
}

function validateForm(form: InviteRegistrationForm): string | undefined {
  if (!form.code.trim()) return 'Enter your invite code.'
  if (!form.email.trim()) return 'Enter the email address that should own this account.'
  if (!form.username.trim()) return 'Choose a username for this account.'
  if (!form.firstName.trim()) return "Enter the account holder's first name."
  if (!form.lastName.trim()) return "Enter the account holder's last name."
  if (!form.displayName.trim()) return 'Enter the display name that should appear on your profile.'
  if (!form.password.trim()) return 'Enter a password for the new account.'
  if (form.password.trim().length < 8) return 'Passwords must be at least 8 characters.'
  return undefined
}

function Field({
  label,
  value,
  onChangeText,
  secureTextEntry = false,
  autoCapitalize = 'none'
}: Readonly<{
  label: string
  value: string
  onChangeText: (value: string) => void
  secureTextEntry?: boolean
  autoCapitalize?: 'none' | 'words' | 'sentences' | 'characters'
}>) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        autoCapitalize={autoCapitalize}
        secureTextEntry={secureTextEntry}
        style={styles.input}
      />
    </View>
  )
}

function ActionButton({
  label,
  onPress,
  disabled = false,
  variant = 'primary'
}: Readonly<{
  label: string
  onPress: () => void
  disabled?: boolean
  variant?: 'primary' | 'secondary'
}>) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' ? styles.primaryButton : styles.secondaryButton,
        disabled ? styles.disabledButton : undefined,
        pressed && !disabled ? styles.pressedButton : undefined
      ]}
    >
      <Text style={variant === 'primary' ? styles.primaryButtonText : styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  )
}

export default function InviteRedeemScreen() {
  const router = useRouter()
  const { isAuthenticated, login } = useAuth()
  const { flags, loading, error } = useFlags()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string>()
  const [submitSuccess, setSubmitSuccess] = useState<string>()
  const [form, setForm] = useState<InviteRegistrationForm>({
    code: '',
    email: '',
    username: '',
    firstName: '',
    lastName: '',
    displayName: '',
    password: ''
  })

  const inviteOnlyEnabled = Boolean(flags.inviteOnlyRegistration)
  const inviteRedeemUrl = useMemo(() => config.inviteRedeemUrl, [])

  useEffect(() => {
    if (submitSuccess) {
      const timeout = setTimeout(() => {
        setSubmitSuccess(undefined)
      }, 4000)

      return () => clearTimeout(timeout)
    }
  }, [submitSuccess])

  if (isAuthenticated) {
    return <Redirect href="/(tabs)/feed" />
  }

  const update = <K extends keyof InviteRegistrationForm>(key: K, value: InviteRegistrationForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const handleSubmit = async () => {
    const validationMessage = validateForm(form)
    if (validationMessage) {
      setSubmitSuccess(undefined)
      setSubmitError(validationMessage)
      return
    }

    setIsSubmitting(true)
    setSubmitError(undefined)
    setSubmitSuccess(undefined)

    try {
      const response = await fetch(inviteRedeemUrl, {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          code: form.code.trim(),
          email: form.email.trim(),
          username: form.username.trim(),
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          displayName: form.displayName.trim(),
          password: form.password
        })
      })

      const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!response.ok) {
        throw new Error(payload.error || payload.message || `Invite redemption failed (${response.status})`)
      }

      setSubmitSuccess('Invite redeemed. Continue to sign in with the account you just created.')
      setForm((current) => ({
        ...current,
        code: '',
        password: ''
      }))
    } catch (nextError) {
      setSubmitError(nextError instanceof Error ? nextError.message : 'Invite redemption failed.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>Redeem invite code</Text>
        <Text style={styles.subtitle}>
          Invite-only onboarding uses the same backend workflow as the web app. Provide the full identity details for the new account, then sign in normally.
        </Text>

        {loading ? (
          <View style={styles.inlineState}>
            <ActivityIndicator />
            <Text style={styles.subtleText}>Checking registration policy…</Text>
          </View>
        ) : null}
        {error ? <Text style={styles.notice}>{error}</Text> : null}
        {!loading && !error && !inviteOnlyEnabled ? (
          <Text style={styles.notice}>
            Invite-based onboarding is not enabled for this environment right now.
          </Text>
        ) : null}
        {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}
        {submitSuccess ? <Text style={styles.successText}>{submitSuccess}</Text> : null}

        <Field label="Invite code" value={form.code} onChangeText={(value) => update('code', value)} />
        <Field label="Email" value={form.email} onChangeText={(value) => update('email', value)} />
        <Field label="Username" value={form.username} onChangeText={(value) => update('username', value)} />
        <View style={styles.row}>
          <View style={styles.halfWidth}>
            <Field label="First name" value={form.firstName} onChangeText={(value) => update('firstName', value)} autoCapitalize="words" />
          </View>
          <View style={styles.halfWidth}>
            <Field label="Last name" value={form.lastName} onChangeText={(value) => update('lastName', value)} autoCapitalize="words" />
          </View>
        </View>
        <Field label="Display name" value={form.displayName} onChangeText={(value) => update('displayName', value)} autoCapitalize="words" />
        <Field label="Password" value={form.password} onChangeText={(value) => update('password', value)} secureTextEntry />

        <View style={styles.actions}>
          <ActionButton
            label={isSubmitting ? 'Redeeming invite…' : 'Create account'}
            disabled={loading || Boolean(error) || !inviteOnlyEnabled || isSubmitting}
            onPress={() => void handleSubmit()}
          />
          <ActionButton label="Back to login" variant="secondary" onPress={() => router.back()} />
          {submitSuccess ? <ActionButton label="Sign in now" variant="secondary" onPress={() => void login()} /> : null}
        </View>
      </View>
    </ScrollView>
  )
}

const { color, radius, shadow, spacing } = tokens

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: color.surfaceAlt
  },
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: color.border,
    ...shadow.lg
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: color.text
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: color.textMuted
  },
  inlineState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  subtleText: {
    color: color.textMuted
  },
  notice: {
    color: color.textMuted,
    lineHeight: 20
  },
  errorText: {
    color: '#d22c2c',
    lineHeight: 20
  },
  successText: {
    color: '#17663a',
    lineHeight: 20
  },
  fieldGroup: {
    gap: spacing.xs
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: color.text
  },
  input: {
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: color.surfaceAlt,
    color: color.text
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md
  },
  halfWidth: {
    flex: 1
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.sm
  },
  button: {
    alignItems: 'center',
    borderRadius: 999,
    paddingVertical: spacing.sm
  },
  primaryButton: {
    backgroundColor: color.primary
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.surface
  },
  disabledButton: {
    opacity: 0.55
  },
  pressedButton: {
    opacity: 0.85
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '600'
  },
  secondaryButtonText: {
    color: color.text,
    fontWeight: '600'
  }
})
