

export function isAuthenticationErrorMessage(message?: string): boolean {
    const normalized = message?.trim().toLowerCase()
    if (!normalized) {
        return false
    }

    return (
        normalized.includes('authentication required') ||
        normalized.includes('authorization required') ||
        normalized.includes('invalid token') ||
        normalized.includes('token is not active') ||
        normalized.includes('jwt') ||
        normalized.includes('token expired')
    )
}
