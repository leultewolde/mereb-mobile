import React from 'react'
import { vi } from 'vitest'

type AppStateListener = (nextState: string) => void

type NativeTestState = {
  appStateListeners: AppStateListener[]
  openSettingsMock: ReturnType<typeof vi.fn>
  openUrlMock: ReturnType<typeof vi.fn>
  platformState: {
    OS: string
  }
}

const globalState = globalThis as typeof globalThis & {
  __RN_NATIVE_TEST_STATE__?: NativeTestState
}

export const nativeTestState =
  globalState.__RN_NATIVE_TEST_STATE__ ??
  (globalState.__RN_NATIVE_TEST_STATE__ = {
    appStateListeners: [],
    openSettingsMock: vi.fn(async () => undefined),
    openUrlMock: vi.fn(async () => undefined),
    platformState: {
      OS: 'ios'
    }
  })

function createHostComponent(name: string, defaultProps?: Record<string, unknown>) {
  function HostComponent(props: Record<string, unknown>) {
    return React.createElement(
      name,
      {
        ...defaultProps,
        ...props
      },
      props.children as React.ReactNode
    )
  }

  HostComponent.displayName = name
  return HostComponent
}

export const AppState = {
  addEventListener: vi.fn((eventType: string, listener: AppStateListener) => {
    if (eventType === 'change') {
      nativeTestState.appStateListeners.push(listener)
    }

    return {
      remove: vi.fn(() => {
        const index = nativeTestState.appStateListeners.indexOf(listener)
        if (index >= 0) {
          nativeTestState.appStateListeners.splice(index, 1)
        }
      })
    }
  })
}

export const Platform = {
  get OS() {
    return nativeTestState.platformState.OS
  },
  set OS(value: string) {
    nativeTestState.platformState.OS = value
  },
  select<T>(options: { ios?: T; android?: T; default?: T }) {
    return options[nativeTestState.platformState.OS as 'ios' | 'android'] ?? options.default
  }
}

export const Linking = {
  openSettings: nativeTestState.openSettingsMock,
  openURL: nativeTestState.openUrlMock
}

export const ActivityIndicator = createHostComponent('ActivityIndicator')
export const KeyboardAvoidingView = createHostComponent('KeyboardAvoidingView')
export const Pressable = createHostComponent('Pressable')
export const RefreshControl = createHostComponent('RefreshControl')
export const ScrollView = createHostComponent('ScrollView')
export const Switch = createHostComponent('Switch', {
  accessibilityRole: 'switch'
})
export const Text = createHostComponent('Text')
export const TextInput = createHostComponent('TextInput')
export const View = createHostComponent('View')

export const StyleSheet = {
  create: <T,>(styles: T) => styles,
  flatten: <T,>(styles: T) => styles
}
