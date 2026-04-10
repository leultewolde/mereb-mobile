const { defineConfig } = require('eslint/config')
const expoConfig = require('eslint-config-expo/flat')

module.exports = defineConfig([
  expoConfig,
  {
    files: ['app.config.ts', 'config/stages.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off'
    }
  }
])
