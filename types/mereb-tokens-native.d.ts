declare module '@mereb/tokens/native' {
  export type ShadowToken = {
    shadowColor: string
    shadowOpacity: number
    shadowRadius: number
    shadowOffset: {
      width: number
      height: number
    }
    elevation: number
  }

  export const tokens: {
    readonly color: {
      readonly surface: '#ffffff'
      readonly surfaceMuted: '#fff5f7'
      readonly surfaceSubdued: '#ffe9ee'
      readonly surfaceAlt: '#fff9fb'
      readonly surfaceInverse: '#141418'
      readonly text: '#211820'
      readonly textMuted: '#5f5560'
      readonly textSubdued: '#8a7a85'
      readonly primary: '#f43b57'
      readonly primaryEmphasis: '#d92c47'
      readonly primaryAccent: '#ff7a8e'
      readonly primarySoft: '#fff1f4'
      readonly primaryMuted: '#b9455a'
      readonly border: 'rgba(185, 69, 90, 0.14)'
      readonly borderStrong: '#e7c7cf'
      readonly neutralStrong: '#d5b6be'
      readonly neutralMuted: '#c7b0b7'
    }
    readonly spacing: {
      readonly none: 0
      readonly xxs: 4
      readonly xs: 6
      readonly sm: 8
      readonly smPlus: 10
      readonly md: 12
      readonly mdPlus: 14
      readonly lg: 16
      readonly xl: 20
      readonly xxl: 24
      readonly xxxl: 32
    }
    readonly radius: {
      readonly sm: 12
      readonly md: 16
      readonly lg: 20
      readonly xl: 24
      readonly pill: 999
    }
    readonly shadow: {
      readonly sm: ShadowToken
      readonly md: ShadowToken
      readonly lg: ShadowToken
    }
  }

  export type Tokens = typeof tokens
  export type ColorToken = keyof Tokens['color']
  export type SpacingToken = keyof Tokens['spacing']
  export type RadiusToken = keyof Tokens['radius']
  export type ShadowTokenName = keyof Tokens['shadow']

  export function getSpacing(name: SpacingToken): number
  export function getColor(name: ColorToken): string
  export function getRadius(name: RadiusToken): number
  export function getShadow(name: ShadowTokenName): ShadowToken
}
