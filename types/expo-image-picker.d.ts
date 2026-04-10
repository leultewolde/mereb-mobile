declare module 'expo-image-picker' {
  export type ImagePickerAsset = {
    uri: string
    fileName?: string | null
    fileSize?: number | null
    mimeType?: string | null
  }

  export type ImagePickerSuccessResult = {
    canceled: false
    assets: ImagePickerAsset[]
  }

  export type ImagePickerCanceledResult = {
    canceled: true
    assets: null
  }

  export type ImagePickerResult = ImagePickerSuccessResult | ImagePickerCanceledResult

  export type MediaType = 'images' | 'videos' | 'livePhotos'

  export function launchImageLibraryAsync(options?: {
    allowsEditing?: boolean
    quality?: number
    mediaTypes?: MediaType | MediaType[]
  }): Promise<ImagePickerResult>
}
