import * as SecureStore from 'expo-secure-store'

export const TOKEN_STORAGE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.trim().toLowerCase()
  }

  if (typeof error === 'string') {
    return error.trim().toLowerCase()
  }

  return ''
}

export function isSecureStoreInteractionNotAllowedError(error: unknown): boolean {
  const message = extractErrorMessage(error)
  return (
    message.includes('user interaction is not allowed') ||
    message.includes('errsecinteractionnotallowed')
  )
}

export async function getSecureStoreItemSafe(
  key: string,
  onInteractionNotAllowed?: (error: unknown) => void
): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key)
  } catch (error) {
    if (!isSecureStoreInteractionNotAllowedError(error)) {
      throw error
    }

    onInteractionNotAllowed?.(error)
    return null
  }
}

export async function setSecureStoreToken(
  key: string,
  value: string
): Promise<void> {
  await SecureStore.setItemAsync(key, value, TOKEN_STORAGE_OPTIONS)
}
