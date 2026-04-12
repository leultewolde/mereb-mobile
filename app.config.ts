import type { ExpoConfig } from 'expo/config'

type MobileStage = 'local' | 'dev' | 'stg' | 'prd'

const { resolveMobileStage, resolveStageConfig } = require('./config/stages.shared.cjs') as {
  resolveMobileStage(value?: string | null): MobileStage
  resolveStageConfig(
    stage: MobileStage,
    environment?: Record<string, string | undefined>
  ): {
    stage: MobileStage
    appName: string
    appScheme: string
    iosBundleIdentifier: string
    androidPackage: string
    graphqlUrl: string
    flagsUrl: string
    inviteRedeemUrl: string
    apiUrl: string
    privacyUrl: string
    supportUrl: string
    keycloak: {
      url: string
      realm: string
      clientId: string
    }
    easProjectId?: string
    extra: Record<string, string>
  }
}

const stage = resolveMobileStage(process.env.APP_STAGE)
const stageConfig = resolveStageConfig(stage, process.env)
const associatedDomain = stage === 'local' ? undefined : new URL(stageConfig.privacyUrl).host
const androidIntentFilters =
  associatedDomain
    ? [
        {
          action: 'VIEW',
          autoVerify: true,
          category: ['BROWSABLE', 'DEFAULT'],
          data: [
            {
              scheme: 'https',
              host: associatedDomain,
              pathPrefix: '/'
            }
          ]
        }
      ]
    : undefined
const iosAssociatedDomains = associatedDomain ? [`applinks:${associatedDomain}`] : undefined

const config: ExpoConfig = {
  owner: 'rmhy',
  name: stageConfig.appName,
  slug: 'mereb-social',
  scheme: stageConfig.appScheme,
  version: '1.0.0',
  description: 'Private team network for updates, profiles, and messaging across the Mereb platform.',
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
    supportsTablet: false,
    associatedDomains: iosAssociatedDomains,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false
    }
  },
  android: {
    package: stageConfig.androidPackage,
    blockedPermissions: ['android.permission.RECORD_AUDIO'],
    intentFilters: androidIntentFilters,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#F43B57'
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
    'expo-system-ui',
    [
      'expo-image-picker',
      {
        photosPermission: 'Allow Mereb Social to access your photos so you can update your avatar and attach images to posts.',
        cameraPermission: false,
        microphonePermission: false
      }
    ],
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
  extra: {
    ...stageConfig.extra,
    ...(stageConfig.easProjectId
      ? {
          eas: {
            projectId: stageConfig.easProjectId
          }
        }
      : {})
  }
}

export default config
