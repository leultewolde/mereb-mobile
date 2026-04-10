export type MobileStage = 'local' | 'dev' | 'stg' | 'prd'

export type StageExtra = {
  APP_STAGE: MobileStage
  GRAPHQL_URL: string
  FLAGS_URL: string
  KEYCLOAK_URL: string
  KC_REALM: string
  KC_CLIENT_ID: string
  INVITE_REDEEM_URL: string
  API_URL: string
  APP_SCHEME: string
  EAS_PROJECT_ID: string
}

export type StageConfig = {
  stage: MobileStage
  appName: string
  appScheme: string
  iosBundleIdentifier: string
  androidPackage: string
  graphqlUrl: string
  flagsUrl: string
  inviteRedeemUrl: string
  apiUrl: string
  keycloak: {
    url: string
    realm: string
    clientId: string
  }
  easProjectId: string
  extra: StageExtra
}

type Environment = Record<string, string | undefined>

const sharedStages = require('./stages.shared.cjs') as {
  isMobileStage(value: string | undefined | null): value is MobileStage
  resolveMobileStage(value?: string | null): MobileStage
  resolveStageConfig(stage: MobileStage, environment?: Environment): StageConfig
}

export const isMobileStage = sharedStages.isMobileStage
export const resolveMobileStage = sharedStages.resolveMobileStage
export const resolveStageConfig = sharedStages.resolveStageConfig
