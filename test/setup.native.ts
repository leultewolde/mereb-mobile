import Module from 'node:module'
import { TextDecoder, TextEncoder } from 'node:util'
import { afterEach, expect, vi } from 'vitest'
import * as reactNativeMock from './react-native.mock'
import { nativeTestState } from './react-native.mock'

const originalModuleLoad = Module._load
const originalConsoleError = console.error.bind(console)

Module._load = function patchedModuleLoad(request, parent, isMain) {
  if (request === 'react-native') {
    return reactNativeMock
  }

  return originalModuleLoad.call(this, request, parent, isMain)
}

if (!globalThis.TextEncoder) {
  globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder
}

if (!globalThis.TextDecoder) {
  globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder
}

vi.stubGlobal('__DEV__', false)
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
vi.stubGlobal('expect', expect)
console.error = (...args: unknown[]) => {
  const [firstArg] = args
  if (
    typeof firstArg === 'string' &&
    firstArg.includes('react-test-renderer is deprecated')
  ) {
    return
  }

  originalConsoleError(...args)
}
;(globalThis as Record<string, unknown>).__RN_TEST__ = {
  appStateListeners: nativeTestState.appStateListeners,
  openSettingsMock: nativeTestState.openSettingsMock,
  openUrlMock: nativeTestState.openUrlMock,
  platformState: nativeTestState.platformState
}

afterEach(() => {
  nativeTestState.appStateListeners.splice(0, nativeTestState.appStateListeners.length)
  nativeTestState.openSettingsMock.mockClear()
  nativeTestState.openUrlMock.mockClear()
  nativeTestState.platformState.OS = 'ios'
})
