import type { ExpoConfig } from 'expo/config'
const { resolveMobileStage, resolveStageConfig } = require('./config/stages.shared.cjs') as {
  resolveMobileStage(value?: string | null): 'local' | 'dev' | 'stg' | 'prd'
  resolveStageConfig(
    stage: 'local' | 'dev' | 'stg' | 'prd',
    environment?: Record<string, string | undefined>
  ): {
    appName: string
    appScheme: string
    iosBundleIdentifier: string
    androidPackage: string
    extra: Record<string, string>
  }
}

const stage = resolveMobileStage(process.env.APP_STAGE)
const stageConfig = resolveStageConfig(stage, process.env)

const config: ExpoConfig = {
  name: stageConfig.appName,
  slug: 'mereb-social',
  scheme: stageConfig.appScheme,
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#FFF9FB'
  },
  ios: {
    bundleIdentifier: stageConfig.iosBundleIdentifier,
    supportsTablet: false
  },
  android: {
    package: stageConfig.androidPackage,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#FFF1F4'
    }
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/favicon.png'
  },
  experiments: {
    autolinkingModuleResolution: true,
    tsconfigPaths: true
  },
  plugins: [
    'expo-asset',
    'expo-font',
    'expo-router',
    'expo-secure-store',
    [
      'expo-build-properties',
      {
        ios: {
          useFrameworks: 'static'
        }
      }
    ]
  ],
  extra: stageConfig.extra
}

export default config
