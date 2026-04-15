import { waitFor } from '@testing-library/react-native'

export async function flushMicrotasks(turns = 3): Promise<void> {
  for (let index = 0; index < turns; index += 1) {
    await Promise.resolve()
  }
}

export async function settle(turns = 3): Promise<void> {
  await flushMicrotasks(turns)
}

export async function waitForExpectation(
  assertion: () => void,
  attempts = 40
): Promise<void> {
  await waitFor(assertion, {
    timeout: attempts * 50,
    interval: 50
  })
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll(/=+$/g, '')
}

export function createJwt(payload: Record<string, unknown>): string {
  const header = encodeBase64Url(JSON.stringify({ alg: 'none', typ: 'JWT' }))
  const body = encodeBase64Url(JSON.stringify(payload))
  return `${header}.${body}.signature`
}

export function createJsonResponse(
  payload: unknown,
  options?: {
    status?: number
    headers?: Record<string, string>
  }
) {
  const status = options?.status ?? 200
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...options?.headers
  }

  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name: string) {
        return headers[name.toLowerCase()] ?? headers[name] ?? null
      }
    },
    json: async () => payload,
    clone() {
      return createJsonResponse(payload, { status, headers })
    }
  }
}
