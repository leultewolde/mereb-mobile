import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const coverageInclude = [
  'app.config.ts',
  'config/**/*.ts',
  'monitoring/**/*.ts',
  'providers/**/*.tsx',
  'app/settings/**/*.tsx'
]

const coverageExclude = [
  '**/*.test.ts',
  '**/*.test.tsx',
  'config/**/*.d.ts'
]

export default defineConfig({
  resolve: {
    alias: {
      'react-native': fileURLToPath(
        new URL('./test/react-native.mock.tsx', import.meta.url)
      )
    }
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react'
  },
  test: {
    environment: 'node',
    server: {
      deps: {
        inline: ['react-native', '@testing-library/react-native']
      }
    },
    setupFiles: [fileURLToPath(new URL('./test/setup.native.ts', import.meta.url))],
    include: [
      'config/**/*.test.ts',
      'monitoring/**/*.test.ts',
      'providers/**/*.test.tsx',
      'app/**/*.test.tsx',
      'app.config.test.ts'
    ],
    restoreMocks: true,
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: coverageInclude,
      exclude: coverageExclude,
      thresholds: {
        statements: 90,
        functions: 90,
        lines: 90,
        branches: 80
      }
    }
  }
})
